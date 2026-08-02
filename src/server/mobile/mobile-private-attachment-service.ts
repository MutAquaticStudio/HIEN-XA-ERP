import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import type { OperationsAttachment } from "@/modules/operations/types";
import type { SafeIdentityUser } from "@/server/identity/types";
import { PublicApiError } from "@/server/shared/public-api-error";

type AttachmentMatch = {
  attachment: OperationsAttachment;
  uploadedBy: string;
  financial: boolean;
  deliveryJobId?: string;
};

export async function getMobilePrivateAttachment(user: SafeIdentityUser, id: string): Promise<OperationsAttachment> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PublicApiError(400, "Không tìm thấy chứng từ.");
  const snapshot = await getDemoOperationsSnapshot();
  const match = findAttachment(snapshot.state, id);
  if (!match) throw new PublicApiError(400, "Không tìm thấy chứng từ.");
  const canView = match.financial
    ? user.role === "owner" || user.role === "administrator" || user.role === "accountant"
    : canViewOperationalAttachment(user, snapshot.state, match);
  if (!canView) throw new PublicApiError(403, "Bạn không có quyền xem chứng từ này.");
  return match.attachment;
}

function findAttachment(state: Awaited<ReturnType<typeof getDemoOperationsSnapshot>>["state"], id: string): AttachmentMatch | undefined {
  const matches: AttachmentMatch[] = [
    ...state.approvalRequests.flatMap((request) => (request.attachments ?? []).map((attachment) => ({ attachment, uploadedBy: request.submittedBy, financial: false }))),
    ...state.salesOrders.flatMap((order) => (order.attachments ?? []).map((attachment) => ({ attachment, uploadedBy: attachment.uploadedBy, financial: false }))),
    ...state.purchaseOrders.flatMap((order) => [
      ...(order.attachments ?? []).map((attachment) => ({ attachment, uploadedBy: attachment.uploadedBy, financial: false })),
      ...(order.supplierDeliveryNotices ?? []).flatMap((notice) => notice.attachments.map((attachment) => ({ attachment, uploadedBy: notice.submittedBy, financial: false })))
    ]),
    ...state.deliveryJobs.flatMap((job) => [
      ...(job.completionAttachments ?? []).map((attachment) => ({ attachment, uploadedBy: attachment.uploadedBy, financial: false, deliveryJobId: job.id })),
      ...(job.customerConfirmation?.attachments ?? []).map((attachment) => ({ attachment, uploadedBy: attachment.uploadedBy, financial: false, deliveryJobId: job.id })),
      ...(job.quantityChangeRequest?.attachments ?? []).map((attachment) => ({ attachment, uploadedBy: attachment.uploadedBy, financial: false, deliveryJobId: job.id }))
    ]),
    ...state.bankTransferProofs.flatMap((proof) => proof.attachments.map((attachment) => ({ attachment, uploadedBy: attachment.uploadedBy, financial: true }))),
    ...(state.customerPaymentProofRequests ?? []).flatMap((proof) => proof.attachments.map((attachment) => ({ attachment, uploadedBy: proof.submittedBy, financial: true })))
  ];
  return matches.find((item) => item.attachment.id === id);
}

function canViewOperationalAttachment(
  user: SafeIdentityUser,
  state: Awaited<ReturnType<typeof getDemoOperationsSnapshot>>["state"],
  match: AttachmentMatch
) {
  if (["owner", "administrator", "accountant", "dispatcher"].includes(user.role)) return true;
  if (match.uploadedBy === user.id || !match.deliveryJobId) return match.uploadedBy === user.id;

  const job = state.deliveryJobs.find((item) => item.id === match.deliveryJobId);
  if (!job) return false;
  if (user.employeeId && (job.driverId === user.employeeId || job.helperIds.includes(user.employeeId))) return true;
  if (user.role !== "customer" || !user.customerId) return false;
  return state.salesOrders.some((order) => order.id === job.salesOrderId && order.customerId === user.customerId);
}
