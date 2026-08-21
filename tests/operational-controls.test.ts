import { describe, expect, it } from "vitest";
import { getCustomerDebtAlerts } from "../src/modules/operations/debt-reconciliation";
import { createRoleActor, runOperation } from "../src/modules/operations/commands";
import { getInventoryStockAlerts } from "../src/modules/operations/inventory-alerts";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { stockBalance } from "../src/modules/operations/selectors";
import type { OperationsActor, OperationsAttachment, OperationsState } from "../src/modules/operations/types";

const now = "2026-07-28T08:00:00.000Z";

function run(
  state: OperationsState,
  operation: Parameters<typeof runOperation>[0]["operation"],
  actor: OperationsActor,
  idempotencyKey: string,
  targetId?: string,
  options?: Parameters<typeof runOperation>[0]["options"]
) {
  return runOperation({ state, operation, actor, now, idempotencyKey, targetId, options }).state;
}

function owner() {
  return createRoleActor("owner");
}

function worker(state: OperationsState) {
  const employee = state.employees.find((item) => item.roleType === "worker");
  if (!employee) throw new Error("Missing worker fixture.");
  return { ...createRoleActor("worker"), id: "user-worker-confirmation", displayName: employee.displayName, employeeId: employee.id };
}

function customer(state: OperationsState) {
  const order = state.salesOrders[0];
  if (!order) throw new Error("Missing sales order fixture.");
  return { ...createRoleActor("customer"), id: "user-customer-confirmation", customerId: order.customerId };
}

function image(actor: OperationsActor, id: string): OperationsAttachment {
  return {
    id,
    fileName: "receipt.jpg",
    contentType: "image/jpeg",
    size: 128,
    sha256: "a".repeat(64),
    uploadedBy: actor.id,
    uploadedAt: now
  };
}

function inTransit() {
  let state = createInitialOperationsState();
  const job = state.deliveryJobs[0];
  if (!job) throw new Error("Missing delivery fixture.");
  const order = state.salesOrders.find((item) => item.id === job.salesOrderId);
  if (!order) throw new Error("Missing delivery order fixture.");
  order.commercialTerms = { paymentTermDays: 7, dueDateBasis: "fulfillment", capturedAt: now };
  state = run(state, "confirmSalesOrder", owner(), "controls-confirm-001", order.id);
  state = run(state, "allocateSalesSources", owner(), "controls-allocate-001", order.id);
  const warehouseLine = state.salesOrders.find((item) => item.id === order.id)?.lines.find((line) => line.sourceType === "warehouse");
  if (!warehouseLine) throw new Error("Missing warehouse delivery line fixture.");
  state = run(state, "postGoodsReceipt", owner(), "controls-receipt-001", "po-001-line-cement", { quantity: warehouseLine.quantity });
  state = run(state, "startDeliveryLoading", owner(), "controls-loading-001", job.id);
  return run(state, "dispatchDelivery", owner(), "controls-dispatch-001", job.id);
}

describe("operational price, delivery, stock, and debt controls", () => {
  it("keeps immutable product price history and leaves existing order snapshots unchanged", () => {
    let state = createInitialOperationsState();
    const product = state.productUnits[0]!;
    const existingLine = state.salesOrders[0]!.lines.find((line) => line.productUnitId === product.id);
    const previousOrderPrice = existingLine?.unitPrice;
    const nextSalePrice = (product.salePrice ?? 0) + 12_000;

    state = run(state, "updateProductCommercialPolicy", owner(), "price-policy-001", product.id, {
      salePrice: nextSalePrice,
      saleTaxRate: product.saleTaxRate,
      targetMarginRate: 0.15,
      standardLeadTimeDays: 2,
      reason: "Cập nhật bảng giá tháng mới"
    });
    const retry = runOperation({
      state,
      operation: "updateProductCommercialPolicy",
      actor: owner(),
      now,
      idempotencyKey: "price-policy-001",
      targetId: product.id,
      options: { salePrice: nextSalePrice, reason: "Cập nhật bảng giá tháng mới" }
    });

    expect(state.productUnits[0]?.salePrice).toBe(nextSalePrice);
    expect(state.productUnits[0]?.priceHistory).toHaveLength(1);
    expect(state.productUnits[0]?.priceHistory?.[0]).toMatchObject({
      previous: { salePrice: product.salePrice },
      next: { salePrice: nextSalePrice },
      changedBy: owner().id
    });
    expect(existingLine?.unitPrice).toBe(previousOrderPrice);
    expect(retry.severity).toBe("warning");
  });

  it("stores explicit portal visibility/orderability policy through the authorized server operation", () => {
    let state = createInitialOperationsState();
    state = run(state, "updateProductCommercialPolicy", owner(), "portal-policy-fields", "pu-cement-bag", {
      visibleOnCustomerPortal: false,
      orderableOnline: false,
      reason: "Tạm ẩn để kiểm tra tồn và báo giá"
    });

    expect(state.productUnits[0]).toMatchObject({ visibleOnCustomerPortal: false, orderableOnline: false });
    expect(() => runOperation({
      state: createInitialOperationsState(),
      operation: "updateProductCommercialPolicy",
      actor: customer(createInitialOperationsState()),
      now,
      idempotencyKey: "portal-policy-unauthorized",
      targetId: "pu-cement-bag",
      options: { visibleOnCustomerPortal: false, reason: "Không được phép" }
    })).toThrow(/không có quyền/i);
  });

  it("requires customer photo confirmation and ignores a worker-supplied delivery quantity", () => {
    let state = inTransit();
    const deliveryWorker = worker(state);
    const deliveryCustomer = customer(state);
    const job = state.deliveryJobs[0]!;
    const warehouseLine = state.salesOrders[0]!.lines.find((line) => line.sourceType === "warehouse")!;
    const stockBefore = stockBalance(state, warehouseLine.warehouseId!, warehouseLine.productUnitId);

    state = run(state, "submitDeliveryCompletion", deliveryWorker, "worker-submit-full", job.id, {
      recipientName: "Người nhận tại công trình",
      evidence: "Đã bàn giao, chờ khách chụp ảnh",
      lineQuantities: { [warehouseLine.id]: 1 },
      attachments: [image(deliveryWorker, "11111111-1111-4111-8111-111111111111")]
    });
    expect(state.approvalRequests[0]?.lineQuantities?.[warehouseLine.id]).toBe(warehouseLine.quantity);
    expect(() => run(state, "approveDeliveryCompletion", owner(), "approve-without-customer", state.approvalRequests[0]?.id)).toThrow(/ảnh xác nhận/i);
    expect(stockBalance(state, warehouseLine.warehouseId!, warehouseLine.productUnitId)).toBe(stockBefore);

    state = run(state, "confirmCustomerDeliveryReceipt", deliveryCustomer, "customer-receipt-photo", job.id, {
      attachments: [image(deliveryCustomer, "22222222-2222-4222-8222-222222222222")]
    });
    state = run(state, "approveDeliveryCompletion", owner(), "approve-after-customer", state.approvalRequests[0]?.id);

    expect(state.deliveryJobs[0]?.customerConfirmation?.status).toBe("confirmed");
    expect(state.salesOrders[0]?.lines.find((line) => line.id === warehouseLine.id)?.deliveredQuantity).toBe(warehouseLine.quantity);
    expect(state.customerLedgerEntries.at(-1)?.dueDate).toBe("2026-08-04");
    expect(getCustomerDebtAlerts(state, "2026-07-28T08:00:00.000Z")).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "due_soon_7", collectionOwnerEmployeeId: undefined })
    ]));
  });

  it("posts a partial delivery only after an internal quantity-change approval", () => {
    let state = inTransit();
    const deliveryWorker = worker(state);
    const deliveryCustomer = customer(state);
    const job = state.deliveryJobs[0]!;
    const line = state.salesOrders[0]!.lines.find((item) => item.sourceType === "warehouse")!;
    const requestedQuantity = line.quantity - 1;

    state = run(state, "requestDeliveryQuantityChange", deliveryWorker, "quantity-request-001", job.id, {
      lineQuantities: { [line.id]: requestedQuantity },
      reason: "Khách chỉ nhận một phần hàng tại công trình",
      attachments: [image(deliveryWorker, "33333333-3333-4333-833333333333")]
    });
    expect(() => run(state, "submitDeliveryCompletion", deliveryWorker, "submit-while-pending", job.id, {
      recipientName: "Người nhận",
      evidence: "Đã giao",
      attachments: [image(deliveryWorker, "44444444-4444-4444-844444444444")]
    })).toThrow(/chờ.*duyệt/i);

    state = run(state, "approveDeliveryQuantityChange", owner(), "quantity-approve-001", job.id);
    state = run(state, "submitDeliveryCompletion", deliveryWorker, "worker-submit-partial", job.id, {
      recipientName: "Người nhận",
      evidence: "Đã giao một phần",
      attachments: [image(deliveryWorker, "55555555-5555-4555-855555555555")]
    });
    state = run(state, "confirmCustomerDeliveryReceipt", deliveryCustomer, "customer-partial-photo", job.id, {
      attachments: [image(deliveryCustomer, "66666666-6666-4666-866666666666")]
    });
    state = run(state, "approveDeliveryCompletion", owner(), "approve-partial", state.approvalRequests[0]?.id);

    expect(state.salesOrders[0]?.lines.find((item) => item.id === line.id)?.deliveredQuantity).toBe(requestedQuantity);
    expect(state.salesOrders[0]?.status).toBe("partially_delivered");
    expect(state.inventoryMovements.filter((movement) => movement.movementType === "issue")).toHaveLength(1);
  });

  it("derives stock and collection alerts without a mutable balance field", () => {
    let state = createInitialOperationsState();
    const product = state.productUnits[0]!;
    const warehouse = state.warehouses[0]!;
    const quantity = stockBalance(state, warehouse.id, product.id);
    product.reorderPolicies = [{ warehouseId: warehouse.id, minimumQuantity: quantity + 1, updatedAt: now, updatedBy: owner().id }];
    const customerRecord = state.customers[0]!;
    const collector = state.employees.find((employee) => employee.status === "active")!;

    state = run(state, "assignCustomerCollectionOwner", owner(), "collector-assignment-001", customerRecord.id, { employeeId: collector.id });
    state = run(state, "recordCustomerCollectionFollowUp", owner(), "collector-followup-001", customerRecord.id, {
      followUpStatus: "contacted",
      reason: "Đã gọi nhắc khách chuẩn bị thanh toán"
    });

    expect(getInventoryStockAlerts(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ productUnitId: product.id, warehouseId: warehouse.id })
    ]));
    expect(state.customers[0]?.collectionOwnerEmployeeId).toBe(collector.id);
    expect(state.customers[0]?.collectionFollowUps).toEqual([
      expect.objectContaining({ status: "contacted", recordedBy: owner().id })
    ]);
  });
});
