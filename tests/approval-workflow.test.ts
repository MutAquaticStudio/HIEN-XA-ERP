import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { stockBalance, supplierBalance, customerBalance } from "../src/modules/operations/selectors";
import { createOwnerActor, createRoleActor, runOperation } from "../src/modules/operations/commands";
import type { OperationName, OperationsActor, OperationsAttachment, OperationsState } from "../src/modules/operations/types";

const now = "2026-07-18T10:00:00.000+07:00";

function workerActor(displayName = "Nguyễn Văn Nam"): OperationsActor {
  return { ...createRoleActor("worker"), displayName, employeeId: "emp-worker-nam" };
}

function receiptAttachment(actor: OperationsActor, id = "11111111-1111-4111-8111-111111111111"): OperationsAttachment {
  return {
    id,
    fileName: "phieu-nhap.jpg",
    contentType: "image/jpeg",
    size: 1024,
    sha256: "a".repeat(64),
    uploadedBy: actor.id,
    uploadedAt: now
  };
}

function run(
  state: OperationsState,
  operation: OperationName,
  actor: OperationsActor,
  key: string,
  targetId?: string,
  options?: Parameters<typeof runOperation>[0]["options"]
) {
  return runOperation({ state, operation, actor, now, idempotencyKey: `approval-${key}-12345`, targetId, options }).state;
}

describe("worker maker-checker approval workflow", () => {
  it("keeps receipt unposted until Owner or Accountant approves it", () => {
    const worker = workerActor();
    let state = createInitialOperationsState();
    const initialStock = stockBalance(state, "wh-main", "pu-cement-bag");

    expect(() => run(state, "submitGoodsReceipt", worker, "receipt-without-image", "po-001-line-cement", { quantity: 20 })).toThrow(/Phi/);

    state = run(state, "submitGoodsReceipt", worker, "receipt-submit", "po-001-line-cement", { quantity: 20, attachments: [receiptAttachment(worker)] });

    expect(state.approvalRequests[0]).toMatchObject({
      type: "goods_receipt",
      targetId: "po-001-line-cement",
      status: "pending",
      quantity: 20,
      submittedBy: worker.id
    });
    expect(state.purchaseOrders[0]?.lines[0]?.receivedQuantity).toBe(0);
    expect(stockBalance(state, "wh-main", "pu-cement-bag")).toBe(initialStock);
    expect(state.supplierLedgerEntries).toHaveLength(0);

    expect(() => run(state, "postGoodsReceipt", createOwnerActor(), "receipt-direct-post", "po-001-line-cement", { quantity: 20 })).toThrow(/D/);

    state = run(state, "approveGoodsReceipt", createRoleActor("accountant"), "receipt-approve", state.approvalRequests[0]?.id);

    expect(state.approvalRequests[0]).toMatchObject({ status: "approved", approvedBy: "user-accountant-local" });
    expect(state.purchaseOrders[0]?.lines[0]?.receivedQuantity).toBe(20);
    expect(stockBalance(state, "wh-main", "pu-cement-bag")).toBe(20);
    expect(supplierBalance(state.supplierLedgerEntries, "sup-hoang-thach")).toBe(1641600);
    expect(state.auditLogs[0]).toMatchObject({ action: "approveGoodsReceipt", actorRole: "accountant" });
  });

  it("allows Accountant to reject a receipt without changing inventory or payable", () => {
    let state = createInitialOperationsState();
    const worker = workerActor();
    state = run(state, "submitGoodsReceipt", worker, "receipt-reject-submit", "po-001-line-cement", { quantity: 10, attachments: [receiptAttachment(worker, "22222222-2222-4222-8222-222222222222")] });
    state = run(state, "rejectGoodsReceipt", createRoleActor("accountant"), "receipt-reject", state.approvalRequests[0]?.id, { reason: "Sai so luong thuc nhan" });

    expect(state.approvalRequests[0]).toMatchObject({ status: "rejected", rejectionReason: "Sai so luong thuc nhan" });
    expect(state.purchaseOrders[0]?.lines[0]?.receivedQuantity).toBe(0);
    expect(state.inventoryMovements.filter((movement) => movement.movementType === "receipt")).toHaveLength(0);
    expect(state.supplierLedgerEntries).toHaveLength(0);
  });

  it("requires approval before worker delivery completion can post issue and receivable", () => {
    let state = createInitialOperationsState();
    const owner = createOwnerActor();
    state = run(state, "confirmSalesOrder", owner, "delivery-confirm");
    state = run(state, "allocateSalesSources", owner, "delivery-allocate");
    state = run(state, "postGoodsReceipt", owner, "delivery-receipt", "po-001-line-cement", { quantity: 120 });
    state = run(state, "startDeliveryLoading", owner, "delivery-loading", "dj-001");
    state = run(state, "dispatchDelivery", owner, "delivery-dispatch", "dj-001");

    const beforeCustomerDebt = customerBalance(state.customerLedgerEntries, "cus-minh-anh");
    const worker = workerActor();
    state = run(state, "submitDeliveryCompletion", worker, "delivery-submit", "dj-001", {
      recipientName: "Nguyễn Văn Nhận",
      evidence: "Ảnh giao nhận APPROVAL-001",
      lineQuantities: { "so-001-line-cement": 120 },
      attachments: [receiptAttachment(worker, "44444444-4444-4444-8444-444444444444")]
    });

    expect(state.deliveryJobs[0]?.status).toBe("in_transit");
    expect(state.inventoryMovements.filter((movement) => movement.movementType === "issue")).toHaveLength(0);
    expect(customerBalance(state.customerLedgerEntries, "cus-minh-anh")).toBe(beforeCustomerDebt);

    expect(() => run(state, "approveDeliveryCompletion", createRoleActor("driver"), "delivery-driver-approve", state.approvalRequests[0]?.id)).toThrow(/Ng/);

    state = run(state, "waiveCustomerDeliveryReceipt", createOwnerActor(), "delivery-waive-customer-photo", "dj-001", {
      reason: "Khách không có thiết bị để chụp ảnh xác nhận tại thời điểm giao"
    });
    state = run(state, "approveDeliveryCompletion", createOwnerActor(), "delivery-approve", state.approvalRequests[0]?.id);
    expect(state.deliveryJobs[0]?.status).toBe("delivered");
    expect(state.approvalRequests[0]).toMatchObject({ status: "approved", approvedBy: "user-owner-local" });
    expect(state.inventoryMovements.filter((movement) => movement.movementType === "issue")).toHaveLength(1);
    expect(customerBalance(state.customerLedgerEntries, "cus-minh-anh")).toBe(11534400);
  });
});
