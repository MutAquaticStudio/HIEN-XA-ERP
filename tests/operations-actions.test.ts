import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((location: string) => { throw { name: "test-redirect", location }; }),
  revalidatePath: vi.fn(),
  getSnapshot: vi.fn(),
  resetState: vi.fn(),
  runOperation: vi.fn(),
  runCreateCommand: vi.fn(),
  requireIdentityAdmin: vi.fn(),
  requireIdentityUser: vi.fn(),
  requireOperationsActor: vi.fn(),
  projectSnapshot: vi.fn(),
  projectState: vi.fn(),
  saveReceipt: vi.fn(),
  saveDelivery: vi.fn(),
  saveDocument: vi.fn(),
  removeReceipt: vi.fn(),
  removeDelivery: vi.fn(),
  removeDocument: vi.fn(),
  saveTransferProof: vi.fn(),
  removeTransferProof: vi.fn()
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/modules/operations/demo-store", () => ({
  getDemoOperationsSnapshot: mocks.getSnapshot,
  resetDemoOperationsState: mocks.resetState,
  runDemoOperation: mocks.runOperation,
  runDemoCreateCommand: mocks.runCreateCommand
}));
vi.mock("@/server/identity/auth-context", () => ({
  requireIdentityAdmin: mocks.requireIdentityAdmin,
  requireIdentityUser: mocks.requireIdentityUser,
  requireOperationsActor: mocks.requireOperationsActor
}));
vi.mock("@/server/identity/operations-projection", () => ({
  projectOperationsSnapshot: mocks.projectSnapshot,
  projectOperationsState: mocks.projectState
}));
vi.mock("@/server/infrastructure/operations-attachment-store", () => ({
  saveOperationsReceiptImage: mocks.saveReceipt,
  saveOperationsDeliveryImage: mocks.saveDelivery,
  saveOperationsDocumentImage: mocks.saveDocument,
  removeOperationsReceiptImage: mocks.removeReceipt,
  removeOperationsDeliveryImage: mocks.removeDelivery,
  removeOperationsDocumentImage: mocks.removeDocument,
  saveOperationsTransferProofDocument: mocks.saveTransferProof,
  removeOperationsTransferProofDocument: mocks.removeTransferProof
}));

import {
  archiveBankTransferProofAction,
  getOperationsSnapshotAction,
  resetDemoOperationsAction,
  runDemoCreateCommandAction,
  runDemoOperationAction,
  submitDeliveryCompletionWithImageAction,
  submitGoodsReceiptWithImageAction
} from "@/app/actions";

const user = { id: "warehouse-1", role: "warehouse" };
const actor = { id: "warehouse-1", role: "warehouse", permissions: ["inventory.post"] };
const idempotencyKey = "operation-20260727-0001";

describe("core operations server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireIdentityUser.mockResolvedValue(user);
    mocks.requireOperationsActor.mockResolvedValue(actor);
    mocks.projectState.mockImplementation((state: unknown) => ({ projected: state }));
    mocks.projectSnapshot.mockImplementation((snapshot: unknown) => ({ projected: snapshot }));
  });

  it("requires a dedicated proof-image action for delivery completion", async () => {
    const result = await runDemoOperationAction({
      operation: "submitDeliveryCompletion",
      idempotencyKey,
      targetId: "GH-1"
    });

    expect(result.ok).toBe(false);
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
    expect(mocks.runOperation).not.toHaveBeenCalled();
  });

  it("rejects out-of-range work-location coordinates before identity and mutation", async () => {
    const result = await runDemoOperationAction({
      operation: "recordWorkOrderLocation",
      idempotencyKey,
      targetId: "WO-1",
      options: { location: { latitude: 91, longitude: 106.7 } }
    });

    expect(result.ok).toBe(false);
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
    expect(mocks.runOperation).not.toHaveBeenCalled();
  });

  it("runs an authorized operation once with its idempotency key and projects the resulting state", async () => {
    mocks.runOperation.mockResolvedValue({ summary: "Da xac nhan", state: { version: 2 } });

    const result = await runDemoOperationAction({
      operation: "confirmSalesOrder",
      idempotencyKey,
      targetId: "SO-1",
      options: { expectedVersion: 1 }
    });

    expect(mocks.runOperation).toHaveBeenCalledWith("confirmSalesOrder", idempotencyKey, "SO-1", actor, { expectedVersion: 1 });
    expect(result).toEqual({ ok: true, result: { summary: "Da xac nhan", state: { projected: { version: 2 } } } });
  });

  it("rejects create commands with more than one hundred document lines before authentication", async () => {
    const lines = Array.from({ length: 101 }, (_, index) => ({
      productUnitId: `PU-${index}`,
      quantity: 1,
      unitPrice: 100,
      taxRate: 0
    }));

    const result = await runDemoCreateCommandAction({
      idempotencyKey: "create-order-20260727-0001",
      command: { type: "createSalesOrderDraft", customerId: "customer-1", lines }
    });

    expect(result.ok).toBe(false);
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
    expect(mocks.runCreateCommand).not.toHaveBeenCalled();
  });

  it("passes a valid create command through the authenticated actor and projects its state", async () => {
    mocks.runCreateCommand.mockResolvedValue({ summary: "Da tao", severity: "success", state: { version: 3 } });
    const command = { type: "createCustomer", displayName: "Cong trinh Minh Anh", phone: "0988123456", creditLimit: 1_000_000 };

    const result = await runDemoCreateCommandAction({
      idempotencyKey: "create-customer-20260727-0001",
      command
    });

    expect(mocks.runCreateCommand).toHaveBeenCalledWith(command, "create-customer-20260727-0001", actor);
    expect(result).toEqual({ ok: true, result: { summary: "Da tao", severity: "success", state: { projected: { version: 3 } } } });
  });

  it("does not accept a goods receipt without an attached receipt image", async () => {
    const formData = new FormData();
    formData.set("targetId", "POL-1");
    formData.set("quantity", "10");

    const result = await submitGoodsReceiptWithImageAction(formData);

    expect(result.ok).toBe(false);
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
    expect(mocks.saveReceipt).not.toHaveBeenCalled();
  });

  it("does not accept delivery completion without an image and structured line quantities", async () => {
    const formData = new FormData();
    formData.set("targetId", "GH-1");
    formData.set("recipientName", "Nguyen Van A");
    formData.set("evidence", "Da giao tai cong trinh");
    formData.set("lineQuantities", JSON.stringify({ "SOL-1": 10 }));

    const result = await submitDeliveryCompletionWithImageAction(formData);

    expect(result.ok).toBe(false);
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
    expect(mocks.saveDelivery).not.toHaveBeenCalled();
  });

  it("requires the bank-proof archive permission before it reads or stores documents", async () => {
    mocks.requireOperationsActor.mockResolvedValue({ id: "sales-1", role: "sales", permissions: [] });

    await expect(archiveBankTransferProofAction(new FormData())).rejects.toMatchObject({
      name: "test-redirect",
      location: expect.stringContaining("/cash/transfer-proofs?error=")
    });

    expect(mocks.saveTransferProof).not.toHaveBeenCalled();
    expect(mocks.runCreateCommand).not.toHaveBeenCalled();
  });

  it("projects reset and read snapshots only after their respective identity guards", async () => {
    const owner = { id: "owner-1", role: "owner" };
    mocks.requireIdentityAdmin.mockResolvedValue(owner);
    mocks.resetState.mockResolvedValue({ state: { version: 1 } });
    mocks.getSnapshot.mockResolvedValue({ state: { version: 2 } });

    await expect(resetDemoOperationsAction()).resolves.toEqual({ projected: { state: { version: 1 } } });
    await expect(getOperationsSnapshotAction()).resolves.toEqual({ projected: { state: { version: 2 } } });

    expect(mocks.projectSnapshot).toHaveBeenCalledWith({ state: { version: 1 } }, owner);
    expect(mocks.projectSnapshot).toHaveBeenCalledWith({ state: { version: 2 } }, user);
  });
});
