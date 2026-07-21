import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { getCurrentIdentityUser } from "@/server/identity/auth-context";
import { readOperationsDocumentImage } from "@/server/infrastructure/operations-attachment-store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentIdentityUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const snapshot = await getDemoOperationsSnapshot();
  const matches = [
    ...snapshot.state.approvalRequests.flatMap((request) =>
      (request.attachments ?? []).map((attachment) => ({ attachment, uploadedBy: request.submittedBy }))
    ),
    ...snapshot.state.salesOrders.flatMap((order) =>
      (order.attachments ?? []).map((attachment) => ({ attachment, uploadedBy: attachment.uploadedBy }))
    ),
    ...snapshot.state.purchaseOrders.flatMap((order) =>
      (order.attachments ?? []).map((attachment) => ({ attachment, uploadedBy: attachment.uploadedBy }))
    )
  ];
  const match = matches.find((item) => item.attachment.id === id);
  if (!match) {
    return new Response("Not found", { status: 404 });
  }

  const canView = (user.role === "owner" || user.role === "accountant") || match.uploadedBy === user.id;
  if (!canView) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const content = await readOperationsDocumentImage(match.attachment);
    return new Response(content, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(match.attachment.fileName)}`,
        "Content-Length": String(content.byteLength),
        "Content-Type": match.attachment.contentType,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
