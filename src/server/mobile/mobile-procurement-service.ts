import { z } from "zod";
import { getDemoOperationsSnapshot, runDemoCreateCommand, runDemoOperation } from "@/modules/operations/demo-store";
import type { OperationsActor, PurchaseOrder } from "@/modules/operations/types";
import { visibleModulesForIdentity } from "@/server/identity/auth-context";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";
import type { SafeIdentityUser } from "@/server/identity/types";
import { PublicApiError } from "@/server/shared/public-api-error";
import { mobileIdempotencySchema } from "./mobile-portal-service";

const identifierSchema = z.string().trim().min(1).max(128);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const quantitySchema = z.number().finite().positive().max(1_000_000);
const moneySchema = z.number().finite().min(0).max(1_000_000_000_000);
const taxRateSchema = z.number().finite().min(0).max(1);
const expectedVersionSchema = z.number().int().positive();
const discountSchema = z.object({
  kind: z.enum(["percentage", "amount"]),
  value: moneySchema
}).strict();

const purchaseDraftInputSchema = z.object({
  supplierId: identifierSchema,
  lines: z.array(z.object({
    productUnitId: identifierSchema,
    orderedQuantity: quantitySchema,
    unitCost: moneySchema,
    taxRate: taxRateSchema,
    discount: discountSchema.optional(),
    unitName: z.string().trim().min(1).max(80),
    actualBaseQuantity: quantitySchema.optional(),
    destinationType: z.enum(["warehouse", "customer_direct"]),
    customerId: identifierSchema.optional()
  }).strict()).min(1).max(100),
  paymentTermDays: z.number().int().min(0).max(3650).optional(),
  paymentTermsNote: z.string().trim().max(500).optional(),
  expectedDeliveryDate: dateSchema.optional(),
  freightCharge: z.object({
    netAmount: moneySchema,
    taxRate: taxRateSchema
  }).strict().optional()
}).strict();

const purchaseDraftMutationSchema = purchaseDraftInputSchema.extend({
  idempotencyKey: mobileIdempotencySchema
}).strict();

const procurementActionSchema = z.object({
  action: z.literal("confirm"),
  idempotencyKey: mobileIdempotencySchema,
  expectedVersion: expectedVersionSchema
}).strict();

type PurchaseDraftInput = z.infer<typeof purchaseDraftInputSchema>;

export async function getMobileProcurementOverview(user: SafeIdentityUser) {
  requireProcurementView(user);
  const snapshot = projectOperationsSnapshot(await getDemoOperationsSnapshot(), user);
  const productsById = new Map(snapshot.state.productUnits.map((product) => [product.id, product]));
  const suppliersById = new Map(snapshot.state.suppliers.map((supplier) => [supplier.id, supplier]));

  return {
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    purchaseOrders: snapshot.state.purchaseOrders.map((order) => purchaseOrderSummary(order, productsById, suppliersById))
  };
}

export async function getMobilePurchaseOrderDetail(user: SafeIdentityUser, purchaseOrderId: string) {
  requireProcurementView(user);
  const orderId = identifierSchema.parse(purchaseOrderId);
  const snapshot = projectOperationsSnapshot(await getDemoOperationsSnapshot(), user);
  const order = snapshot.state.purchaseOrders.find((item) => item.id === orderId);
  if (!order) {
    throw new PublicApiError(403, "Không tìm thấy phiếu mua trong phạm vi được cấp quyền.");
  }

  const productsById = new Map(snapshot.state.productUnits.map((product) => [product.id, product]));
  const suppliersById = new Map(snapshot.state.suppliers.map((supplier) => [supplier.id, supplier]));
  const relatedApprovals = snapshot.state.approvalRequests
    .filter((request) => order.lines.some((line) => line.id === request.targetId))
    .map((request) => ({ id: request.id, documentNo: request.documentNo, type: request.type, status: request.status, quantity: request.quantity }));

  return {
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    purchaseOrder: purchaseOrderSummary(order, productsById, suppliersById),
    approvals: relatedApprovals,
    review: purchaseOrderReview(order)
  };
}

export async function reviewMobilePurchaseDraft(user: SafeIdentityUser, input: unknown) {
  requireProcurementWrite(user);
  const value = purchaseDraftInputSchema.parse(input);
  const snapshot = await getDemoOperationsSnapshot();
  validatePurchaseDraftReferences(snapshot.state, value);
  return {
    review: purchaseDraftReview(value),
    source: "server_validated_commercial_intent" as const
  };
}

export async function createMobilePurchaseDraft(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  requireProcurementWrite(user);
  const value = purchaseDraftMutationSchema.parse(input);
  const snapshot = await getDemoOperationsSnapshot();
  const replay = idempotentReplay(snapshot, value.idempotencyKey);
  if (replay) return replay;
  validatePurchaseDraftReferences(snapshot.state, value);
  const result = await runProcurementCommand(
    () => runDemoCreateCommand({
      type: "createPurchaseOrderDraft",
      supplierId: value.supplierId,
      lines: value.lines,
      paymentTermDays: value.paymentTermDays,
      paymentTermsNote: value.paymentTermsNote,
      expectedDeliveryDate: value.expectedDeliveryDate,
      freightCharge: value.freightCharge
        ? { ...value.freightCharge, supplierId: value.supplierId, idempotencyKey: value.idempotencyKey }
        : undefined
    }, value.idempotencyKey, actor),
    "Không thể tạo phiếu mua nháp ở trạng thái hiện tại."
  );
  return operationResponse(result);
}

export async function runMobileProcurementAction(
  user: SafeIdentityUser,
  actor: OperationsActor,
  purchaseOrderId: string,
  input: unknown
) {
  requireProcurementWrite(user);
  const orderId = identifierSchema.parse(purchaseOrderId);
  const value = procurementActionSchema.parse(input);
  const snapshot = await getDemoOperationsSnapshot();
  const replay = idempotentReplay(snapshot, value.idempotencyKey);
  if (replay) return replay;
  const order = snapshot.state.purchaseOrders.find((item) => item.id === orderId);
  if (!order) {
    throw new PublicApiError(403, "Không tìm thấy phiếu mua trong phạm vi được cấp quyền.");
  }
  assertExpectedVersion(order.version, value.expectedVersion, "Phiếu mua");
  const result = await runProcurementCommand(
    () => runDemoOperation("confirmPurchaseOrder", value.idempotencyKey, orderId, actor, { expectedVersion: value.expectedVersion }),
    "Không thể xác nhận phiếu mua ở trạng thái hiện tại."
  );
  return operationResponse(result);
}

function requireProcurementView(user: SafeIdentityUser) {
  if (!visibleModulesForIdentity(user).includes("procurement")) {
    throw new PublicApiError(403, "Tài khoản này không có quyền xem nghiệp vụ mua hàng trên điện thoại.");
  }
}

function requireProcurementWrite(user: SafeIdentityUser) {
  requireProcurementView(user);
  if (user.role !== "owner" && user.role !== "administrator") {
    throw new PublicApiError(403, "Tài khoản này không có quyền tạo hoặc xác nhận phiếu mua trên điện thoại.");
  }
}

function validatePurchaseDraftReferences(
  state: Awaited<ReturnType<typeof getDemoOperationsSnapshot>>["state"],
  value: PurchaseDraftInput
) {
  const supplier = state.suppliers.find((item) => item.id === value.supplierId && item.status === "active");
  if (!supplier) {
    throw new PublicApiError(400, "Nhà cung cấp không hợp lệ hoặc đã ngừng hoạt động.");
  }
  for (const [index, line] of value.lines.entries()) {
    const product = state.productUnits.find((item) => item.id === line.productUnitId && item.status === "active");
    if (!product) {
      throw new PublicApiError(400, `Vật tư dòng ${index + 1} không hợp lệ.`);
    }
    if (line.destinationType === "customer_direct") {
      const customer = state.customers.find((item) => item.id === line.customerId && item.status === "active");
      if (!customer) {
        throw new PublicApiError(400, `Dòng ${index + 1} giao thẳng cần khách hàng đang hoạt động.`);
      }
    }
  }
}

function purchaseOrderSummary(
  order: PurchaseOrder,
  productsById: Map<string, { productName: string; unitName: string }>,
  suppliersById: Map<string, { displayName: string }>
) {
  const totals = purchaseTotals(order.lines, order.freightCharges?.map((charge) => ({ netAmount: charge.netAmount, taxRate: charge.taxRate })) ?? []);
  return {
    id: order.id,
    documentNo: order.documentNo,
    status: order.status,
    version: order.version ?? 1,
    supplier: suppliersById.get(order.supplierId)?.displayName ?? "Nhà cung cấp không xác định",
    expectedDeliveryDate: order.expectedDeliveryDate,
    commercialTerms: order.commercialTerms,
    freightCharges: order.freightCharges?.map((charge) => ({ id: charge.id, netAmount: charge.netAmount, taxRate: charge.taxRate, status: charge.status })),
    totals,
    lines: order.lines.map((line) => ({
      id: line.id,
      productUnitId: line.productUnitId,
      productName: productsById.get(line.productUnitId)?.productName ?? "Vật tư không xác định",
      unitName: line.documentUnit?.unitName ?? productsById.get(line.productUnitId)?.unitName ?? "",
      orderedQuantity: line.orderedQuantity,
      receivedQuantity: line.receivedQuantity,
      unitCost: line.unitCost,
      taxRate: line.taxRate,
      discount: line.discount,
      destinationType: line.destinationType,
      warehouseId: line.warehouseId,
      customerId: line.customerId
    }))
  };
}

function purchaseOrderReview(order: PurchaseOrder) {
  return {
    currentStatus: order.status,
    expectedVersion: order.version ?? 1,
    totals: purchaseTotals(order.lines, order.freightCharges?.map((charge) => ({ netAmount: charge.netAmount, taxRate: charge.taxRate })) ?? []),
    effects: [
      "Khóa giá mua, chiết khấu, cước và điểm nhận đã lưu trên phiếu mua.",
      "Chưa ghi nhập kho, phải trả hoặc giá vốn ở bước xác nhận.",
      "Nhập kho và giao thẳng tiếp tục qua workflow kho/giao nhận riêng."
    ]
  };
}

function purchaseDraftReview(value: PurchaseDraftInput) {
  return {
    totals: purchaseTotals(value.lines, value.freightCharge ? [value.freightCharge] : []),
    effects: [
      "Máy chủ kiểm tra nhà cung cấp, vật tư, khách giao thẳng và đơn vị mua trước khi tạo nháp.",
      "Tạo phiếu mua nháp, chưa nhập kho, chưa tạo phải trả và chưa ghi giá vốn."
    ]
  };
}

function purchaseTotals(
  lines: ReadonlyArray<{
    orderedQuantity: number;
    unitCost: number;
    taxRate: number;
    discount?: { kind: "percentage" | "amount"; value: number; amount?: number };
  }>,
  freightCharges: ReadonlyArray<{ netAmount: number; taxRate: number }>
) {
  const merchandiseNet = roundMoney(lines.reduce((total, line) => total + line.orderedQuantity * line.unitCost - discountAmount(line), 0));
  const merchandiseTax = roundMoney(lines.reduce((total, line) => total + (line.orderedQuantity * line.unitCost - discountAmount(line)) * line.taxRate, 0));
  const freightNet = roundMoney(freightCharges.reduce((total, charge) => total + charge.netAmount, 0));
  const freightTax = roundMoney(freightCharges.reduce((total, charge) => total + charge.netAmount * charge.taxRate, 0));
  return {
    merchandiseNet,
    merchandiseTax,
    freightNet,
    freightTax,
    gross: roundMoney(merchandiseNet + merchandiseTax + freightNet + freightTax)
  };
}

function discountAmount(line: {
  orderedQuantity: number;
  unitCost: number;
  discount?: { kind: "percentage" | "amount"; value: number; amount?: number };
}) {
  if (!line.discount) return 0;
  if (line.discount.amount !== undefined) return line.discount.amount;
  const baseAmount = line.orderedQuantity * line.unitCost;
  return line.discount.kind === "percentage"
    ? roundMoney(baseAmount * (line.discount.value / 100))
    : line.discount.value;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertExpectedVersion(currentVersion: number | undefined, expectedVersion: number, documentLabel: string) {
  if ((currentVersion ?? 1) !== expectedVersion) {
    throw new PublicApiError(409, `${documentLabel} đã được cập nhật bởi thao tác khác. Vui lòng tải lại trước khi tiếp tục.`);
  }
}

function idempotentReplay(
  snapshot: Awaited<ReturnType<typeof getDemoOperationsSnapshot>>,
  idempotencyKey: string
) {
  if (!snapshot.state.processedOperations.some((entry) => entry.idempotencyKey === idempotencyKey)) {
    return undefined;
  }
  return {
    summary: "Yêu cầu này đã được xử lý trước đó, hệ thống không ghi trùng.",
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt
  };
}

async function runProcurementCommand<T>(run: () => Promise<T>, fallback: string) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PublicApiError || error instanceof z.ZodError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("VERSION_CONFLICT:")) {
      throw new PublicApiError(409, "Phiếu mua đã được cập nhật bởi thao tác khác. Vui lòng tải lại trước khi tiếp tục.");
    }
    if (/quyền|quyen/i.test(message)) {
      throw new PublicApiError(403, "Bạn không có quyền thực hiện thao tác mua hàng này.");
    }
    throw new PublicApiError(400, fallback);
  }
}

function operationResponse(result: { summary: string; revision: number; syncedAt: string }) {
  return { summary: result.summary, revision: result.revision, syncedAt: result.syncedAt };
}
