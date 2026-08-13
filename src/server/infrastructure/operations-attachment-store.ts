import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { OperationsActor, OperationsAttachment } from "@/modules/operations/types";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "./supabase-server-client";
import { getCloudflareD1Database, getCloudflarePrivateBucket, hasCloudflareRuntimeConfig } from "./cloudflare-bindings";

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

  await writeAttachment(attachment, buffer);
  return attachment;
}

export async function saveOperationsTransferProofDocument(
  file: File,
  actor: OperationsActor,
  uploadedAt: string
): Promise<OperationsAttachment> {
  if (file.size <= 0 || file.size > maximumImageSize) {
    throw new Error("Tệp chứng từ chuyển khoản phải có dung lượng từ 1 byte đến 8 MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = sniffTransferProofContentType(buffer);
  if (!contentType) {
    throw new Error("Tệp chứng từ phải là JPG, PNG, WEBP hoặc PDF hợp lệ.");
  }

  const attachment: OperationsAttachment = {
    id: randomUUID(),
    fileName: sanitizeFileName(file.name, contentType),
    contentType,
    size: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    uploadedBy: actor.id,
    uploadedAt
  };

  await writeAttachment(attachment, buffer);
  return attachment;
}

export async function readOperationsReceiptImage(attachment: OperationsAttachment) {
  if (hasCloudflareRuntimeConfig()) {
    const object = await getCloudflarePrivateBucket().get(attachmentStoragePath(attachment));
    if (!object) throw new Error("Không thể đọc chứng từ: tệp không tồn tại.");
    return Buffer.from(await object.arrayBuffer());
  }
  if (hasSupabaseServerConfig()) {
    const { data, error } = await getSupabaseServerClient().storage.from("erp-attachments").download(attachmentStoragePath(attachment));
    if (error || !data) throw new Error(`Không thể đọc chứng từ: ${error?.message ?? "tệp không tồn tại"}.`);
    return Buffer.from(await data.arrayBuffer());
  }
  return readFile(/* turbopackIgnore: true */ attachmentPath(attachment));
}

export async function removeOperationsReceiptImage(attachment: OperationsAttachment) {
  try {
    if (hasCloudflareRuntimeConfig()) {
      await getCloudflarePrivateBucket().delete(attachmentStoragePath(attachment));
      await getCloudflareD1Database()
        .prepare("UPDATE private_object_metadata SET status = 'deleted', deleted_at = ?1 WHERE id = ?2")
        .bind(new Date().toISOString(), attachment.id)
        .run();
      return;
    }
    if (hasSupabaseServerConfig()) {
      const { error } = await getSupabaseServerClient().storage.from("erp-attachments").remove([attachmentStoragePath(attachment)]);
      if (error) throw new Error(error.message);
      return;
    }
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
export const saveOperationsDeliveryImage = saveOperationsReceiptImage;
export const removeOperationsDeliveryImage = removeOperationsReceiptImage;
export const readOperationsTransferProofDocument = readOperationsReceiptImage;
export const removeOperationsTransferProofDocument = removeOperationsReceiptImage;

function attachmentRoot() {
  return process.env.VLXD_ATTACHMENT_DIR?.trim() || defaultAttachmentRoot;
}

function attachmentPath(attachment: OperationsAttachment) {
  return join(/* turbopackIgnore: true */ attachmentRoot(), attachmentStoragePath(attachment));
}

function attachmentStoragePath(attachment: OperationsAttachment) {
  const extension = attachment.contentType === "image/jpeg"
    ? "jpg"
    : attachment.contentType === "image/png"
      ? "png"
      : attachment.contentType === "application/pdf"
        ? "pdf"
        : "webp";
  return `${attachment.id}.${extension}`;
}

async function writeAttachment(attachment: OperationsAttachment, buffer: Buffer) {
  if (hasCloudflareRuntimeConfig()) {
    const storagePath = attachmentStoragePath(attachment);
    const bucket = getCloudflarePrivateBucket();
    await bucket.put(storagePath, buffer, { httpMetadata: { contentType: attachment.contentType } });
    try {
      const result = await getCloudflareD1Database()
        .prepare(`
          INSERT INTO private_object_metadata(
            id, object_key, owner_scope, owner_id, content_type, byte_size,
            sha256, status, uploaded_by, created_at
          ) VALUES (?1, ?2, 'operations_actor', ?3, ?4, ?5, ?6, 'active', ?7, ?8)
        `)
        .bind(
          attachment.id,
          storagePath,
          attachment.uploadedBy,
          attachment.contentType,
          attachment.size,
          attachment.sha256,
          attachment.uploadedBy,
          attachment.uploadedAt
        )
        .run();
      if (!result.success || Number(result.meta?.changes ?? 0) !== 1) {
        throw new Error("Không thể ghi metadata chứng từ.");
      }
    } catch (error) {
      await bucket.delete(storagePath).catch(() => undefined);
      throw error;
    }
    return;
  }
  if (hasSupabaseServerConfig()) {
    const { error } = await getSupabaseServerClient().storage.from("erp-attachments").upload(attachmentStoragePath(attachment), buffer, {
      contentType: attachment.contentType,
      upsert: false
    });
    if (error) throw new Error(`Không thể lưu chứng từ: ${error.message}.`);
    return;
  }
  await mkdir(/* turbopackIgnore: true */ attachmentRoot(), { recursive: true, mode: 0o700 });
  await writeFile(/* turbopackIgnore: true */ attachmentPath(attachment), buffer, { encoding: "binary", mode: 0o600 });
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

function sniffTransferProofContentType(buffer: Buffer): OperationsAttachment["contentType"] | undefined {
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") {
    return "application/pdf";
  }
  return sniffImageContentType(buffer);
}

function sanitizeFileName(fileName: string, contentType: OperationsAttachment["contentType"]) {
  const fallbackExtension = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : contentType === "application/pdf" ? "pdf" : "webp";
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
