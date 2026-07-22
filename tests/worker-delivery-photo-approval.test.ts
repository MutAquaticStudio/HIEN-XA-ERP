import { describe, expect, it } from "vitest";
import { validateOperationsInvariants } from "../src/modules/operations/invariants";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { customerBalance, stockBalance } from "../src/modules/operations/selectors";
import { createOwnerActor, createRoleActor, runOperation } from "../src/modules/operations/service";
import type { OperationName, OperationsActor, OperationsAttachment, OperationsState } from "../src/modules/operations/types";

const now = "2026-07-22T10:00:00.000+07:00";

function workerActor(): OperationsActor {
  return { ...createRoleActor("worker"), displayName: "Nguyễn Văn Nam" };
}

function deliveryAttachment(actor: OperationsActor): OperationsAttachment {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    fileName: "giao-hang.jpg",
    contentType: "image/jpeg",
    size: 1024,
    sha256: "b".repeat(64),
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
  return runOperation({ state, operation, actor, now, idempotencyKey: `delivery-photo-${key}-12345`, targetId, options }).state;
}

function readyForDelivery() {
  let state = createInitialOperationsState();
  const owner = createOwnerActor();
  state = run(state, "confirmSalesOrder", owner, "confirm");
  state = run(state, "allocateSalesSources", owner, "allocate");
  state = run(state, "postGoodsReceipt", owner, "receipt", "po-001-line-cement", { quantity: 120 });
  state = run(state, "startDeliveryLoading", owner, "loading", "dj-001");
  return run(state, "dispatchDelivery", owner, "dispatch", "dj-001");
}

describe("worker delivery confirmation photo approval", () => {
  it("requires a delivery photo before a worker can submit completion", () => {
    const worker = workerActor();
    const state = readyForDelivery();

    expect(() => run(state, "submitDeliveryCompletion", worker, "without-photo", "dj-001", {
      recipientName: "Nguyen Van Nhan",
      evidence: "Da giao hang tai cong trinh",
      lineQuantities: { "so-001-line-cement": 120 }
    })).toThrow(/Xac nhan da giao/);

    expect(state.approvalRequests).toHaveLength(0);
    expect(state.inventoryMovements.filter((movement) => movement.movementType === "issue")).toHaveLength(0);
  });

  it("keeps delivery financial effects unposted until the attached-photo request is approved", () => {
    const worker = workerActor();
    let state = readyForDelivery();
    const stockBefore = stockBalance(state, "wh-main", "pu-cement-bag");
    const debtBefore = customerBalance(state.customerLedgerEntries, "cus-minh-anh");

    state = run(state, "submitDeliveryCompletion", worker, "with-photo", "dj-001", {
      recipientName: "Nguyen Van Nhan",
      evidence: "Da giao hang tai cong trinh",
      lineQuantities: { "so-001-line-cement": 120 },
      attachments: [deliveryAttachment(worker)]
    });

    expect(state.approvalRequests[0]).toMatchObject({
      type: "delivery_completion",
      targetId: "dj-001",
      status: "pending",
      submittedBy: worker.id,
      attachments: [{ fileName: "giao-hang.jpg", uploadedBy: worker.id }]
    });
    expect(state.deliveryJobs[0]?.status).toBe("in_transit");
    expect(stockBalance(state, "wh-main", "pu-cement-bag")).toBe(stockBefore);
    expect(customerBalance(state.customerLedgerEntries, "cus-minh-anh")).toBe(debtBefore);
    expect(validateOperationsInvariants(state)).toEqual([]);

    state = run(state, "approveDeliveryCompletion", createOwnerActor(), "approve", state.approvalRequests[0]?.id);

    expect(state.deliveryJobs[0]).toMatchObject({
      status: "delivered",
      completionAttachments: [{ fileName: "giao-hang.jpg", uploadedBy: worker.id }]
    });
    expect(stockBalance(state, "wh-main", "pu-cement-bag")).toBe(0);
    expect(customerBalance(state.customerLedgerEntries, "cus-minh-anh")).toBe(11_534_400);
    expect(validateOperationsInvariants(state)).toEqual([]);
  });
});
