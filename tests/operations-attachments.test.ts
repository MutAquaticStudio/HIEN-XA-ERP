import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRoleActor } from "../src/modules/operations/service";
import {
  readOperationsReceiptImage,
  removeOperationsReceiptImage,
  saveOperationsReceiptImage,
  saveOperationsTransferProofDocument
} from "../src/server/infrastructure/operations-attachment-store";

const originalAttachmentDir = process.env.VLXD_ATTACHMENT_DIR;

afterEach(() => {
  if (originalAttachmentDir === undefined) {
    delete process.env.VLXD_ATTACHMENT_DIR;
  } else {
    process.env.VLXD_ATTACHMENT_DIR = originalAttachmentDir;
  }
});

describe("receipt image attachment store", () => {
  it("stores only validated image bytes and returns auditable metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vlxd-attachments-"));
    process.env.VLXD_ATTACHMENT_DIR = directory;
    const actor = createRoleActor("worker");
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "phiếu nhập.jpg", { type: "image/jpeg" });

    try {
      const attachment = await saveOperationsReceiptImage(jpeg, actor, "2026-07-18T10:00:00.000Z");
      expect(attachment).toMatchObject({
        contentType: "image/jpeg",
        fileName: "phiếu_nhập.jpg",
        size: 4,
        uploadedBy: actor.id
      });
      expect(attachment.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(await readOperationsReceiptImage(attachment)).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      await removeOperationsReceiptImage(attachment);
      await expect(readOperationsReceiptImage(attachment)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a file that only claims to be an image", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vlxd-attachments-"));
    process.env.VLXD_ATTACHMENT_DIR = directory;

    try {
      const fakeImage = new File(["not an image"], "receipt.jpg", { type: "image/jpeg" });
      await expect(saveOperationsReceiptImage(fakeImage, createRoleActor("worker"), "2026-07-18T10:00:00.000Z"))
        .rejects.toThrow("không đúng định dạng");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("stores a bank-transfer PDF only after checking its signature", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vlxd-attachments-"));
    process.env.VLXD_ATTACHMENT_DIR = directory;
    const file = new File(["%PDF-1.7\nproof"], "uy-nhiem-chi.pdf", { type: "application/pdf" });

    try {
      const attachment = await saveOperationsTransferProofDocument(file, createRoleActor("accountant"), "2026-07-23T08:00:00.000Z");
      expect(attachment.contentType).toBe("application/pdf");
      await removeOperationsReceiptImage(attachment);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
