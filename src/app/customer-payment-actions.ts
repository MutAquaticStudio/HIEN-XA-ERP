"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getDemoOperationsSnapshot, runDemoCreateCommand } from "@/modules/operations/demo-store";
import { operationsActorForIdentity, requireIdentityUser } from "@/server/identity/auth-context";
import { removeOperationsTransferProofDocument, saveOperationsTransferProofDocument } from "@/server/infrastructure/operations-attachment-store";

export type CustomerPaymentActionResult = { ok: boolean; message: string };

const idempotencySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/);

export async function submitCustomerPaymentProofAction(formData: FormData): Promise<CustomerPaymentActionResult> {
  let attachment: Awaited<ReturnType<typeof saveOperationsTransferProofDocument>> | undefined;
  try {
    await requireSameOrigin();
    const user = await requireIdentityUser();
    if (user.role !== "customer" || !user.customerId) throw new Error("Tài khoản này chưa được cấp quyền gửi minh chứng thanh toán.");

    const salesOrderId = z.string().trim().min(1).max(128).parse(formData.get("orderId"));
    const amount = z.coerce.number().positive().parse(formData.get("amount"));
    const idempotencyKey = idempotencySchema.parse(formData.get("idempotencyKey"));
    const transferReference = z.string().trim().min(3, "Nhập mã giao dịch ngân hàng để cửa hàng đối soát.").max(160).parse(formData.get("transferReference"));
    const note = z.string().trim().max(1000).optional().parse(formData.get("note") || undefined);
    const file = formData.get("attachment");
    if (!(file instanceof File) || file.size === 0) throw new Error("Chọn ảnh hoặc PDF minh chứng chuyển khoản.");

    const snapshot = await getDemoOperationsSnapshot();
    if (!snapshot.state.salesOrders.some((order) => order.id === salesOrderId && order.customerId === user.customerId)) {
      throw new Error("Không tìm thấy đơn hàng của bạn để gửi minh chứng.");
    }

    attachment = await saveOperationsTransferProofDocument(file, operationsActorForIdentity(user), new Date().toISOString());
    const result = await runDemoCreateCommand({
      type: "submitCustomerPaymentProof",
      customerId: user.customerId,
      salesOrderId,
      amount,
      transferReference,
      note,
      attachments: [attachment]
    }, idempotencyKey, operationsActorForIdentity(user));
    revalidatePartnerPaths();
    return { ok: true, message: result.summary };
  } catch (error) {
    if (attachment) await removeOperationsTransferProofDocument(attachment);
    return { ok: false, message: error instanceof Error ? error.message : "Không thể gửi minh chứng thanh toán." };
  }
}

export async function reviewCustomerPaymentProofAction(formData: FormData): Promise<void> {
  await requireSameOrigin();
  const user = await requireIdentityUser();
  if (!["owner", "administrator", "accountant"].includes(user.role)) throw new Error("Bạn không có quyền kiểm tra minh chứng thanh toán.");
  const customerPaymentProofRequestId = z.string().trim().min(1).max(128).parse(formData.get("customerPaymentProofRequestId"));
  const idempotencyKey = idempotencySchema.parse(formData.get("idempotencyKey"));
  await runDemoCreateCommand({ type: "reviewCustomerPaymentProof", customerPaymentProofRequestId, status: "reviewed" }, idempotencyKey, operationsActorForIdentity(user));
  revalidatePath("/cash/customer-payment-proofs");
  revalidatePath("/khach-hang");
}

async function requireSameOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  if (!origin || !host || new URL(origin).host !== host) throw new Error("Yêu cầu không hợp lệ.");
}

function revalidatePartnerPaths() {
  revalidatePath("/khach-hang");
  revalidatePath("/cash/customer-payment-proofs");
}
