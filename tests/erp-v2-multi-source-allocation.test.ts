import { describe, expect, it } from "vitest";
import { assertOperationsInvariants } from "../src/modules/operations/invariants";
import { createRoleActor } from "../src/modules/operations/identity";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { runOperation } from "../src/modules/operations/commands";
import { stockBalance } from "../src/modules/operations/selectors";
import type { OperationName, OperationOptions, OperationsActor, OperationsState, SalesOrder } from "../src/modules/operations/types";
import { ErpV2CommandService } from "../src/server/application/erp-v2-command-service";
import { MemoryOperationsBackend } from "../src/server/infrastructure/memory-operations-backend";

const now = "2026-08-21T09:00:00.000+07:00";

function cleanState() {
  const state = createInitialOperationsState();
  state.salesOrders = [];
  state.purchaseOrders = [];
  state.inventoryMovements = [];
  state.deliveryJobs = [];
  state.approvalRequests = [];
  state.customerLedgerEntries = [];
  state.supplierLedgerEntries = [];
  state.processedOperations = [];
  state.auditLogs = [];
  return state;
}

function order(quantity: number): SalesOrder {
  return {
    id: "so-v2-source",
    documentNo: "SO-V2-SOURCE",
    customerId: "cus-minh-anh",
    orderDate: "2026-08-21",
    status: "confirmed",
    version: 1,
    currency: "VND",
    lines: [{
      id: "so-v2-source-line",
      productUnitId: "pu-brick-vien",
      quantity,
      deliveredQuantity: 0,
      unitPrice: 2_000,
      taxRate: 0.08
    }]
  };
}

function run(
  state: OperationsState,
  operation: OperationName,
  actor: OperationsActor,
  key: string,
  targetId?: string,
  options?: OperationOptions
) {
  return runOperation({ state, operation, actor, now, idempotencyKey: `v2-source-${key}`, targetId, options }).state;
}

describe("ERP V2 multi-source sales allocation", () => {
  it("splits a sales line by configured warehouse order and then direct supplier", () => {
    let state = cleanState();
    state.inventoryMovements.push(
      { id: "im-main", movementType: "opening", sourceDocument: "OPEN", postingKey: "open-main", warehouseId: "wh-main", productUnitId: "pu-brick-vien", quantity: 4, unitCost: 1_000, postedAt: now },
      { id: "im-yard", movementType: "opening", sourceDocument: "OPEN", postingKey: "open-yard", warehouseId: "wh-yard", productUnitId: "pu-brick-vien", quantity: 3, unitCost: 1_100, postedAt: now }
    );
    state.purchaseOrders.push({
      id: "po-inbound-v2",
      documentNo: "PO-INBOUND-V2",
      supplierId: "sup-hoang-thach",
      orderDate: "2026-08-21",
      status: "ordered",
      lines: [{
        id: "po-inbound-v2-line",
        productUnitId: "pu-brick-vien",
        orderedQuantity: 2,
        receivedQuantity: 0,
        unitCost: 1_150,
        taxRate: 0.08,
        destinationType: "warehouse",
        warehouseId: "wh-main"
      }]
    }, {
      id: "po-direct-v2",
      documentNo: "PO-DIRECT-V2",
      supplierId: "sup-hoang-thach",
      orderDate: "2026-08-21",
      status: "ordered",
      lines: [{
        id: "po-direct-v2-line",
        productUnitId: "pu-brick-vien",
        orderedQuantity: 3,
        receivedQuantity: 0,
        unitCost: 1_200,
        taxRate: 0.08,
        destinationType: "customer_direct",
        customerId: "cus-minh-anh"
      }]
    });
    state.salesOrders.push(order(12));

    state = run(state, "allocateSalesSources", createRoleActor("sales"), "allocate", "so-v2-source", { expectedVersion: 1 });

    expect(state.salesOrders[0]?.lines[0]?.allocations).toMatchObject([
      { sourceType: "warehouse", warehouseId: "wh-main", allocatedQuantity: 4 },
      { sourceType: "warehouse", warehouseId: "wh-yard", allocatedQuantity: 3 },
      { sourceType: "warehouse", warehouseId: "wh-main", purchaseOrderLineId: "po-inbound-v2-line", allocatedQuantity: 2 },
      { sourceType: "direct_supplier", purchaseOrderLineId: "po-direct-v2-line", allocatedQuantity: 3 }
    ]);
    expect(state.purchaseOrders[1]?.lines[0]?.salesOrderLineId).toBe("so-v2-source-line");
    expect(state.salesOrders[0]?.status).toBe("allocated");
    assertOperationsInvariants(state);
  });

  it("requires a Warehouse or Dispatcher request and Owner approval before an approved negative issue", () => {
    let state = cleanState();
    state.inventoryMovements.push({
      id: "im-negative-base",
      movementType: "opening",
      sourceDocument: "OPEN",
      postingKey: "open-negative-base",
      warehouseId: "wh-main",
      productUnitId: "pu-brick-vien",
      quantity: 5,
      unitCost: 1_000,
      postedAt: now
    });
    state.salesOrders.push(order(10));

    expect(() => run(state, "allocateSalesSources", createRoleActor("sales"), "blocked", "so-v2-source", { expectedVersion: 1 })).toThrow("yêu cầu tồn âm");
    expect(state.salesOrders[0]?.status).toBe("confirmed");
    expect(state.salesOrders[0]?.lines[0]?.allocations).toBeUndefined();

    state = run(state, "requestNegativeStockOverride", createRoleActor("warehouse"), "request", "so-v2-source", {
      expectedVersion: 1,
      warehouseId: "wh-main",
      reason: "Tồn thực tế đang chờ kiểm đếm cuối ca"
    });
    const request = state.approvalRequests[0];
    expect(request).toMatchObject({ type: "negative_stock_override", status: "pending", targetId: "so-v2-source" });
    expect(state.inventoryMovements).toHaveLength(1);
    expect(state.salesOrders[0]?.status).toBe("confirmed");

    expect(() => run(state, "approveNegativeStockOverride", createRoleActor("accountant"), "accountant-denied", request?.id)).toThrow();
    expect(() => run(state, "approveNegativeStockOverride", createRoleActor("administrator"), "admin-denied", request?.id)).toThrow();

    state = run(state, "approveNegativeStockOverride", createRoleActor("owner"), "approve", request?.id);
    const allocations = state.salesOrders[0]?.lines[0]?.allocations ?? [];
    expect(allocations).toMatchObject([
      { sourceType: "warehouse", warehouseId: "wh-main", allocatedQuantity: 5 },
      { sourceType: "warehouse", warehouseId: "wh-main", allocatedQuantity: 5, negativeStockOverrideRequestId: request?.id }
    ]);
    expect(state.inventoryMovements).toHaveLength(1);

    state.deliveryJobs.push({
      id: "dj-negative",
      documentNo: "GH-NEGATIVE",
      salesOrderId: "so-v2-source",
      driverId: "emp-driver-dung",
      vehicleId: "vehicle-truck-01",
      helperIds: [],
      plannedDate: "2026-08-21",
      status: "in_transit",
      allocationIds: allocations.map((allocation) => allocation.id)
    });
    state = run(state, "completeDelivery", createRoleActor("owner"), "deliver", "dj-negative", {
      recipientName: "Khách nhận",
      evidence: "Biên bản giao đủ hàng",
      reason: "Chủ cửa hàng miễn ảnh vì giao trực tiếp tại công trình"
    });

    expect(stockBalance(state, "wh-main", "pu-brick-vien")).toBe(-5);
    expect(state.inventoryMovements.filter((movement) => movement.movementType === "issue")).toHaveLength(2);
    expect(state.inventoryMovements.some((movement) => movement.negativeStockOverrideRequestId === request?.id)).toBe(true);
    expect(state.salesOrders[0]?.status).toBe("delivered");
    expect(state.customerLedgerEntries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(21_600);
    assertOperationsInvariants(state);
  });

  it("keeps the order unallocated when Owner rejects the negative-stock request", () => {
    let state = cleanState();
    state.salesOrders.push(order(2));
    state = run(state, "requestNegativeStockOverride", createRoleActor("dispatcher"), "request-reject", "so-v2-source", {
      expectedVersion: 1,
      warehouseId: "wh-main",
      reason: "Khách cần giao gấp trước giờ xe chạy"
    });
    state = run(state, "rejectNegativeStockOverride", createRoleActor("owner"), "reject", state.approvalRequests[0]?.id, {
      reason: "Chưa có căn cứ tồn thực tế để cho phép"
    });
    expect(state.approvalRequests[0]?.status).toBe("rejected");
    expect(state.salesOrders[0]?.status).toBe("confirmed");
    expect(state.salesOrders[0]?.lines[0]?.allocations).toBeUndefined();
    expect(state.inventoryMovements).toHaveLength(0);
    assertOperationsInvariants(state);
  });

  it("serializes concurrent allocation commands and rejects the stale version", async () => {
    const backend = new MemoryOperationsBackend();
    const service = new ErpV2CommandService(backend);
    const actor = createRoleActor("owner");
    const confirmed = await service.execute({ operation: "confirmSalesOrder", actor, now, targetId: "so-001", idempotencyKey: "v2-source-concurrent-confirm" });
    const version = confirmed.state.salesOrders.find((item) => item.id === "so-001")!.version;

    const outcomes = await Promise.allSettled([
      service.execute({ operation: "allocateSalesSources", actor, now, targetId: "so-001", options: { expectedVersion: version }, idempotencyKey: "v2-source-concurrent-a" }),
      service.execute({ operation: "allocateSalesSources", actor, now, targetId: "so-001", options: { expectedVersion: version }, idempotencyKey: "v2-source-concurrent-b" })
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(backend.getState().auditLogs.filter((log) => log.action === "allocateSalesSources")).toHaveLength(1);
    expect(backend.getState().salesOrders.find((item) => item.id === "so-001")?.status).toBe("allocated");
  });
});
