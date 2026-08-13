import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { readOperationsDocumentImage } from "@/server/infrastructure/operations-attachment-store";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    const { id } = await context.params;
    const snapshot = await getDemoOperationsSnapshot();
    const match = (snapshot.state.inventoryCountSessions ?? []).flatMap((session) => session.lines.flatMap((line) => line.attachments.map((attachment) => ({ session, attachment })))).find((item) => item.attachment.id === id);
    if (!match) return new Response("Not found", { status: 404 });
    const canView = ["owner", "administrator", "accountant"].includes(user.role) || (user.role === "warehouse" && actor.warehouseIds?.includes(match.session.warehouseId) && match.attachment.uploadedBy === user.id);
    if (!canView) return new Response("Forbidden", { status: 403 });
    const content = await readOperationsDocumentImage(match.attachment);
    return new Response(content, { status: 200, headers: { "Cache-Control": "private, no-store, max-age=0", "Content-Type": match.attachment.contentType, "Content-Length": String(content.byteLength), "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return mobileError(error, "Không thể tải bằng chứng kiểm kê."); }
}
