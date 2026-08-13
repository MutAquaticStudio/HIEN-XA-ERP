import { z } from "zod";
import { getDemoOperationsSnapshot, runDemoCreateCommand, runDemoOperation } from "@/modules/operations/demo-store";
import type { OperationsActor, SalesOrder, SalesOrderLine } from "@/modules/operations/types";
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

const salesDraftInputSchema = z.object({
  customerId: identifierSchema,
  lines: z.array(z.object({
    productUnitId: identifierSchema,
    quantity: quantitySchema
  }).strict()).min(1).max(100),
  paymentTermDays: z.number().int().min(0).max(3650).optional(),
  paymentTermsNote: z.string().trim().max(500).optional(),
  promisedDeliveryDate: dateSchema.optional(),
  deliveryCharge: z.object({
    netAmount: moneySchema,
    taxRate: taxRateSchema
  }).strict().optional()
}).strict();

const salesDraftMutationSchema = salesDraftInputSchema.extend({
  idempotencyKey: mobileIdempotencySchema
}).strict();

const salesActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm"),
    idempotencyKey: mobileIdempotencySchema,
    expectedVersion: expectedVersionSchema
  }).strict(),
  z.object({
    action: z.literal("allocate"),
    idempotencyKey: mobileIdempotencySchema,
    expectedVersion: expectedVersionSchema
  }).strict()
]);

type SalesDraftInput = z.infer<typeof salesDraftInputSchema>;

export async function getMobileSalesOverview(user: SafeIdentityUser) {
  requireSalesView(user);
  const snapshot = projectOperationsSnapshot(await getDemoOperationsSnapshot(), user);
  const productsById = new Map(snapshot.state.productUnits.map((product) => [product.id, product]));
  const customersById = new Map(snapshot.state.customers.map((customer) => [customer.id, customer]));

  return {
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    orders: snapshot.state.salesOrders.map((order) => salesOrderSummary(order, productsById, customersById))
  };
}

export async function getMobileSalesOrderDetail(user: SafeIdentityUser, salesOrderId: string) {
  requireSalesView(user);
  const orderId = identifierSchema.parse(salesOrderId);
  const snapshot = projectOperationsSnapshot(await getDemoOperationsSnapshot(), user);
  const order = snapshot.state.salesOrders.find((item) => item.id === orderId);
  if (!order) {
    throw new PublicApiError(403, "Không tìm thấy đơn bán trong phạm vi được cấp quyền.");
  }

  const productsById = new Map(snapshot.state.productUnits.map((product) => [product.id, product]));
  const customersById = new Map(snapshot.state.customers.map((customer) => [customer.id, customer]));
  const linkedDeliveries = snapshot.state.deliveryJobs
    .filter((job) => job.salesOrderId === order.id)
    .map((job) => ({
      id: job.id,
      documentNo: job.documentNo,
      status: job.status,
      plannedDate: job.plannedDate
    }));

  return {
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    order: salesOrderSummary(order, productsById, customersById),
    deliveries: linkedDeliveries,
    review: salesOrderReview(order)
  };
}

export async function reviewMobileSalesDraft(user: SafeIdentityUser, input: unknown) {
  requireSalesWrite(user);
  const value = salesDraftInputSchema.parse(input);
  const snapshot = await getDemoOperationsSnapshot();
  const lines = resolveServerPricedSalesLines(snapshot.state.productUnits, value);
  return {
    review: salesDraftReview(lines, value.deliveryCharge),
    source: "server_catalog_snapshot" as const
  };
}

export async function createMobileSalesDraft(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  requireSalesWrite(user);
  const value = salesDraftMutationSchema.parse(input);
  const snapshot = await getDemoOperationsSnapshot();
  const replay = idempotentReplay(snapshot, value.idempotencyKey);
  if (replay) return replay;
  const lines = resolveServerPricedSalesLines(snapshot.state.productUnits, value);
  const result = await runSalesCommand(
    () => runDemoCreateCommand({
      type: "createSalesOrderDraft",
      customerId: value.customerId,
      lines,
      paymentTermDays: value.paymentTermDays,
      paymentTermsNote: value.paymentTermsNote,
      promisedDeliveryDate: value.promisedDeliveryDate,
      deliveryCharge: value.deliveryCharge
        ? { ...value.deliveryCharge, idempotencyKey: value.idempotencyKey }
        : undefined
    }, value.idempotencyKey, actor),
    "Không thể tạo đơn bán nháp ở trạng thái hiện tại."
  );
  return operationResponse(result);
}

export async function runMobileSalesAction(
  user: SafeIdentityUser,
  actor: OperationsActor,
  salesOrderId: string,
  input: unknown
) {
  requireSalesWrite(user);
  const orderId = identifierSchema.parse(salesOrderId);
  const value = salesActionSchema.parse(input);
  const snapshot = await getDemoOperationsSnapshot();
  const replay = idempotentReplay(snapshot, value.idempotencyKey);
  if (replay) return replay;
  const order = snapshot.state.salesOrders.find((item) => item.id === orderId);
  if (!order) {
    throw new PublicApiError(403, "Không tìm thấy đơn bán trong phạm vi được cấp quyền.");
  }
  assertExpectedVersion(order.version, value.expectedVersion, "Đơn bán");

  const operation = value.action === "confirm" ? "confirmSalesOrder" : "allocateSalesSources";
  const result = await runSalesCommand(
    () => runDemoOperation(operation, value.idempotencyKey, orderId, actor, { expectedVersion: value.expectedVersion }),
    value.action === "confirm"
      ? "Không thể xác nhận đơn bán ở trạng thái hiện tại."
      : "Không thể phân bổ nguồn hàng ở trạng thái hiện tại."
  );
  return operationResponse(result);
}

function requireSalesView(user: SafeIdentityUser) {
  if (!visibleModulesForIdentity(user).includes("sales")) {
    throw new PublicApiError(403, "Tài khoản này không có quyền xem nghiệp vụ bán hàng trên điện thoại.");
  }
}

function requireSalesWrite(user: SafeIdentityUser) {
  requireSalesView(user);
  if (user.role !== "owner" && user.role !== "administrator" && user.role !== "sales") {
    throw new PublicApiError(403, "Tài khoản này không có quyền tạo hoặc xác nhận đơn bán trên điện thoại.");
  }
}

function resolveServerPricedSalesLines(
  products: Array<{ id: string; productName: string; status: string; salePrice?: number; saleTaxRate?: number }>,
  value: SalesDraftInput
) {
  return value.lines.map((line, index) => {
    const product = products.find((item) => item.id === line.productUnitId && item.status === "active");
    if (!product || product.salePrice === undefined || product.saleTaxRate === undefined) {
      throw new PublicApiError(400, `Vật tư dòng ${index + 1} chưa có giá bán công khai hợp lệ.`);
    }
    if (!Number.isFinite(product.salePrice) || product.salePrice < 0 || !Number.isFinite(product.saleTaxRate) || product.saleTaxRate < 0 || product.saleTaxRate > 1) {
      throw new PublicApiError(400, `Giá hoặc VAT hiện hành của ${product.productName} không hợp lệ.`);
    }
    return {
      productUnitId: product.id,
      quantity: line.quantity,
      unitPrice: product.salePrice,
      taxRate: product.saleTaxRate
    };
  });
}

function salesOrderSummary(
  order: SalesOrder,
  productsById: Map<string, { productName: string; unitName: string }>,
  customersById: Map<string, { displayName: string }>
) {
  const totals = salesTotals(order.lines, order.deliveryCharge);
  return {
    id: order.id,
    documentNo: order.documentNo,
    status: order.status,
    version: order.version,
    customer: customersById.get(order.customerId)?.displayName ?? "Khách hàng không xác định",
    deliveryAddress: order.deliveryAddress,
    promisedDeliveryDate: order.promisedDeliveryDate,
    commercialTerms: order.commercialTerms,
    deliveryCharge: order.deliveryCharge,
    totals,
    lines: order.lines.map((line) => ({
      id: line.id,
      productUnitId: line.productUnitId,
      productName: productsById.get(line.productUnitId)?.productName ?? "Vật tư không xác định",
      unitName: productsById.get(line.productUnitId)?.unitName ?? "",
      quantity: line.quantity,
      deliveredQuantity: line.deliveredQuantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      discount: line.discount,
      sourceType: line.sourceType
    }))
  };
}

function salesOrderReview(order: SalesOrder) {
  const totals = salesTotals(order.lines, order.deliveryCharge);
  return {
    currentStatus: order.status,
    expectedVersion: order.version,
    totals,
    confirmEffects: [
      "Khóa giá, VAT, chiết khấu và điều khoản đã lưu trên đơn.",
      "Tạo công việc chờ thợ nhận nếu đơn cần chuẩn bị giao.",
      "Chưa ghi xuất kho, phải thu hoặc doanh thu tại bước xác nhận."
    ],
    allocateEffects: [
      "Cấp nguồn từng dòng từ kho hoặc giao thẳng theo dữ liệu hiện tại.",
      "Chưa ghi xuất kho, phải thu hoặc doanh thu tại bước phân bổ."
    ]
  };
}

function salesDraftReview(
  lines: Array<{ productUnitId: string; quantity: number; unitPrice: number; taxRate: number }>,
  deliveryCharge: SalesDraftInput["deliveryCharge"]
) {
  const totals = salesTotals(lines, deliveryCharge);
  return {
    totals,
    effects: [
      "Giá và VAT được lấy lại từ danh mục trên máy chủ khi tạo nháp.",
      "Tạo đơn nháp, chưa cấp nguồn, chưa xuất kho và chưa phát sinh công nợ."
    ]
  };
}

function salesTotals(
  lines: ReadonlyArray<Pick<SalesOrderLine, "quantity" | "unitPrice" | "taxRate" | "discount">>,
  deliveryCharge?: { netAmount: number; taxRate: number }
) {
  const merchandiseNet = roundMoney(lines.reduce((total, line) => total + line.quantity * line.unitPrice - (line.discount?.amount ?? 0), 0));
  const merchandiseTax = roundMoney(lines.reduce((total, line) => total + (line.quantity * line.unitPrice - (line.discount?.amount ?? 0)) * line.taxRate, 0));
  const deliveryNet = deliveryCharge?.netAmount ?? 0;
  const deliveryTax = roundMoney(deliveryNet * (deliveryCharge?.taxRate ?? 0));
  return {
    merchandiseNet,
    merchandiseTax,
    deliveryNet,
    deliveryTax,
    gross: roundMoney(merchandiseNet + merchandiseTax + deliveryNet + deliveryTax)
  };
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

async function runSalesCommand<T>(run: () => Promise<T>, fallback: string) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PublicApiError || error instanceof z.ZodError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("VERSION_CONFLICT:")) {
      throw new PublicApiError(409, "Đơn bán đã được cập nhật bởi thao tác khác. Vui lòng tải lại trước khi tiếp tục.");
    }
    if (/quyền|quyen/i.test(message)) {
      throw new PublicApiError(403, "Bạn không có quyền thực hiện thao tác bán hàng này.");
    }
    throw new PublicApiError(400, fallback);
  }
}

function operationResponse(result: { summary: string; revision: number; syncedAt: string }) {
  return { summary: result.summary, revision: result.revision, syncedAt: result.syncedAt };
}
