import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getErpV2Snapshot, runErpV2Operation } from "@/server/erp-v2/runtime";
import { stockBalance } from "@/modules/operations/selectors";
import type { OperationName, OperationOptions, OperationsActor, OperationsAttachment, OperationsState } from "@/modules/operations/types";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";
import type { SafeIdentityUser } from "@/server/identity/types";
import { removeOperationsDocumentImage, removeOperationsReceiptImage, saveOperationsDocumentImage, saveOperationsReceiptImage } from "@/server/infrastructure/operations-attachment-store";
import { PublicApiError } from "@/server/shared/public-api-error";
import { OperationInputError } from "@/modules/operations/errors";
import { mobileIdempotencySchema, type MobileRouteFormData } from "./mobile-portal-service";

const identifierSchema = z.string().trim().min(1).max(128);
const reasonSchema = z.string().trim().min(5).max(1_000);
const positiveVersionSchema = z.number().int().positive();
const positiveQuantitySchema = z.number().finite().positive();
const nonNegativeQuantitySchema = z.number().finite().nonnegative();

const inventoryActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    approvalRequestId: identifierSchema,
    expectedVersion: positiveVersionSchema,
    idempotencyKey: mobileIdempotencySchema
  }).strict(),
  z.object({
    action: z.literal("reject"),
    approvalRequestId: identifierSchema,
    expectedVersion: positiveVersionSchema,
    reason: reasonSchema,
    idempotencyKey: mobileIdempotencySchema
  }).strict(),
  z.object({
    action: z.literal("post"),
    purchaseOrderLineId: identifierSchema,
    expectedVersion: positiveVersionSchema,
    quantity: positiveQuantitySchema.optional(),
    idempotencyKey: mobileIdempotencySchema
  }).strict(),
  z.object({
    action: z.literal("submit"),
    purchaseOrderLineId: identifierSchema,
    expectedVersion: positiveVersionSchema,
    quantity: positiveQuantitySchema,
    idempotencyKey: mobileIdempotencySchema
  }).strict()
]);

const transferSchema = z.object({
  idempotencyKey: mobileIdempotencySchema,
  sourceWarehouseId: identifierSchema,
  destinationWarehouseId: identifierSchema,
  productUnitId: identifierSchema,
  quantity: positiveQuantitySchema,
  reason: reasonSchema
}).strict();

const countAdjustmentSchema = z.object({
  idempotencyKey: mobileIdempotencySchema,
  warehouseId: identifierSchema,
  productUnitId: identifierSchema,
  countedQuantity: nonNegativeQuantitySchema,
  reason: reasonSchema
}).strict();

const countSessionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), idempotencyKey: mobileIdempotencySchema, warehouseId: identifierSchema }).strict(),
  z.object({ action: z.literal("add_line"), idempotencyKey: mobileIdempotencySchema, sessionId: identifierSchema, expectedVersion: positiveVersionSchema, productUnitId: identifierSchema }).strict(),
  z.object({ action: z.literal("save_line"), idempotencyKey: mobileIdempotencySchema, sessionId: identifierSchema, expectedVersion: positiveVersionSchema, lineId: identifierSchema, countedQuantity: nonNegativeQuantitySchema, reason: z.string().trim().max(1_000).optional() }).strict(),
  z.object({ action: z.literal("skip_line"), idempotencyKey: mobileIdempotencySchema, sessionId: identifierSchema, expectedVersion: positiveVersionSchema, lineId: identifierSchema }).strict(),
  z.object({ action: z.literal("submit"), idempotencyKey: mobileIdempotencySchema, sessionId: identifierSchema, expectedVersion: positiveVersionSchema }).strict(),
  z.object({ action: z.literal("approve"), idempotencyKey: mobileIdempotencySchema, sessionId: identifierSchema, expectedVersion: positiveVersionSchema }).strict(),
  z.object({ action: z.literal("recount"), idempotencyKey: mobileIdempotencySchema, sessionId: identifierSchema, expectedVersion: positiveVersionSchema, reason: reasonSchema }).strict(),
  z.object({ action: z.literal("reject"), idempotencyKey: mobileIdempotencySchema, sessionId: identifierSchema, expectedVersion: positiveVersionSchema, reason: reasonSchema }).strict(),
  z.object({ action: z.literal("reverse"), idempotencyKey: mobileIdempotencySchema, sessionId: identifierSchema, expectedVersion: positiveVersionSchema, reason: reasonSchema }).strict()
]);

const movementReversalSchema = z.object({
  idempotencyKey: mobileIdempotencySchema,
  movementId: identifierSchema,
  reason: reasonSchema
}).strict();

const deliveryWorkflowSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start_loading"), idempotencyKey: mobileIdempotencySchema, deliveryJobId: identifierSchema }).strict(),
  z.object({ action: z.literal("dispatch"), idempotencyKey: mobileIdempotencySchema, deliveryJobId: identifierSchema }).strict(),
  z.object({ action: z.literal("fail"), idempotencyKey: mobileIdempotencySchema, deliveryJobId: identifierSchema, reason: reasonSchema }).strict()
]);

const quantityChangeSchema = z.object({
  idempotencyKey: mobileIdempotencySchema,
  deliveryJobId: identifierSchema,
  reason: reasonSchema,
  reportedLines: z.array(z.object({
    lineId: identifierSchema,
    quantity: nonNegativeQuantitySchema
  }).strict()).min(1).max(100)
}).strict().superRefine((value, context) => {
  const lineIds = new Set<string>();
  for (const line of value.reportedLines) {
    if (lineIds.has(line.lineId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["reportedLines"], message: "Mỗi dòng hàng chỉ được báo một lần." });
    }
    lineIds.add(line.lineId);
  }
});

const quantityChangeApprovalSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), idempotencyKey: mobileIdempotencySchema, deliveryJobId: identifierSchema }).strict(),
  z.object({ action: z.literal("reject"), idempotencyKey: mobileIdempotencySchema, deliveryJobId: identifierSchema, reason: reasonSchema }).strict()
]);

const completionApprovalSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), idempotencyKey: mobileIdempotencySchema, approvalRequestId: identifierSchema }).strict(),
  z.object({ action: z.literal("reject"), idempotencyKey: mobileIdempotencySchema, approvalRequestId: identifierSchema, reason: reasonSchema }).strict()
]);

type SnapshotState = Awaited<ReturnType<typeof getErpV2Snapshot>>["state"];

export async function getMobileInventoryOverview(user: SafeIdentityUser) {
  const snapshot = await getErpV2Snapshot();
  const projected = projectOperationsSnapshot(snapshot, user);
  const state = projected.state;

  if (user.role === "worker") {
    return {
      revision: projected.revision,
      syncedAt: projected.syncedAt,
      source: projected.source,
      products: productSummaries(state),
      warehouses: [],
      stock: [],
      movements: [],
      receiptLines: receiptLines(state),
      approvalRequests: []
    };
  }

  requireInventoryReader(user);
  const stock = inventoryStockRows(state);
  return {
    revision: projected.revision,
    syncedAt: projected.syncedAt,
    source: projected.source,
    products: productSummaries(state),
    warehouses: state.warehouses.map((warehouse) => ({ id: warehouse.id, code: warehouse.code, name: warehouse.name, status: warehouse.status })),
    stock,
    movements: state.inventoryMovements.map((movement) => ({
      id: movement.id,
      movementType: movement.movementType,
      sourceDocument: movement.sourceDocument,
      postingKey: movement.postingKey,
      warehouseId: movement.warehouseId,
      productUnitId: movement.productUnitId,
      quantity: movement.quantity,
      postedAt: movement.postedAt,
      reason: movement.reason,
      reversedById: movement.reversedById
    })),
    receiptLines: receiptLines(state),
    approvalRequests: isApprovalRole(user)
      ? state.approvalRequests.filter((request) => request.type === "goods_receipt").map((request) => ({
          id: request.id,
          documentNo: request.documentNo,
          targetId: request.targetId,
          status: request.status,
          quantity: request.quantity,
          submittedAt: request.submittedAt,
          submittedByName: request.submittedByName,
          rejectionReason: request.rejectionReason
        }))
      : []
  };
}

export async function getMobileInventoryStockDetail(user: SafeIdentityUser, warehouseId: string, productUnitId: string) {
  requireInventoryReader(user);
  const snapshot = projectOperationsSnapshot(await getErpV2Snapshot(), user);
  const state = snapshot.state;
  const warehouse = state.warehouses.find((item) => item.id === warehouseId);
  const product = state.productUnits.find((item) => item.id === productUnitId);
  if (!warehouse || !product) {
    throw new PublicApiError(400, "Không tìm thấy tồn kho cần xem.");
  }

  const movements = state.inventoryMovements
    .filter((item) => item.warehouseId === warehouseId && item.productUnitId === productUnitId)
    .map((movement) => ({
      id: movement.id,
      movementType: movement.movementType,
      sourceDocument: movement.sourceDocument,
      postingKey: movement.postingKey,
      quantity: movement.quantity,
      postedAt: movement.postedAt,
      reason: movement.reason,
      reversedById: movement.reversedById
    }));
  const policy = product.reorderPolicies?.find((item) => item.warehouseId === warehouseId);
  const quantity = stockBalance(state, warehouseId, productUnitId);
  return {
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    stock: {
      warehouse: { id: warehouse.id, code: warehouse.code, name: warehouse.name },
      product: { id: product.id, productCode: product.productCode, productName: product.productName, unitName: product.unitName },
      quantity,
      minimumQuantity: policy?.minimumQuantity,
      alert: stockAlert(quantity, policy?.minimumQuantity),
      movements
    }
  };
}

export async function submitMobileGoodsReceipt(user: SafeIdentityUser, actor: OperationsActor, formData: MobileRouteFormData) {
  if (user.role !== "worker") {
    throw new PublicApiError(403, "Chỉ tài khoản Thợ được gửi phiếu nhập chờ duyệt.");
  }
  requirePermission(actor, "inventory.submit_receipt");
  const value = inventoryActionSchema.options[3].parse({
    action: "submit",
    idempotencyKey: formData.get("idempotencyKey"),
    purchaseOrderLineId: formData.get("purchaseOrderLineId"),
    expectedVersion: Number(formData.get("expectedVersion")),
    quantity: Number(formData.get("quantity"))
  });
  const image = formData.get("receiptImage");
  if (!(image instanceof File) || image.size === 0) {
    throw new PublicApiError(400, "Chụp ít nhất một ảnh xác nhận nhập hàng.");
  }

  const snapshot = await getErpV2Snapshot();
  if (hasProcessedRequest(snapshot.state, value.idempotencyKey)) return alreadyProcessed();
  assertWorkerReceiptVisibility(snapshot.state, user, value.purchaseOrderLineId);
  assertExpectedReceiptVersion(snapshot.state, value.purchaseOrderLineId, value.expectedVersion);

  let attachment: OperationsAttachment | undefined;
  try {
    attachment = await saveOperationsReceiptImage(image, actor, new Date().toISOString());
    return await executeOperation("submitGoodsReceipt", value.idempotencyKey, value.purchaseOrderLineId, actor, {
      expectedVersion: value.expectedVersion,
      quantity: value.quantity,
      attachments: [attachment]
    }, "Không thể gửi phiếu nhập ở trạng thái hiện tại.");
  } catch (error) {
    if (attachment) await removeOperationsReceiptImage(attachment);
    throw error;
  }
}

export async function runMobileGoodsReceiptAction(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  const value = inventoryActionSchema.parse(input);
  if (value.action === "submit") {
    throw new PublicApiError(400, "Gửi phiếu nhập cần ảnh riêng tư; dùng multipart/form-data.");
  }
  if (value.action === "post") {
    requirePermission(actor, "inventory.post_receipt");
    assertExpectedReceiptVersion((await getErpV2Snapshot()).state, value.purchaseOrderLineId, value.expectedVersion);
    return executeOperation("postGoodsReceipt", value.idempotencyKey, value.purchaseOrderLineId, actor, {
      expectedVersion: value.expectedVersion,
      quantity: value.quantity
    }, "Không thể ghi nhận nhập kho ở trạng thái hiện tại.");
  }

  requireApprovalRole(user, actor, value.action === "approve" ? "inventory.approve_receipt" : "inventory.reject_receipt");
  const snapshot = await getErpV2Snapshot();
  const approval = snapshot.state.approvalRequests.find((item) => item.id === value.approvalRequestId && item.type === "goods_receipt");
  if (!approval) throw new PublicApiError(400, "Không tìm thấy phiếu nhập chờ duyệt.");
  assertExpectedReceiptVersion(snapshot.state, approval.targetId, value.expectedVersion);
  return executeOperation(
    value.action === "approve" ? "approveGoodsReceipt" : "rejectGoodsReceipt",
    value.idempotencyKey,
    value.approvalRequestId,
    actor,
    { expectedVersion: value.expectedVersion, reason: value.action === "reject" ? value.reason : undefined },
    value.action === "approve" ? "Không thể duyệt phiếu nhập ở trạng thái hiện tại." : "Không thể từ chối phiếu nhập ở trạng thái hiện tại."
  );
}

export async function runMobileInventoryTransfer(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  requireInventoryOperator(user, actor, "inventory.post_transfer");
  const value = transferSchema.parse(input);
  return executeOperation("postInventoryTransfer", value.idempotencyKey, undefined, actor, value, "Không thể chuyển kho ở trạng thái hiện tại.");
}

export async function runMobileInventoryCountAdjustment(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  requireInventoryOperator(user, actor, "inventory.create_count_session");
  const value = countAdjustmentSchema.parse(input);
  return executeOperation("postInventoryCountAdjustment", value.idempotencyKey, undefined, actor, value, "Không thể tạo phiếu kiểm kê ở trạng thái hiện tại.");
}

export async function getMobileInventoryCountSessions(user: SafeIdentityUser, actor: OperationsActor) {
  requireInventoryReader(user);
  const snapshot = await getErpV2Snapshot();
  const canSeeValue = ["owner", "administrator", "accountant"].includes(user.role);
  const sessions = (snapshot.state.inventoryCountSessions ?? []).filter((session) => !actor.warehouseIds || actor.warehouseIds.includes(session.warehouseId)).map((session) => ({ id: session.id, documentNo: session.documentNo, warehouseId: session.warehouseId, status: session.status, version: session.version, createdAt: session.createdAt, submittedAt: session.submittedAt, reviewedAt: session.reviewedAt, rejectionReason: session.rejectionReason, lines: session.lines.map((line) => ({ id: line.id, productUnitId: line.productUnitId, bookQuantity: line.bookQuantity, countedQuantity: line.countedQuantity, differenceQuantity: line.differenceQuantity, status: line.status, reason: line.reason, estimatedDifferenceValue: canSeeValue ? line.estimatedDifferenceValue : undefined, attachmentIds: line.attachments.map((attachment) => attachment.id) })) }));
  return { revision: snapshot.revision, syncedAt: snapshot.syncedAt, sessions };
}

export async function runMobileInventoryCountSession(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  const value = countSessionSchema.parse(input);
  const approvalAction = ["approve", "recount", "reject", "reverse"].includes(value.action);
  if (approvalAction) {
    if (!["owner", "administrator", "accountant"].includes(user.role)) throw new PublicApiError(403, "Chỉ Chủ cửa hàng hoặc Kế toán được duyệt phiếu kiểm kê.");
  } else requireInventoryOperator(user, actor, value.action === "create" ? "inventory.create_count_session" : value.action === "submit" ? "inventory.submit_count_session" : "inventory.record_count_line");
  const operation = value.action === "create" ? "createInventoryCountSession" : value.action === "add_line" ? "addInventoryCountLine" : value.action === "save_line" || value.action === "skip_line" ? "recordInventoryCountLine" : value.action === "submit" ? "submitInventoryCountSession" : value.action === "approve" ? "approveInventoryCountSession" : value.action === "recount" ? "requestInventoryCountRecount" : value.action === "reject" ? "rejectInventoryCountSession" : "reverseInventoryCountSession";
  if (value.action === "save_line") {
    const session = (await getErpV2Snapshot()).state.inventoryCountSessions?.find((item) => item.id === value.sessionId);
    const line = session?.lines.find((item) => item.id === value.lineId);
    if (line && value.countedQuantity !== line.bookQuantity) throw new PublicApiError(400, "Chênh lệch kiểm kê cần ảnh hoặc biên bản riêng tư; dùng multipart/form-data.");
  }
  const targetId = value.action === "create" ? undefined : value.sessionId;
  const options = value.action === "create" ? { warehouseId: value.warehouseId } : value.action === "add_line" ? { expectedVersion: value.expectedVersion, productUnitId: value.productUnitId } : value.action === "save_line" ? { expectedVersion: value.expectedVersion, productUnitId: value.lineId, countedQuantity: value.countedQuantity, reason: value.reason } : value.action === "skip_line" ? { expectedVersion: value.expectedVersion, productUnitId: value.lineId, skipCountLine: true } : "reason" in value ? { expectedVersion: value.expectedVersion, reason: value.reason } : { expectedVersion: value.expectedVersion };
  return executeOperation(operation, value.idempotencyKey, targetId, actor, options, "Không thể cập nhật phiếu kiểm kê ở trạng thái hiện tại.");
}

export async function submitMobileInventoryCountLine(user: SafeIdentityUser, actor: OperationsActor, formData: MobileRouteFormData) {
  requireInventoryOperator(user, actor, "inventory.record_count_line");
  const value = countSessionSchema.options[2].parse({ action: "save_line", idempotencyKey: formData.get("idempotencyKey"), sessionId: formData.get("sessionId"), expectedVersion: Number(formData.get("expectedVersion")), lineId: formData.get("lineId"), countedQuantity: Number(formData.get("countedQuantity")), reason: formData.get("reason") || undefined });
  const snapshot = await getErpV2Snapshot();
  const line = snapshot.state.inventoryCountSessions?.find((item) => item.id === value.sessionId)?.lines.find((item) => item.id === value.lineId);
  if (!line) throw new PublicApiError(400, "Không tìm thấy dòng kiểm kê cần lưu.");
  const file = formData.get("attachment");
  let attachment: OperationsAttachment | undefined;
  try {
    if (value.countedQuantity !== line.bookQuantity) {
      if (!(file instanceof File) || file.size === 0) throw new PublicApiError(400, "Chênh lệch kiểm kê cần ảnh hoặc biên bản riêng tư.");
      attachment = await saveOperationsDocumentImage(file, actor, new Date().toISOString());
    }
    return await executeOperation("recordInventoryCountLine", value.idempotencyKey, value.sessionId, actor, { expectedVersion: value.expectedVersion, productUnitId: value.lineId, countedQuantity: value.countedQuantity, reason: value.reason, attachments: attachment ? [attachment] : [] }, "Không thể lưu số đếm kiểm kê.");
  } catch (error) {
    if (attachment) await removeOperationsDocumentImage(attachment);
    throw error;
  }
}

export async function runMobileInventoryMovementReversal(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  requireInventoryOperator(user, actor, "inventory.reverse_movement");
  const value = movementReversalSchema.parse(input);
  return executeOperation("reverseInventoryMovement", value.idempotencyKey, value.movementId, actor, { reason: value.reason }, "Không thể đảo phát sinh kho ở trạng thái hiện tại.");
}

export async function getMobileDeliveryOverview(user: SafeIdentityUser, jobId?: string) {
  requireDeliveryReader(user);
  const snapshot = projectOperationsSnapshot(await getErpV2Snapshot(), user);
  const state = snapshot.state;
  const jobs = state.deliveryJobs
    .filter((job) => !jobId || job.id === jobId)
    .map((job) => deliveryJobSummary(state, user, job));
  if (jobId && jobs.length === 0) {
    throw new PublicApiError(403, "Bạn không có quyền xem chuyến giao này.");
  }
  return {
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    source: snapshot.source,
    jobs,
    approvalRequests: isApprovalRole(user)
      ? state.approvalRequests.filter((request) => request.type === "delivery_completion").map((request) => ({
          id: request.id,
          documentNo: request.documentNo,
          targetId: request.targetId,
          status: request.status,
          recipientName: request.recipientName,
          evidence: request.evidence,
          submittedAt: request.submittedAt,
          submittedByName: request.submittedByName,
          rejectionReason: request.rejectionReason
        }))
      : []
  };
}

export async function runMobileDeliveryWorkflow(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  const value = deliveryWorkflowSchema.parse(input);
  const operation: OperationName = value.action === "start_loading"
    ? "startDeliveryLoading"
    : value.action === "dispatch"
      ? "dispatchDelivery"
      : "failDelivery";
  requirePermission(actor, operation === "startDeliveryLoading" ? "delivery.start_loading" : operation === "dispatchDelivery" ? "delivery.dispatch" : "delivery.fail");
  await assertDeliveryMutationScope(user, value.deliveryJobId);
  return executeOperation(operation, value.idempotencyKey, value.deliveryJobId, actor, value.action === "fail" ? { reason: value.reason } : undefined, "Không thể cập nhật trạng thái chuyến giao.");
}

export async function runMobileDeliveryQuantityChange(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  if (user.role !== "driver" && user.role !== "worker") {
    throw new PublicApiError(403, "Chỉ tài xế hoặc thợ được phân công mới được báo chênh lệch.");
  }
  requirePermission(actor, "delivery.request_quantity_change");
  const value = quantityChangeSchema.parse(input);
  const snapshot = await getErpV2Snapshot();
  const scoped = projectOperationsSnapshot(snapshot, user).state;
  const job = scoped.deliveryJobs.find((item) => item.id === value.deliveryJobId);
  const order = job ? scoped.salesOrders.find((item) => item.id === job.salesOrderId) : undefined;
  if (!job || !order) throw new PublicApiError(403, "Bạn không được báo chênh lệch cho chuyến giao này.");

  const reportedByLineId = new Map(value.reportedLines.map((line) => [line.lineId, line.quantity]));
  const lineQuantities: Record<string, number> = {};
  let hasDifference = false;
  for (const line of order.lines.filter((item) => item.sourceType === "warehouse")) {
    const remaining = line.quantity - line.deliveredQuantity;
    const reported = reportedByLineId.get(line.id) ?? remaining;
    if (!Number.isFinite(reported) || reported < 0 || reported > remaining) {
      throw new PublicApiError(400, "Số lượng thực tế phải từ 0 đến số lượng còn phải giao.");
    }
    lineQuantities[line.id] = reported;
    hasDifference ||= reported !== remaining;
  }
  if (!hasDifference) {
    throw new PublicApiError(400, "Chỉ gửi báo chênh lệch khi số lượng thực tế khác số lượng còn phải giao.");
  }
  return executeOperation("requestDeliveryQuantityChange", value.idempotencyKey, value.deliveryJobId, actor, {
    reason: value.reason,
    lineQuantities
  }, "Không thể gửi báo chênh lệch ở trạng thái hiện tại.");
}

export async function runMobileDeliveryQuantityChangeApproval(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  const value = quantityChangeApprovalSchema.parse(input);
  requireApprovalRole(user, actor, value.action === "approve" ? "delivery.approve_quantity_change" : "delivery.reject_quantity_change");
  return executeOperation(
    value.action === "approve" ? "approveDeliveryQuantityChange" : "rejectDeliveryQuantityChange",
    value.idempotencyKey,
    value.deliveryJobId,
    actor,
    value.action === "reject" ? { reason: value.reason } : undefined,
    value.action === "approve" ? "Không thể duyệt báo chênh lệch." : "Không thể từ chối báo chênh lệch."
  );
}

export async function runMobileDeliveryCompletionApproval(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  const value = completionApprovalSchema.parse(input);
  requireApprovalRole(user, actor, value.action === "approve" ? "delivery.approve_completion" : "delivery.reject_completion");
  return executeOperation(
    value.action === "approve" ? "approveDeliveryCompletion" : "rejectDeliveryCompletion",
    value.idempotencyKey,
    value.approvalRequestId,
    actor,
    value.action === "reject" ? { reason: value.reason } : undefined,
    value.action === "approve" ? "Không thể duyệt xác nhận giao hàng." : "Không thể từ chối xác nhận giao hàng."
  );
}

function productSummaries(state: OperationsState) {
  return state.productUnits.map((product) => ({
    id: product.id,
    productCode: product.productCode,
    productName: product.productName,
    unitName: product.unitName,
    status: product.status
  }));
}

function inventoryStockRows(state: OperationsState) {
  const keys = new Set<string>();
  for (const movement of state.inventoryMovements) keys.add(`${movement.warehouseId}:${movement.productUnitId}`);
  for (const product of state.productUnits) {
    for (const policy of product.reorderPolicies ?? []) keys.add(`${policy.warehouseId}:${product.id}`);
  }
  return [...keys].flatMap((key) => {
    const [warehouseId, productUnitId] = key.split(":");
    const warehouse = state.warehouses.find((item) => item.id === warehouseId);
    const product = state.productUnits.find((item) => item.id === productUnitId);
    if (!warehouse || !product) return [];
    const policy = product.reorderPolicies?.find((item) => item.warehouseId === warehouseId);
    const quantity = stockBalance(state, warehouseId, productUnitId);
    return [{
      warehouseId,
      productUnitId,
      quantity,
      minimumQuantity: policy?.minimumQuantity,
      alert: stockAlert(quantity, policy?.minimumQuantity)
    }];
  });
}

function stockAlert(quantity: number, minimumQuantity: number | undefined) {
  if (quantity <= 0) return "out_of_stock" as const;
  if (minimumQuantity !== undefined && quantity <= minimumQuantity) return "low_stock" as const;
  return "healthy" as const;
}

function receiptLines(state: OperationsState) {
  const products = new Map(state.productUnits.map((product) => [product.id, product]));
  return state.purchaseOrders.flatMap((order) => order.lines
    .filter((line) => line.destinationType === "warehouse" && line.receivedQuantity < line.orderedQuantity)
    .map((line) => ({
      id: line.id,
      purchaseOrderId: order.id,
      documentNo: order.documentNo,
      productUnitId: line.productUnitId,
      productName: products.get(line.productUnitId)?.productName ?? "Vật tư không xác định",
      unitName: products.get(line.productUnitId)?.unitName ?? "",
      remainingQuantity: line.orderedQuantity - line.receivedQuantity,
      expectedVersion: order.version ?? 1
    })));
}

function deliveryJobSummary(state: OperationsState, user: SafeIdentityUser, job: OperationsState["deliveryJobs"][number]) {
  const order = state.salesOrders.find((item) => item.id === job.salesOrderId);
  const customer = order ? state.customers.find((item) => item.id === order.customerId) : undefined;
  const productMap = new Map(state.productUnits.map((product) => [product.id, product]));
  const vehicle = state.vehicles.find((item) => item.id === job.vehicleId);
  const driver = state.employees.find((item) => item.id === job.driverId);
  return {
    id: job.id,
    documentNo: job.documentNo,
    status: job.status,
    plannedDate: job.plannedDate,
    deliveryAddress: order?.deliveryAddress,
    recipientName: job.recipientName,
    failureReason: job.failureReason,
    customer: customer ? { id: customer.id, displayName: customer.displayName } : undefined,
    vehicle: user.role === "customer" ? undefined : vehicle ? { code: vehicle.code, plateNumber: vehicle.plateNumber } : undefined,
    driver: user.role === "customer" ? undefined : driver ? { displayName: driver.displayName } : undefined,
    quantityChangeRequest: job.quantityChangeRequest ? {
      status: job.quantityChangeRequest.status,
      reason: job.quantityChangeRequest.reason,
      rejectionReason: job.quantityChangeRequest.rejectionReason
    } : undefined,
    customerConfirmation: job.customerConfirmation ? { status: job.customerConfirmation.status, confirmedAt: job.customerConfirmation.confirmedAt } : undefined,
    lines: order?.lines.map((line) => ({
      id: line.id,
      productName: productMap.get(line.productUnitId)?.productName ?? "Vật tư không xác định",
      unitName: productMap.get(line.productUnitId)?.unitName ?? "",
      quantity: line.quantity,
      deliveredQuantity: line.deliveredQuantity
    })) ?? []
  };
}

async function executeOperation(
  operation: OperationName,
  idempotencyKey: string,
  targetId: string | undefined,
  actor: OperationsActor,
  options: OperationOptions | undefined,
  fallback: string
) {
  try {
    const result = await runErpV2Operation(operation, idempotencyKey, targetId, actor, options);
    revalidatePath("/");
    return { summary: result.summary, revision: result.revision, syncedAt: result.syncedAt, source: result.source };
  } catch (error) {
    throw publicOperationError(error, fallback);
  }
}

function publicOperationError(error: unknown, fallback: string) {
  if (error instanceof PublicApiError || error instanceof z.ZodError) return error;
  if (error instanceof OperationInputError) {
    if (error.status === 409) return new PublicApiError(409, "Dữ liệu đã được cập nhật bởi thao tác khác. Vui lòng tải lại trước khi tiếp tục.");
    if (error.status === 412) return new PublicApiError(412, "Trạng thái dữ liệu đã thay đổi. Vui lòng tải lại trước khi tiếp tục.");
    if (error.status === 403) return new PublicApiError(403, "Bạn không có quyền thực hiện thao tác này.");
  }
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("VERSION_CONFLICT:")) {
    return new PublicApiError(409, "Dữ liệu phiếu nhập đã thay đổi. Vui lòng tải lại trước khi xác nhận.");
  }
  if (/không có quyền|khong co quyen|không được|khong duoc/i.test(message)) {
    return new PublicApiError(403, "Bạn không có quyền thực hiện thao tác này.");
  }
  return new PublicApiError(400, fallback);
}

async function assertDeliveryMutationScope(user: SafeIdentityUser, deliveryJobId: string) {
  const state = projectOperationsSnapshot(await getErpV2Snapshot(), user).state;
  if (!state.deliveryJobs.some((job) => job.id === deliveryJobId)) {
    throw new PublicApiError(403, "Bạn không được cập nhật chuyến giao này.");
  }
}

function assertWorkerReceiptVisibility(state: SnapshotState, user: SafeIdentityUser, lineId: string) {
  const projected = projectOperationsSnapshot({ state, revision: 0, syncedAt: "", source: "memory" }, user).state;
  const visible = projected.purchaseOrders.some((order) => order.lines.some((line) => line.id === lineId));
  if (!visible) throw new PublicApiError(403, "Bạn không được gửi phiếu nhập cho dòng mua này.");
}

function assertExpectedReceiptVersion(state: SnapshotState, lineId: string, expectedVersion: number) {
  const order = state.purchaseOrders.find((item) => item.lines.some((line) => line.id === lineId));
  if (!order) throw new PublicApiError(400, "Không tìm thấy dòng mua cần xử lý.");
  if ((order.version ?? 1) !== expectedVersion) {
    throw new PublicApiError(409, "Dữ liệu phiếu nhập đã thay đổi. Vui lòng tải lại trước khi xác nhận.");
  }
}

function requireInventoryReader(user: SafeIdentityUser) {
  if (["owner", "administrator", "accountant", "warehouse", "supervisor", "viewer"].includes(user.role)) return;
  throw new PublicApiError(403, "Bạn không có quyền xem tồn kho nội bộ.");
}

function requireDeliveryReader(user: SafeIdentityUser) {
  if (["owner", "administrator", "accountant", "sales", "warehouse", "dispatcher", "driver", "worker", "supervisor", "viewer", "customer"].includes(user.role)) return;
  throw new PublicApiError(403, "Bạn không có quyền xem chuyến giao.");
}

function requireInventoryOperator(user: SafeIdentityUser, actor: OperationsActor, permission: string) {
  if (!["owner", "administrator", "warehouse"].includes(user.role)) {
    throw new PublicApiError(403, "Bạn không có quyền thực hiện thao tác kho này.");
  }
  requirePermission(actor, permission);
}

function requireApprovalRole(user: SafeIdentityUser, actor: OperationsActor, permission: string) {
  if (!isApprovalRole(user)) {
    throw new PublicApiError(403, "Chỉ Chủ cửa hàng hoặc Kế toán được duyệt thao tác này.");
  }
  requirePermission(actor, permission);
}

function isApprovalRole(user: SafeIdentityUser) {
  return user.role === "owner" || user.role === "accountant";
}

function requirePermission(actor: OperationsActor, permission: string) {
  if (!actor.permissions.includes(permission)) {
    throw new PublicApiError(403, "Bạn không có quyền thực hiện thao tác này.");
  }
}

function hasProcessedRequest(state: { processedOperations: Array<{ idempotencyKey: string }> }, idempotencyKey: string) {
  return state.processedOperations.some((entry) => entry.idempotencyKey === idempotencyKey);
}

function alreadyProcessed() {
  return { summary: "Yêu cầu này đã được xử lý trước đó, hệ thống không ghi trùng." };
}
