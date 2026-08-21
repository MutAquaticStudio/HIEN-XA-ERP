import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getErpV2Snapshot, runErpV2CreateCommand, runErpV2Operation } from "@/server/erp-v2/runtime";
import type { OperationsActor } from "@/modules/operations/types";
import type { SafeIdentityUser } from "@/server/identity/types";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";
import {
  removeOperationsDeliveryImage,
  removeOperationsTransferProofDocument,
  saveOperationsDeliveryImage,
  saveOperationsTransferProofDocument
} from "@/server/infrastructure/operations-attachment-store";
import { PublicApiError } from "@/server/shared/public-api-error";
import { buildCustomerOrderCatalog } from "@/modules/operations/customer-order-catalog";

export type MobileRouteFormData = {
  get(name: string): string | File | null;
  entries(): IterableIterator<[string, string | File]>;
};

export const mobileIdempotencySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/);

const customerOrderSchema = z.object({
  idempotencyKey: mobileIdempotencySchema,
  deliveryAddress: z.string().trim().min(8).max(500),
  customerNote: z.string().trim().max(1000).optional(),
  paymentMethod: z.enum(["transfer", "credit_requested"]),
  lines: z.array(z.object({
    productUnitId: z.string().trim().min(1).max(128),
    quantity: z.number().finite().positive().max(1_000_000)
  })).min(1).max(50)
});

const supplierResponseSchema = z.object({
  idempotencyKey: mobileIdempotencySchema,
  purchaseOrderId: z.string().trim().min(1).max(128),
  status: z.enum(["available", "unavailable"]),
  proposedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(1000).optional()
});

const workerClaimSchema = z.object({
  idempotencyKey: mobileIdempotencySchema,
  workOrderId: z.string().trim().min(1).max(128),
  expectedVersion: z.number().int().positive().optional()
});

export async function getMobilePortalOverview(user: SafeIdentityUser) {
  const sourceSnapshot = await getErpV2Snapshot();
  const snapshot = projectOperationsSnapshot(sourceSnapshot, user);
  return {
    role: user.role,
    displayName: user.displayName,
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    source: snapshot.source,
    state: withMobileDocumentLineLabels(snapshot.state, sourceSnapshot.state.productUnits)
  };
}

export async function getMobileCustomerCatalog(user: SafeIdentityUser) {
  requireCustomer(user);
  const snapshot = await getErpV2Snapshot();
  return buildCustomerOrderCatalog(snapshot.state).map((product) => ({
    id: product.id,
    productCode: product.code,
    productName: product.name,
    unitName: product.unitName,
    ...(product.salePrice !== undefined ? { salePrice: product.salePrice } : {}),
    ...(product.taxRate !== undefined ? { saleTaxRate: product.taxRate } : {}),
    orderableOnline: product.orderableOnline,
    availability: product.availability
  }));
}

export async function createMobileCustomerOrder(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  const customerId = requireCustomer(user);
  const value = customerOrderSchema.parse(input);
  const result = await publicCommand(
    () => runErpV2CreateCommand({
      type: "createCustomerPortalSalesOrder",
      customerId,
      deliveryAddress: value.deliveryAddress,
      customerNote: value.customerNote,
      paymentMethod: value.paymentMethod,
      lines: value.lines
    }, value.idempotencyKey, actor),
    "Không thể tạo đơn nháp ở trạng thái hiện tại."
  );
  revalidatePartnerPaths();
  return { summary: result.summary, revision: result.revision, syncedAt: result.syncedAt };
}

export async function submitMobileCustomerPaymentProof(user: SafeIdentityUser, actor: OperationsActor, formData: MobileRouteFormData) {
  const customerId = requireCustomer(user);
  const orderId = z.string().trim().min(1).max(128).parse(formData.get("orderId"));
  const amount = z.coerce.number().positive().parse(formData.get("amount"));
  const idempotencyKey = mobileIdempotencySchema.parse(formData.get("idempotencyKey"));
  const transferReference = z.string().trim().max(160).optional().parse(formData.get("transferReference") || undefined);
  const note = z.string().trim().max(1000).optional().parse(formData.get("note") || undefined);
  const file = requiredFile(formData.get("attachment"), "Chọn ảnh hoặc PDF minh chứng chuyển khoản.");
  const snapshot = await getErpV2Snapshot();
  if (!snapshot.state.salesOrders.some((order) => order.id === orderId && order.customerId === customerId)) {
    throw new PublicApiError(403, "Không tìm thấy đơn hàng của bạn để gửi minh chứng.");
  }
  if (hasProcessedRequest(snapshot.state, idempotencyKey)) {
    return alreadyProcessed();
  }

  let attachment: Awaited<ReturnType<typeof saveOperationsTransferProofDocument>> | undefined;
  try {
    attachment = await saveOperationsTransferProofDocument(file, actor, new Date().toISOString());
    const savedAttachment = attachment;
    const result = await publicCommand(
      () => runErpV2CreateCommand({
        type: "submitCustomerPaymentProof",
        customerId,
        salesOrderId: orderId,
        amount,
        transferReference,
        note,
        attachments: [savedAttachment]
      }, idempotencyKey, actor),
      "Không thể gửi minh chứng thanh toán ở trạng thái hiện tại."
    );
    revalidatePartnerPaths();
    return { summary: result.summary, revision: result.revision, syncedAt: result.syncedAt };
  } catch (error) {
    if (attachment) await removeOperationsTransferProofDocument(attachment);
    throw error;
  }
}

export async function confirmMobileCustomerDeliveryReceipt(user: SafeIdentityUser, actor: OperationsActor, formData: MobileRouteFormData) {
  const customerId = requireCustomer(user);
  const deliveryJobId = z.string().trim().min(1).max(128).parse(formData.get("deliveryJobId"));
  const idempotencyKey = mobileIdempotencySchema.parse(formData.get("idempotencyKey"));
  const file = requiredFile(formData.get("receiptImage"), "Khách hàng cần chụp một ảnh xác nhận nhận hàng.");
  const snapshot = await getErpV2Snapshot();
  const job = snapshot.state.deliveryJobs.find((item) => item.id === deliveryJobId);
  const order = job ? snapshot.state.salesOrders.find((item) => item.id === job.salesOrderId) : undefined;
  if (!job || !order || order.customerId !== customerId) {
    throw new PublicApiError(403, "Không tìm thấy chuyến giao của bạn để xác nhận.");
  }
  if (hasProcessedRequest(snapshot.state, idempotencyKey)) {
    return alreadyProcessed();
  }

  let attachment: Awaited<ReturnType<typeof saveOperationsDeliveryImage>> | undefined;
  try {
    attachment = await saveOperationsDeliveryImage(file, actor, new Date().toISOString());
    const savedAttachment = attachment;
    const result = await publicCommand(
      () => runErpV2Operation("confirmCustomerDeliveryReceipt", idempotencyKey, deliveryJobId, actor, { attachments: [savedAttachment] }),
      "Không thể gửi ảnh xác nhận nhận hàng ở trạng thái hiện tại."
    );
    revalidatePartnerPaths();
    return { summary: result.summary, revision: result.revision, syncedAt: result.syncedAt };
  } catch (error) {
    if (attachment) await removeOperationsDeliveryImage(attachment);
    throw error;
  }
}

export async function submitMobileSupplierResponse(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  const supplierId = requireSupplier(user);
  const value = supplierResponseSchema.parse(input);
  const snapshot = await getErpV2Snapshot();
  if (!snapshot.state.purchaseOrders.some((order) => order.id === value.purchaseOrderId && order.supplierId === supplierId)) {
    throw new PublicApiError(403, "Không tìm thấy phiếu mua thuộc nhà cung cấp này.");
  }
  const result = await publicCommand(
    () => runErpV2CreateCommand({
      type: "submitSupplierPurchaseOrderResponse",
      supplierId,
      purchaseOrderId: value.purchaseOrderId,
      status: value.status,
      proposedDeliveryDate: value.proposedDeliveryDate,
      note: value.note
    }, value.idempotencyKey, actor),
    "Không thể gửi phản hồi khả năng cung ứng ở trạng thái hiện tại."
  );
  revalidatePartnerPaths();
  return { summary: result.summary, revision: result.revision, syncedAt: result.syncedAt };
}

export async function submitMobileSupplierDeliveryNotice(user: SafeIdentityUser, actor: OperationsActor, formData: MobileRouteFormData) {
  const supplierId = requireSupplier(user);
  const purchaseOrderId = z.string().trim().min(1).max(128).parse(formData.get("purchaseOrderId"));
  const idempotencyKey = mobileIdempotencySchema.parse(formData.get("idempotencyKey"));
  const note = z.string().trim().max(1000).optional().parse(formData.get("note") || undefined);
  const lineQuantities = Object.fromEntries(Array.from(formData.entries())
    .filter(([key, value]) => key.startsWith("line:") && typeof value === "string" && value.trim())
    .map(([key, value]) => [key.slice(5), z.coerce.number().positive().parse(value)]));
  const snapshot = await getErpV2Snapshot();
  if (!snapshot.state.purchaseOrders.some((order) => order.id === purchaseOrderId && order.supplierId === supplierId)) {
    throw new PublicApiError(403, "Không tìm thấy phiếu mua thuộc nhà cung cấp này.");
  }
  if (hasProcessedRequest(snapshot.state, idempotencyKey)) {
    return alreadyProcessed();
  }

  const file = optionalFile(formData.get("attachment"));
  let attachment: Awaited<ReturnType<typeof saveOperationsTransferProofDocument>> | undefined;
  try {
    if (file) attachment = await saveOperationsTransferProofDocument(file, actor, new Date().toISOString());
    const result = await publicCommand(
      () => runErpV2CreateCommand({
        type: "submitSupplierDeliveryNotice",
        supplierId,
        purchaseOrderId,
        lineQuantities,
        note,
        attachments: attachment ? [attachment] : []
      }, idempotencyKey, actor),
      "Không thể gửi thông báo giao hàng ở trạng thái hiện tại."
    );
    revalidatePartnerPaths();
    return { summary: result.summary, revision: result.revision, syncedAt: result.syncedAt };
  } catch (error) {
    if (attachment) await removeOperationsTransferProofDocument(attachment);
    throw error;
  }
}

export async function submitMobileDeliveryCompletion(user: SafeIdentityUser, actor: OperationsActor, formData: MobileRouteFormData) {
  if (user.role !== "driver" && user.role !== "worker") {
    throw new PublicApiError(403, "Chỉ tài xế hoặc thợ được phân công mới được gửi xác nhận giao hàng.");
  }
  const deliveryJobId = z.string().trim().min(1).max(128).parse(formData.get("deliveryJobId"));
  const idempotencyKey = mobileIdempotencySchema.parse(formData.get("idempotencyKey"));
  const recipientName = z.string().trim().min(2).max(160).parse(formData.get("recipientName"));
  const evidence = z.string().trim().min(5).max(1000).parse(formData.get("evidence"));
  const file = requiredFile(formData.get("completionImage"), "Chụp ít nhất một ảnh xác nhận đã giao.");
  const snapshot = await getErpV2Snapshot();
  const employee = user.employeeId
    ? snapshot.state.employees.find((item) =>
      item.id === user.employeeId && item.roleType === user.role && item.status === "active"
    )
    : undefined;
  const job = snapshot.state.deliveryJobs.find((item) => item.id === deliveryJobId);
  if (!employee || !job || (job.driverId !== employee.id && !job.helperIds.includes(employee.id))) {
    throw new PublicApiError(403, "Bạn không được xác nhận chuyến giao này.");
  }
  if (hasProcessedRequest(snapshot.state, idempotencyKey)) {
    return alreadyProcessed();
  }

  let attachment: Awaited<ReturnType<typeof saveOperationsDeliveryImage>> | undefined;
  try {
    attachment = await saveOperationsDeliveryImage(file, actor, new Date().toISOString());
    const savedAttachment = attachment;
    const result = await publicCommand(
      () => runErpV2Operation("submitDeliveryCompletion", idempotencyKey, deliveryJobId, actor, {
        recipientName,
        evidence,
        attachments: [savedAttachment]
      }),
      "Không thể gửi xác nhận giao hàng ở trạng thái hiện tại."
    );
    revalidatePath("/");
    return { summary: result.summary, revision: result.revision, syncedAt: result.syncedAt };
  } catch (error) {
    if (attachment) await removeOperationsDeliveryImage(attachment);
    throw error;
  }
}

export async function claimMobileWorkOrder(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  if (user.role !== "worker") {
    throw new PublicApiError(403, "Chỉ tài khoản Thợ mới được nhận việc trên ứng dụng.");
  }
  const value = workerClaimSchema.parse(input);
  const snapshot = await getErpV2Snapshot();
  assertWorkerClaimScope(user, snapshot.state, value.workOrderId);
  const result = await publicCommand(
    () => runErpV2Operation("claimOpenSalesWorkOrder", value.idempotencyKey, value.workOrderId, actor, {
      expectedVersion: value.expectedVersion
    }),
    "Công việc đã được người khác nhận hoặc không còn mở."
  );
  if (result.summary.startsWith("ORDER_ALREADY_CLAIMED:")) {
    throw new PublicApiError(412, "Công việc đã có người nhận hoặc đã thay đổi. Vui lòng tải lại danh sách.");
  }
  revalidatePath("/");
  return { summary: result.summary, revision: result.revision, syncedAt: result.syncedAt };
}

function assertWorkerClaimScope(
  user: SafeIdentityUser,
  state: Awaited<ReturnType<typeof getErpV2Snapshot>>["state"],
  workOrderId: string
) {
  const workOrder = state.workOrders.find((item) => item.id === workOrderId);
  if (!workOrder || !user.employeeId) {
    throw new PublicApiError(403, "Không tìm thấy công việc trong phạm vi được giao.");
  }

  if (workOrder.status !== "open") {
    throw new PublicApiError(412, "Công việc không còn chờ nhận. Vui lòng tải lại danh sách.");
  }

  const assignedEmployeeIds = new Set([
    ...workOrder.participants.map((participant) => participant.employeeId),
    ...(workOrder.claimedByEmployeeId ? [workOrder.claimedByEmployeeId] : [])
  ]);
  if (assignedEmployeeIds.size > 0 && !assignedEmployeeIds.has(user.employeeId)) {
    throw new PublicApiError(403, "Bạn không được phép nhận công việc được giao cho người khác.");
  }
}

function requireCustomer(user: SafeIdentityUser) {
  if (user.role !== "customer" || !user.customerId) {
    throw new PublicApiError(403, "Tài khoản này chưa được liên kết hồ sơ khách hàng.");
  }
  return user.customerId;
}

function requireSupplier(user: SafeIdentityUser) {
  if (user.role !== "supplier" || !user.supplierId) {
    throw new PublicApiError(403, "Tài khoản này chưa được liên kết hồ sơ nhà cung cấp.");
  }
  return user.supplierId;
}

function requiredFile(value: ReturnType<MobileRouteFormData["get"]>, message: string) {
  if (!(value instanceof File) || value.size === 0) {
    throw new PublicApiError(400, message);
  }
  return value;
}

function optionalFile(value: ReturnType<MobileRouteFormData["get"]>) {
  return value instanceof File && value.size > 0 ? value : undefined;
}

function hasProcessedRequest(state: { processedOperations: Array<{ idempotencyKey: string }> }, idempotencyKey: string) {
  return state.processedOperations.some((entry) => entry.idempotencyKey === idempotencyKey);
}

function alreadyProcessed() {
  return { summary: "Yêu cầu này đã được xử lý trước đó, hệ thống không ghi trùng." };
}

async function publicCommand<T>(run: () => Promise<T>, fallback: string) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PublicApiError || error instanceof z.ZodError) throw error;
    throw new PublicApiError(400, fallback);
  }
}

function revalidatePartnerPaths() {
  revalidatePath("/");
  revalidatePath("/dat-hang");
  revalidatePath("/khach-hang");
  revalidatePath("/nha-cung-cap");
}

function normalizeName(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function withMobileDocumentLineLabels(
  state: Awaited<ReturnType<typeof getErpV2Snapshot>>["state"],
  sourceProductUnits: Awaited<ReturnType<typeof getErpV2Snapshot>>["state"]["productUnits"]
) {
  const labelsByProductUnitId = new Map(
    sourceProductUnits.map((product) => [product.id, {
      productName: product.productName,
      unitName: product.unitName
    }])
  );
  const labelLine = <T extends { productUnitId: string }>(line: T) => {
    const label = labelsByProductUnitId.get(line.productUnitId);
    return {
      ...line,
      productName: label?.productName ?? "Vật tư không xác định",
      unitName: label?.unitName ?? ""
    };
  };

  return {
    ...state,
    salesOrders: state.salesOrders.map((order) => ({
      ...order,
      lines: order.lines.map(labelLine)
    })),
    purchaseOrders: state.purchaseOrders.map((order) => ({
      ...order,
      lines: order.lines.map(labelLine)
    }))
  };
}
