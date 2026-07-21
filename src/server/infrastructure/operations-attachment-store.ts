import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { OperationsActor, OperationsAttachment } from "@/modules/operations/types";

const maximumImageSize = 8 * 1024 * 1024;
const defaultAttachmentRoot = resolve(/* turbopackIgnore: true */ process.cwd(), ".data", "attachments");

export async function saveOperationsReceiptImage(
  file: File,
  actor: OperationsActor,
  uploadedAt: string
): Promise<OperationsAttachment> {
  if (file.size <= 0 || file.size > maximumImageSize) {
    throw new Error("Ảnh phiếu nhập phải có dung lượng từ 1 byte đến 8 MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = sniffImageContentType(buffer);
  if (!contentType) {
    throw new Error("Ảnh phiếu nhập không đúng định dạng JPG, PNG hoặc WEBP.");
  }

  const id = randomUUID();
  const attachment: OperationsAttachment = {
    id,
    fileName: sanitizeFileName(file.name, contentType),
    contentType,
    size: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    uploadedBy: actor.id,
    uploadedAt
  };

  await mkdir(/* turbopackIgnore: true */ attachmentRoot(), { recursive: true, mode: 0o700 });
  await writeFile(/* turbopackIgnore: true */ attachmentPath(attachment), buffer, { encoding: "binary", mode: 0o600 });
  return attachment;
}

export async function readOperationsReceiptImage(attachment: OperationsAttachment) {
  return readFile(/* turbopackIgnore: true */ attachmentPath(attachment));
}

export async function removeOperationsReceiptImage(attachment: OperationsAttachment) {
  try {
    await unlink(/* turbopackIgnore: true */ attachmentPath(attachment));
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}

// The storage adapter is shared by receipt, sales-order, and purchase-order evidence.
export const saveOperationsDocumentImage = saveOperationsReceiptImage;
export const readOperationsDocumentImage = readOperationsReceiptImage;
export const removeOperationsDocumentImage = removeOperationsReceiptImage;

function attachmentRoot() {
  return process.env.VLXD_ATTACHMENT_DIR?.trim() || defaultAttachmentRoot;
}

function attachmentPath(attachment: OperationsAttachment) {
  const extension = attachment.contentType === "image/jpeg"
    ? "jpg"
    : attachment.contentType === "image/png"
      ? "png"
      : "webp";
  return join(/* turbopackIgnore: true */ attachmentRoot(), `${attachment.id}.${extension}`);
}

function sniffImageContentType(buffer: Buffer): OperationsAttachment["contentType"] | undefined {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return undefined;
}

function sanitizeFileName(fileName: string, contentType: OperationsAttachment["contentType"]) {
  const fallbackExtension = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const sanitized = fileName
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return sanitized || `phieu-nhap.${fallbackExtension}`;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
