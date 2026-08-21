import { describe, expect, it } from "vitest";
import { runCreateCommand } from "../src/modules/operations/create-commands";
import { createRoleActor } from "../src/modules/operations/identity";
import { assertOperationsInvariants } from "../src/modules/operations/invariants";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { runOperation } from "../src/modules/operations/service";

function expectOperationError(operation: () => unknown, code: string, status: number) {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code, status });
}

const now = "2026-07-27T08:00:00.000Z";

function customerActor(customerId = "cus-minh-anh") {
  return { ...createRoleActor("customer"), id: "customer-portal-user", customerId };
}

function supplierActor(supplierId = "sup-hoang-thach") {
  return { ...createRoleActor("supplier"), id: "supplier-portal-user", supplierId };
}

describe("partner portal commands", () => {
  it("creates a customer order with server-owned price snapshots and idempotency", () => {
    const state = createInitialOperationsState();
    const initialInventoryMovementCount = state.inventoryMovements.length;
    const initialCustomerLedgerCount = state.customerLedgerEntries.length;
    const product = state.productUnits.find((item) =>
      item.salePrice !== undefined && item.saleTaxRate !== undefined && state.inventoryMovements.some((movement) => movement.productUnitId === item.id && movement.quantity >= 3)
    )!;
    const command = {
      type: "createCustomerPortalSalesOrder" as const,
      customerId: "cus-minh-anh",
      deliveryAddress: "12 Đường Lê Lợi, phường 1, TP. Vũng Tàu",
      paymentMethod: "transfer" as const,
      lines: [{ productUnitId: product.id, quantity: 3 }]
    };
    const first = runCreateCommand({ state, command, actor: customerActor(), now, idempotencyKey: "customer-portal-order-001" });
    const order = first.state.salesOrders.at(-1)!;
    const retry = runCreateCommand({ state: first.state, command, actor: customerActor(), now, idempotencyKey: "customer-portal-order-001" });

    expect(order.lines[0]).toMatchObject({ unitPrice: product.salePrice, taxRate: product.saleTaxRate, deliveredQuantity: 0 });
    expect(order.paymentMethod).toBe("transfer");
    expect(retry.severity).toBe("warning");
    expect(retry.state.salesOrders).toHaveLength(first.state.salesOrders.length);
    expect(retry.state.inventoryMovements).toHaveLength(initialInventoryMovementCount);
    expect(retry.state.customerLedgerEntries).toHaveLength(initialCustomerLedgerCount);
  });

  it("rejects a customer attempting to create an order for another party and enforces credit at confirmation", () => {
    const state = createInitialOperationsState();
    const product = state.productUnits.find((item) =>
      item.salePrice !== undefined && item.saleTaxRate !== undefined && state.inventoryMovements.some((movement) => movement.productUnitId === item.id && movement.quantity >= 1)
    )!;
    const command = { type: "createCustomerPortalSalesOrder" as const, customerId: "cus-minh-anh", deliveryAddress: "12 Đường Lê Lợi, phường 1, TP. Vũng Tàu", paymentMethod: "credit_requested" as const, lines: [{ productUnitId: product.id, quantity: 1 }] };
    expect(() => runCreateCommand({ state, command, actor: customerActor("cus-tuan-lai"), now, idempotencyKey: "customer-cross-party-001" })).toThrow("khách hàng khác");

    state.customers.find((item) => item.id === "cus-minh-anh")!.creditLimit = 1;
    const created = runCreateCommand({ state, command, actor: customerActor(), now, idempotencyKey: "customer-credit-order-001" });
    expectOperationError(
      () => runOperation({ state: created.state, operation: "confirmSalesOrder", actor: createRoleActor("owner"), now, idempotencyKey: "customer-credit-confirm-001", targetId: created.state.salesOrders.at(-1)?.id }),
      "CREDIT_LIMIT_EXCEEDED",
      412
    );
  });

  it("stores customer payment proof without creating cash or receivable postings", () => {
    let state = createInitialOperationsState();
    const product = state.productUnits.find((item) =>
      item.salePrice !== undefined && item.saleTaxRate !== undefined && state.inventoryMovements.some((movement) => movement.productUnitId === item.id && movement.quantity >= 1)
    )!;
    const order = runCreateCommand({ state, command: { type: "createCustomerPortalSalesOrder", customerId: "cus-minh-anh", deliveryAddress: "12 Đường Lê Lợi, phường 1, TP. Vũng Tàu", paymentMethod: "transfer", lines: [{ productUnitId: product.id, quantity: 1 }] }, actor: customerActor(), now, idempotencyKey: "customer-proof-order-001" });
    state = runOperation({ state: order.state, operation: "confirmSalesOrder", actor: createRoleActor("owner"), now, idempotencyKey: "customer-proof-confirm-001", targetId: order.state.salesOrders.at(-1)?.id }).state;
    const proof = runCreateCommand({
      state,
      command: { type: "submitCustomerPaymentProof", customerId: "cus-minh-anh", salesOrderId: state.salesOrders.at(-1)!.id, amount: 1, transferReference: "UAT-TRANSFER-001", attachments: [{ id: "11111111-1111-4111-8111-111111111111", fileName: "chuyen-khoan.pdf", contentType: "application/pdf", size: 128, sha256: "a".repeat(64), uploadedBy: "customer-portal-user", uploadedAt: now }] },
      actor: customerActor(), now, idempotencyKey: "customer-proof-submit-001"
    });
    expect(proof.state.customerPaymentProofRequests).toHaveLength(1);
    expect(proof.state.cashTransactions).toHaveLength(0);
    expect(proof.state.customerLedgerEntries).toHaveLength(0);
    expect(proof.state.auditLogs[0]).toMatchObject({ action: "submitCustomerPaymentProof" });
    assertOperationsInvariants(proof.state);
  });

  it("lets only the linked supplier submit a response and delivery notice without posting a receipt", () => {
    const state = createInitialOperationsState();
    const initialInventoryMovementCount = state.inventoryMovements.length;
    const initialSupplierLedgerCount = state.supplierLedgerEntries.length;
    const order = state.purchaseOrders[0]!;
    order.status = "ordered";
    expect(() => runCreateCommand({ state, command: { type: "submitSupplierPurchaseOrderResponse", supplierId: order.supplierId, purchaseOrderId: order.id, status: "available" }, actor: supplierActor("sup-cat-da-hai-an"), now, idempotencyKey: "supplier-cross-party-001" })).toThrow("nhà cung cấp khác");

    const response = runCreateCommand({ state, command: { type: "submitSupplierPurchaseOrderResponse", supplierId: order.supplierId, purchaseOrderId: order.id, status: "available", proposedDeliveryDate: "2026-07-29" }, actor: supplierActor(order.supplierId), now, idempotencyKey: "supplier-response-001" });
    const line = response.state.purchaseOrders[0]!.lines[0]!;
    const notice = runCreateCommand({ state: response.state, command: { type: "submitSupplierDeliveryNotice", supplierId: order.supplierId, purchaseOrderId: order.id, lineQuantities: { [line.id]: 1 }, attachments: [] }, actor: supplierActor(order.supplierId), now, idempotencyKey: "supplier-notice-001" });
    expect(notice.state.purchaseOrders[0]?.supplierAcknowledgements).toHaveLength(1);
    expect(notice.state.purchaseOrders[0]?.supplierDeliveryNotices).toHaveLength(1);
    expect(notice.state.inventoryMovements).toHaveLength(initialInventoryMovementCount);
    expect(notice.state.supplierLedgerEntries).toHaveLength(initialSupplierLedgerCount);
    expect(notice.state.auditLogs.slice(0, 2).map((entry) => entry.action)).toEqual(expect.arrayContaining(["submitSupplierPurchaseOrderResponse", "submitSupplierDeliveryNotice"]));
    assertOperationsInvariants(notice.state);
  });

  it("refuses a customer order above currently available inventory without posting any document", () => {
    const state = createInitialOperationsState();
    const product = state.productUnits.find((item) => item.salePrice !== undefined && item.saleTaxRate !== undefined)!;
    state.inventoryMovements = state.inventoryMovements.filter((movement) => movement.productUnitId !== product.id);
    const salesOrderCount = state.salesOrders.length;

    expect(() => runCreateCommand({
      state,
      command: {
        type: "createCustomerPortalSalesOrder",
        customerId: "cus-minh-anh",
        deliveryAddress: "12 Đường Lê Lợi, phường 1, TP. Vũng Tàu",
        paymentMethod: "transfer",
        lines: [{ productUnitId: product.id, quantity: 1 }]
      },
      actor: customerActor(),
      now,
      idempotencyKey: "customer-insufficient-inventory-001"
    })).toThrow("Số lượng yêu cầu vượt lượng có thể đáp ứng ngay");
    expect(state.salesOrders).toHaveLength(salesOrderCount);
  });

  it("enforces portal visibility and orderability on the server with the canonical product id", () => {
    const state = createInitialOperationsState();
    const product = state.productUnits.find((item) => item.id === "pu-cement-bag");
    if (!product) throw new Error("Missing portal product fixture.");
    const command = {
      type: "createCustomerPortalSalesOrder" as const,
      customerId: "cus-minh-anh",
      deliveryAddress: "12 Đường Lê Lợi, phường 1, TP. Vũng Tàu",
      paymentMethod: "transfer" as const,
      lines: [{ productUnitId: product.id, quantity: 1 }]
    };

    product.visibleOnCustomerPortal = false;
    expect(() => runCreateCommand({ state, command, actor: customerActor(), now, idempotencyKey: "customer-hidden-product-001" }))
      .toThrow("chưa được phép đặt trực tuyến");

    product.visibleOnCustomerPortal = true;
    product.orderableOnline = false;
    expect(() => runCreateCommand({ state, command, actor: customerActor(), now, idempotencyKey: "customer-quote-product-001" }))
      .toThrow("chưa được phép đặt trực tuyến");

    product.orderableOnline = true;
    product.salePrice = Number.NaN;
    expect(() => runCreateCommand({ state, command, actor: customerActor(), now, idempotencyKey: "customer-invalid-price-001" }))
      .toThrow("chưa được phép đặt trực tuyến");
  });
});
