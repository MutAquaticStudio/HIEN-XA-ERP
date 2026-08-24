import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((location: string) => { throw { name: "test-redirect", location }; }),
  revalidatePath: vi.fn(),
  getSnapshot: vi.fn(),
  runOperation: vi.fn(),
  runCreateCommand: vi.fn(),
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
vi.mock("@/server/erp-v2/runtime", () => ({
  getErpV2Snapshot: mocks.getSnapshot,
  runErpV2Operation: mocks.runOperation,
  runErpV2CreateCommand: mocks.runCreateCommand
}));
vi.mock("@/server/identity/auth-context", () => ({
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
  runErpV2CreateCommandAction,
  runErpV2OperationAction,
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
    const result = await runErpV2OperationAction({
      operation: "submitDeliveryCompletion",
      idempotencyKey,
      targetId: "GH-1"
    });

    expect(result.ok).toBe(false);
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
    expect(mocks.runOperation).not.toHaveBeenCalled();
  });

  it("rejects out-of-range work-location coordinates before identity and mutation", async () => {
    const result = await runErpV2OperationAction({
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

    const result = await runErpV2OperationAction({
      operation: "confirmSalesOrder",
      idempotencyKey,
      targetId: "SO-1",
      options: { expectedVersion: 1 }
    });

    expect(mocks.runOperation).toHaveBeenCalledWith("confirmSalesOrder", idempotencyKey, "SO-1", actor, { expectedVersion: 1 });
    expect(result).toEqual({ ok: true, result: { summary: "Da xac nhan", state: { projected: { version: 2 } } } });
  });

  it("accepts the bounded delivery discrepancy operation including an explicit zero quantity", async () => {
    mocks.runOperation.mockResolvedValue({ summary: "Đã báo chênh lệch", severity: "success", state: { version: 4 } });

    const result = await runErpV2OperationAction({
      operation: "requestDeliveryQuantityChange",
      idempotencyKey: "delivery-discrepancy-20260824",
      targetId: "GH-1",
      options: {
        reason: "Khách chỉ nhận một phần chuyến này",
        lineQuantities: { "SOL-1": 0 }
      }
    });

    expect(result.ok).toBe(true);
    expect(mocks.runOperation).toHaveBeenCalledWith(
      "requestDeliveryQuantityChange",
      "delivery-discrepancy-20260824",
      "GH-1",
      actor,
      { reason: "Khách chỉ nhận một phần chuyến này", lineQuantities: { "SOL-1": 0 } }
    );
  });

  it("accepts only the registered delivery review and waiver operations", async () => {
    mocks.runOperation.mockResolvedValue({ summary: "Đã xử lý", severity: "success", state: { version: 5 } });

    await expect(runErpV2OperationAction({
      operation: "approveDeliveryQuantityChange",
      idempotencyKey: "delivery-approve-20260824",
      targetId: "GH-1"
    })).resolves.toMatchObject({ ok: true });
    await expect(runErpV2OperationAction({
      operation: "rejectDeliveryQuantityChange",
      idempotencyKey: "delivery-reject-20260824",
      targetId: "GH-1",
      options: { reason: "Số lượng báo chưa khớp phiếu giao" }
    })).resolves.toMatchObject({ ok: true });
    await expect(runErpV2OperationAction({
      operation: "waiveCustomerDeliveryReceipt",
      idempotencyKey: "delivery-waiver-20260824",
      targetId: "GH-1",
      options: { reason: "Khách không dùng điện thoại có camera" }
    })).resolves.toMatchObject({ ok: true });

    const callsBeforeUnknownOperation = mocks.runOperation.mock.calls.length;
    const unknown = await runErpV2OperationAction({
      operation: "arbitraryDeliveryMutation",
      idempotencyKey: "delivery-unknown-20260824",
      targetId: "GH-1"
    });
    expect(unknown.ok).toBe(false);
    expect(mocks.runOperation).toHaveBeenCalledTimes(callsBeforeUnknownOperation);
  });

  it("rejects create commands with more than one hundred document lines before authentication", async () => {
    const lines = Array.from({ length: 101 }, (_, index) => ({
      productUnitId: `PU-${index}`,
      quantity: 1,
      unitPrice: 100,
      taxRate: 0
    }));

    const result = await runErpV2CreateCommandAction({
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

    const result = await runErpV2CreateCommandAction({
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

  it("forwards the caller-owned delivery key and removes a retry upload after replay", async () => {
    const firstAttachment = { id: "delivery-image-1", fileName: "giao-hang.png", contentType: "image/png", size: 4, sha256: "a".repeat(64), uploadedBy: actor.id, uploadedAt: "2026-08-24T01:00:00.000Z" };
    const retryAttachment = { ...firstAttachment, id: "delivery-image-2", uploadedAt: "2026-08-24T01:00:05.000Z" };
    mocks.saveDelivery.mockResolvedValueOnce(firstAttachment).mockResolvedValueOnce(retryAttachment);
    mocks.runOperation
      .mockResolvedValueOnce({ summary: "Đã gửi xác nhận", severity: "success", state: { version: 2 } })
      .mockResolvedValueOnce({ summary: "Đã xử lý trước đó", severity: "warning", state: { version: 2 } });

    const submit = () => {
      const formData = new FormData();
      formData.set("targetId", "GH-1");
      formData.set("recipientName", "Nguyễn Văn A");
      formData.set("evidence", "Đã bàn giao tại công trình");
      formData.set("lineQuantities", JSON.stringify({ "SOL-1": 2 }));
      formData.set("idempotencyKey", "stable-delivery-upload-key-001");
      formData.set("deliveryImage", new File([new Uint8Array([1, 2, 3, 4])], "giao-hang.png", { type: "image/png" }));
      return submitDeliveryCompletionWithImageAction(formData);
    };

    await expect(submit()).resolves.toMatchObject({ ok: true, result: { severity: "success" } });
    await expect(submit()).resolves.toMatchObject({ ok: true, result: { severity: "warning" } });

    expect(mocks.runOperation.mock.calls[0]?.[1]).toBe("stable-delivery-upload-key-001");
    expect(mocks.runOperation.mock.calls[1]?.[1]).toBe("stable-delivery-upload-key-001");
    expect(mocks.removeDelivery).toHaveBeenCalledWith(retryAttachment);
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

  it("projects read snapshots only after the identity guard", async () => {
    mocks.getSnapshot.mockResolvedValue({ state: { version: 2 } });

    await expect(getOperationsSnapshotAction()).resolves.toEqual({ projected: { state: { version: 2 } } });

    expect(mocks.projectSnapshot).toHaveBeenCalledWith({ state: { version: 2 } }, user);
  });
});
