"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getErpV2Snapshot, runErpV2CreateCommand, runErpV2Operation } from "@/server/erp-v2/runtime";
import { operationsActorForIdentity, requireIdentityUser } from "@/server/identity/auth-context";
import { removeOperationsDeliveryImage, removeOperationsTransferProofDocument, saveOperationsDeliveryImage, saveOperationsTransferProofDocument } from "@/server/infrastructure/operations-attachment-store";

export type PortalActionResult = { ok: boolean; message: string };

const idempotencySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/);
const customerOrderSchema = z.object({
  idempotencyKey: idempotencySchema,
  deliveryAddress: z.string().trim().min(8).max(500),
  customerNote: z.string().trim().max(1000).optional(),
  paymentMethod: z.enum(["transfer", "credit_requested"]),
  lines: z.array(z.object({ productUnitId: z.string().trim().min(1).max(128), quantity: z.number().finite().positive().max(1_000_000) })).min(1).max(50)
});
const supplierResponseSchema = z.object({
  idempotencyKey: idempotencySchema,
  purchaseOrderId: z.string().trim().min(1).max(128),
  status: z.enum(["available", "unavailable"]),
  proposedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(1000).optional()
});

export async function createCustomerPortalOrderAction(input: unknown): Promise<PortalActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireIdentityUser();
    if (user.role !== "customer" || !user.customerId) throw new Error("Tài khoản này chưa được cấp quyền đặt hàng khách hàng.");
    const value = customerOrderSchema.parse(input);
    const result = await runErpV2CreateCommand({
      type: "createCustomerPortalSalesOrder",
      customerId: user.customerId,
      deliveryAddress: value.deliveryAddress,
      customerNote: value.customerNote,
      paymentMethod: value.paymentMethod,
      lines: value.lines
    }, value.idempotencyKey, operationsActorForIdentity(user));
    revalidatePartnerPaths();
    return { ok: true, message: result.summary };
  } catch (error) {
    return failure(error);
  }
}

export async function submitCustomerPaymentProofAction(formData: FormData): Promise<PortalActionResult> {
  let attachment: Awaited<ReturnType<typeof saveOperationsTransferProofDocument>> | undefined;
  try {
    await assertSameOrigin();
    const user = await requireIdentityUser();
    if (user.role !== "customer" || !user.customerId) throw new Error("Tài khoản này chưa được cấp quyền gửi minh chứng thanh toán.");
    const orderId = z.string().trim().min(1).max(128).parse(formData.get("orderId"));
    const amount = z.coerce.number().positive().parse(formData.get("amount"));
    const idempotencyKey = idempotencySchema.parse(formData.get("idempotencyKey"));
    const transferReference = z.string().trim().max(160).optional().parse(formData.get("transferReference") || undefined);
    const note = z.string().trim().max(1000).optional().parse(formData.get("note") || undefined);
    const file = formData.get("attachment");
    if (!(file instanceof File) || file.size === 0) throw new Error("Chọn ảnh hoặc PDF minh chứng chuyển khoản.");
    const snapshot = await getErpV2Snapshot();
    if (!snapshot.state.salesOrders.some((item) => item.id === orderId && item.customerId === user.customerId)) throw new Error("Không tìm thấy đơn hàng của bạn để gửi minh chứng.");
    attachment = await saveOperationsTransferProofDocument(file, operationsActorForIdentity(user), new Date().toISOString());
    const result = await runErpV2CreateCommand({
      type: "submitCustomerPaymentProof", customerId: user.customerId, salesOrderId: orderId, amount, transferReference, note, attachments: [attachment]
    }, idempotencyKey, operationsActorForIdentity(user));
    revalidatePartnerPaths();
    return { ok: true, message: result.summary };
  } catch (error) {
    if (attachment) await removeOperationsTransferProofDocument(attachment);
    return failure(error);
  }
}

export async function confirmCustomerDeliveryReceiptAction(formData: FormData): Promise<PortalActionResult> {
  let attachment: Awaited<ReturnType<typeof saveOperationsDeliveryImage>> | undefined;
  try {
    await assertSameOrigin();
    const user = await requireIdentityUser();
    if (user.role !== "customer" || !user.customerId) throw new Error("Tài khoản này chưa được cấp quyền xác nhận nhận hàng.");
    const deliveryJobId = z.string().trim().min(1).max(128).parse(formData.get("deliveryJobId"));
    const idempotencyKey = idempotencySchema.parse(formData.get("idempotencyKey"));
    const file = formData.get("receiptImage");
    if (!(file instanceof File) || file.size === 0) throw new Error("Khách hàng cần chụp một ảnh xác nhận nhận hàng.");
    const snapshot = await getErpV2Snapshot();
    const job = snapshot.state.deliveryJobs.find((item) => item.id === deliveryJobId);
    const order = job ? snapshot.state.salesOrders.find((item) => item.id === job.salesOrderId) : undefined;
    if (!job || !order || order.customerId !== user.customerId) throw new Error("Không tìm thấy chuyến giao của bạn để xác nhận.");
    attachment = await saveOperationsDeliveryImage(file, operationsActorForIdentity(user), new Date().toISOString());
    const result = await runErpV2Operation(
      "confirmCustomerDeliveryReceipt",
      idempotencyKey,
      deliveryJobId,
      operationsActorForIdentity(user),
      { attachments: [attachment] }
    );
    revalidatePartnerPaths();
    return { ok: true, message: result.summary };
  } catch (error) {
    if (attachment) await removeOperationsDeliveryImage(attachment);
    return failure(error);
  }
}

export async function submitSupplierPurchaseOrderResponseAction(input: unknown): Promise<PortalActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireIdentityUser();
    if (user.role !== "supplier" || !user.supplierId) throw new Error("Tài khoản này chưa được liên kết với nhà cung cấp.");
    const value = supplierResponseSchema.parse(input);
    const result = await runErpV2CreateCommand({
      type: "submitSupplierPurchaseOrderResponse", supplierId: user.supplierId, purchaseOrderId: value.purchaseOrderId,
      status: value.status, proposedDeliveryDate: value.proposedDeliveryDate, note: value.note
    }, value.idempotencyKey, operationsActorForIdentity(user));
    revalidatePartnerPaths();
    return { ok: true, message: result.summary };
  } catch (error) {
    return failure(error);
  }
}

export async function submitSupplierDeliveryNoticeAction(formData: FormData): Promise<PortalActionResult> {
  let attachment: Awaited<ReturnType<typeof saveOperationsTransferProofDocument>> | undefined;
  try {
    await assertSameOrigin();
    const user = await requireIdentityUser();
    if (user.role !== "supplier" || !user.supplierId) throw new Error("Tài khoản này chưa được liên kết với nhà cung cấp.");
    const purchaseOrderId = z.string().trim().min(1).max(128).parse(formData.get("purchaseOrderId"));
    const idempotencyKey = idempotencySchema.parse(formData.get("idempotencyKey"));
    const note = z.string().trim().max(1000).optional().parse(formData.get("note") || undefined);
    const lineQuantities = Object.fromEntries(Array.from(formData.entries())
      .filter(([key, value]) => key.startsWith("line:") && typeof value === "string" && value.trim())
      .map(([key, value]) => [key.slice(5), Number(value)]));
    const file = formData.get("attachment");
    if (file instanceof File && file.size > 0) attachment = await saveOperationsTransferProofDocument(file, operationsActorForIdentity(user), new Date().toISOString());
    const result = await runErpV2CreateCommand({
      type: "submitSupplierDeliveryNotice", supplierId: user.supplierId, purchaseOrderId, lineQuantities, note, attachments: attachment ? [attachment] : []
    }, idempotencyKey, operationsActorForIdentity(user));
    revalidatePartnerPaths();
    return { ok: true, message: result.summary };
  } catch (error) {
    if (attachment) await removeOperationsTransferProofDocument(attachment);
    return failure(error);
  }
}

async function assertSameOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!origin || !host || new URL(origin).host !== host.split(",")[0]?.trim()) throw new Error("Yêu cầu không đúng nguồn gửi.");
}

function revalidatePartnerPaths() {
  revalidatePath("/");
  revalidatePath("/dat-hang");
  revalidatePath("/khach-hang");
  revalidatePath("/nha-cung-cap");
}

function failure(error: unknown): PortalActionResult {
  return { ok: false, message: error instanceof Error ? error.message : "Không thể xử lý yêu cầu. Vui lòng thử lại." };
}
