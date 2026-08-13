import { NextResponse } from "next/server";
import { readOperationsDocumentImage } from "@/server/infrastructure/operations-attachment-store";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { getMobilePrivateAttachment } from "@/server/mobile/mobile-private-attachment-service";
import { PublicApiError } from "@/server/shared/public-api-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireNativeMobileContext(request);
    const { id } = await context.params;
    const attachment = await getMobilePrivateAttachment(user, id);
    let content: Buffer;
    try {
      content = await readOperationsDocumentImage(attachment);
    } catch {
      throw new PublicApiError(400, "Không tìm thấy chứng từ.");
    }
    const body = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
    return new NextResponse(body, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        "Content-Length": String(content.byteLength),
        "Content-Type": attachment.contentType,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return mobileError(error, "Không thể tải chứng từ riêng tư trên điện thoại.");
  }
}
