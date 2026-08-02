import { describe, expect, it } from "vitest";
import { runCreateCommand } from "../src/modules/operations/create-commands";
import { createRoleActor } from "../src/modules/operations/identity";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";

const attachment = {
  id: "11111111-1111-4111-8111-111111111111",
  fileName: "uy-nhiem-chi.pdf",
  contentType: "application/pdf" as const,
  size: 128,
  sha256: "a".repeat(64),
  uploadedBy: "user-accountant-local",
  uploadedAt: "2026-07-23T08:00:00.000Z"
};

function command(overrides: Partial<Extract<Parameters<typeof runCreateCommand>[0]["command"], { type: "createBankTransferProof" }>> = {}) {
  return {
    type: "createBankTransferProof" as const,
    direction: "out" as const,
    amount: 2_500_000,
    counterpartyName: "Công ty Vật tư An Phú",
    transactionReference: "MB-240723-001",
    transferredAt: "2026-07-23T08:00:00.000Z",
    attachments: [attachment],
    ...overrides
  };
}

describe("bank transfer proof archive", () => {
  it("archives valid evidence with audit data without posting cash or ledgers", () => {
    const state = createInitialOperationsState();
    const result = runCreateCommand({
      state,
      command: command(),
      actor: createRoleActor("accountant"),
      now: "2026-07-23T08:02:00.000Z",
      idempotencyKey: "transfer-proof-001"
    });

    expect(result.state.bankTransferProofs).toHaveLength(1);
    expect(result.state.bankTransferProofs[0]).toMatchObject({ documentNo: "CK-2026-0001", archivedBy: "user-accountant-local" });
    expect(result.state.cashTransactions).toHaveLength(0);
    expect(result.state.customerLedgerEntries).toHaveLength(0);
    expect(result.state.supplierLedgerEntries).toHaveLength(0);
    expect(result.state.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "createBankTransferProof" })
    ]));
  });

  it("rejects a user without the finance archive permission", () => {
    expect(() => runCreateCommand({
      state: createInitialOperationsState(),
      command: command({ attachments: [{ ...attachment, uploadedBy: "sales-1" }] }),
      actor: createRoleActor("sales"),
      now: "2026-07-23T08:02:00.000Z",
      idempotencyKey: "transfer-proof-sales"
    })).toThrow();
  });

  it("requires any referenced financial document to exist", () => {
    expect(() => runCreateCommand({
      state: createInitialOperationsState(),
      command: command({ relatedDocumentNo: "PT-KH-DOES-NOT-EXIST" }),
      actor: createRoleActor("accountant"),
      now: "2026-07-23T08:02:00.000Z",
      idempotencyKey: "transfer-proof-missing-reference"
    })).toThrow("Không tìm thấy chứng từ tài chính liên quan.");
  });

  it("retries the same request without duplicating evidence or audit data", () => {
    const initial = createInitialOperationsState();
    const actor = createRoleActor("accountant");
    const first = runCreateCommand({
      state: initial,
      command: command(),
      actor,
      now: "2026-07-23T08:02:00.000Z",
      idempotencyKey: "transfer-proof-retry"
    });
    const retry = runCreateCommand({
      state: first.state,
      command: command(),
      actor,
      now: "2026-07-23T08:03:00.000Z",
      idempotencyKey: "transfer-proof-retry"
    });

    expect(retry.severity).toBe("warning");
    expect(retry.state.bankTransferProofs).toHaveLength(1);
    expect(retry.state.auditLogs.filter((entry) => entry.action === "createBankTransferProof")).toHaveLength(1);
  });
});
