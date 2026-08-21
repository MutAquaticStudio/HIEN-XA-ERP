import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
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
  saveTransferProof: vi.fn(),
  removeReceipt: vi.fn(),
  removeDelivery: vi.fn(),
  removeDocument: vi.fn(),
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
  saveOperationsTransferProofDocument: mocks.saveTransferProof,
  removeOperationsReceiptImage: mocks.removeReceipt,
  removeOperationsDeliveryImage: mocks.removeDelivery,
  removeOperationsDocumentImage: mocks.removeDocument,
  removeOperationsTransferProofDocument: mocks.removeTransferProof
}));

import { importWorkbookDryRunAction } from "@/app/actions";

describe("workbook dry-run server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireIdentityUser.mockResolvedValue({ id: "owner-1", role: "owner" });
    mocks.requireOperationsActor.mockResolvedValue({ id: "owner-1", role: "owner", permissions: ["import.create_dry_run"] });
    mocks.projectState.mockImplementation((state: unknown) => ({ projected: state }));
    mocks.runCreateCommand.mockResolvedValue({ summary: "Da tao phien dry-run", severity: "warning", state: { version: 7 } });
  });

  it("parses the real demo workbook into an idempotent dry-run command without posting operational ledgers", async () => {
    const workbook = await readFile("reference/Demo.xlsx");
    const formData = new FormData();
    formData.set("workbook", new File([workbook], "Demo.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }));

    const result = await importWorkbookDryRunAction(formData);

    expect(mocks.runCreateCommand).toHaveBeenCalledWith(expect.objectContaining({
      type: "createImportDryRun",
      fileName: "Demo.xlsx",
      fileHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      sheetNames: expect.any(Array),
      rowCount: expect.any(Number),
      issues: expect.any(Array)
    }), expect.stringMatching(/^import-[a-f0-9]{64}$/), { id: "owner-1", role: "owner", permissions: ["import.create_dry_run"] });
    expect(result).toEqual({ summary: "Da tao phien dry-run", severity: "warning", state: { projected: { version: 7 } } });
  }, 120_000);

  it("rejects a non-xlsx upload without creating an import command", async () => {
    const formData = new FormData();
    formData.set("workbook", new File(["not a workbook"], "unsafe.csv", { type: "text/csv" }));

    await expect(importWorkbookDryRunAction(formData)).rejects.toThrow("Không thể chạy thử workbook.");

    expect(mocks.runCreateCommand).not.toHaveBeenCalled();
  });

  it("denies an unauthorized import before reading workbook bytes", async () => {
    mocks.requireOperationsActor.mockResolvedValue({ id: "viewer-1", role: "viewer", permissions: [] });
    const file = new File(["workbook-bytes"], "Demo.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const readBytes = vi.spyOn(file, "arrayBuffer");
    const formData = new FormData();
    formData.set("workbook", file);

    await expect(importWorkbookDryRunAction(formData)).rejects.toThrow("Bạn không có quyền chạy kiểm tra workbook import.");

    expect(readBytes).not.toHaveBeenCalled();
    expect(mocks.runCreateCommand).not.toHaveBeenCalled();
  });
});
