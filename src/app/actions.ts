"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import readXlsxFile, { readSheetNames } from "read-excel-file/node";
import { z } from "zod";
import { OperationInputError } from "@/modules/operations/errors";
import type { CreateCommand } from "@/modules/operations/types";
import {
  getDemoOperationsSnapshot,
  resetDemoOperationsState,
  runDemoCreateCommand,
  runDemoOperation
} from "@/modules/operations/demo-store";
import { requireIdentityAdmin, requireIdentityUser, requireOperationsActor } from "@/server/identity/auth-context";
import { projectOperationsSnapshot, projectOperationsState } from "@/server/identity/operations-projection";
import {
  removeOperationsDocumentImage,
  removeOperationsDeliveryImage,
  removeOperationsReceiptImage,
  saveOperationsDocumentImage,
  saveOperationsDeliveryImage,
  saveOperationsReceiptImage,
  saveOperationsTransferProofDocument,
  removeOperationsTransferProofDocument
} from "@/server/infrastructure/operations-attachment-store";

const operationInputSchema = z.object({
  operation: z.enum([
    "confirmSalesOrder",
    "recordWorkOrderLocation",
    "claimOpenSalesWorkOrder",
    "allocateSalesSources",
    "confirmPurchaseOrder",
    "submitGoodsReceipt",
    "approveGoodsReceipt",
    "rejectGoodsReceipt",
    "postGoodsReceipt",
    "reverseInventoryMovement",
    "postInventoryTransfer",
    "postInventoryCountAdjustment",
    "confirmDirectDelivery",
    "reverseDirectDelivery",
    "startDeliveryLoading",
    "dispatchDelivery",
    "submitDeliveryCompletion",
    "approveDeliveryCompletion",
    "rejectDeliveryCompletion",
    "completeDelivery",
    "failDelivery",
    "confirmCustomerPayment",
    "allocateCustomerPayment",
    "reverseCustomerPayment",
    "confirmSupplierPayment",
    "allocateSupplierPayment",
    "reverseSupplierPayment",
    "confirmCashVoucher",
    "reverseCashVoucher",
    "approveWorkOutput",
    "postCompensation",
    "payEmployee",
    "reverseEmployeePayment",
    "confirmEmployeeAdvance",
    "reverseEmployeeAdvance",
    "resolveImportIssue",
    "ignoreImportIssue"
  ]),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/, "Mã chống chạy trùng phải có 12-128 ký tự an toàn."),
  targetId: z.string().min(1).optional(),
  options: z.object({
    expectedVersion: z.coerce.number().int().positive("Phiên bản đơn không hợp lệ.").optional(),
    location: z.object({
      latitude: z.coerce.number().min(-90, "Vĩ độ phải nằm giữa -90 và 90.").max(90, "Vĩ độ phải nằm giữa -90 và 90."),
      longitude: z.coerce.number().min(-180, "Kinh độ phải nằm giữa -180 và 180.").max(180, "Kinh độ phải nằm giữa -180 và 180."),
      recordedAt: z.string().trim().min(1, "Thời gian ghi nhận không hợp lệ.").optional(),
      accuracyMeters: z.coerce.number().nonnegative("Độ chính xác phải không âm.").optional(),
      source: z.enum(["gps", "manual"]).optional()
    }).optional(),
    quantity: z.coerce.number().positive("Số lượng phải lớn hơn 0.").optional(),
    lineQuantities: z.record(z.string(), z.coerce.number().positive("Số lượng giao phải lớn hơn 0.")).optional(),
    recipientName: z.string().trim().min(1, "Nhập tên người nhận.").optional(),
    evidence: z.string().trim().min(1, "Nhập bằng chứng giao nhận.").optional(),
    reason: z.string().trim().min(5, "Lý do phải có ít nhất 5 ký tự.").optional(),
    sourceWarehouseId: z.string().min(1).optional(),
    destinationWarehouseId: z.string().min(1).optional(),
    warehouseId: z.string().min(1).optional(),
    productUnitId: z.string().min(1).optional(),
    countedQuantity: z.coerce.number().nonnegative("Số lượng kiểm kê không được âm.").optional(),
    allocations: z.array(z.object({
      ledgerEntryId: z.string().min(1, "Thiếu dòng công nợ cần phân bổ."),
      amount: z.coerce.number().positive("Số tiền phân bổ phải lớn hơn 0.")
    })).min(1, "Chọn ít nhất một dòng công nợ để phân bổ.").optional()
  }).optional()
});

const operationPayloadSchema = operationInputSchema.superRefine((input, context) => {
  if (input.targetId && input.targetId.length > 128) {
    context.addIssue({ code: "custom", path: ["targetId"], message: "Mã đối tượng không hợp lệ." });
  }
  if (input.operation === "recordWorkOrderLocation" && !input.options?.location) {
    context.addIssue({
      code: "custom",
      path: ["options", "location"],
      message: "Cần đề nghị thông tin vị trí khi ghi nhận vị trí."
    });
  }
  if (input.options?.lineQuantities && Object.keys(input.options.lineQuantities).length > 100) {
    context.addIssue({ code: "custom", path: ["options", "lineQuantities"], message: "Một lần giao chỉ được tối đa 100 dòng." });
  }
  if (input.options?.allocations && input.options.allocations.length > 100) {
    context.addIssue({ code: "custom", path: ["options", "allocations"], message: "Một lần phân bổ chỉ được tối đa 100 dòng." });
  }
});

const commercialDiscountSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("percentage"), value: z.coerce.number().min(0).max(100) }),
  z.object({ kind: z.literal("amount"), value: z.coerce.number().nonnegative() })
]);

const commercialIdempotencyKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/, "Khóa chống trùng phải có 12-128 ký tự an toàn.");
const commercialDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD.");

const createCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("createCustomer"),
    displayName: z.string().trim().min(1, "Tên khách hàng không được để trống."),
    phone: z.string().trim(),
    creditLimit: z.coerce.number().nonnegative("Hạn mức nợ không được âm.")
  }),
  z.object({
    type: z.literal("createSupplier"),
    displayName: z.string().trim().min(1, "Tên nhà cung cấp không được để trống."),
    phone: z.string().trim()
  }),
  z.object({
    type: z.literal("createProductUnit"),
    productCode: z.string().trim().min(1, "Mã vật tư không được để trống."),
    productName: z.string().trim().min(1, "Tên vật tư không được để trống."),
    unitName: z.string().trim().min(1, "Đơn vị không được để trống."),
    preferredSupplierId: z.string().trim().min(1, "Nhà cung cấp không hợp lệ.").optional()
  }),
  z.object({
    type: z.literal("createUnitDefinition"),
    name: z.string().trim().min(1, "Tên đơn vị không được để trống.").max(40, "Tên đơn vị tối đa 40 ký tự.")
  }),
  z.object({
    type: z.literal("deleteUnitDefinition"),
    unitId: z.string().min(1, "Thiếu đơn vị cần xóa.")
  }),
  z.object({
    type: z.literal("resetPurchaseUnitSettings"),
    expectedCustomUnitCount: z.coerce.number().int().nonnegative(),
    expectedConversionCount: z.coerce.number().int().nonnegative()
  }),
  z.object({
    type: z.literal("upsertPurchaseUnitConversion"),
    productUnitId: z.string().min(1, "Chọn vật tư."),
    unitId: z.string().min(1, "Chọn đơn vị mua."),
    conversionMode: z.enum(["fixed", "variable"]),
    factorToBase: z.coerce.number().positive("Hệ số quy đổi phải lớn hơn 0.").optional(),
    expectedVersion: z.coerce.number().int().nonnegative().optional()
  }),
  z.object({
    type: z.literal("deletePurchaseUnitConversion"),
    conversionId: z.string().min(1, "Thiếu quy đổi cần xóa."),
    expectedVersion: z.coerce.number().int().positive("Phiên bản quy đổi không hợp lệ.")
  }),
  z.object({
    type: z.literal("createWarehouse"),
    code: z.string().trim().min(1, "Mã kho không được để trống."),
    name: z.string().trim().min(1, "Tên kho không được để trống.")
  }),
  z.object({
    type: z.literal("createVehicle"),
    code: z.string().trim().min(1, "Mã xe không được để trống."),
    plateNumber: z.string().trim().min(1, "Biển số xe không được để trống."),
    capacityTons: z.coerce.number().positive("Tải trọng phải lớn hơn 0.")
  }),
  z.object({
    type: z.literal("createEmployee"),
    displayName: z.string().trim().min(1, "Tên nhân viên không được để trống."),
    roleType: z.enum(["driver", "worker", "warehouse", "sales", "accountant", "supervisor"])
  }),
  z.object({
    type: z.literal("createSalesOrderDraft"),
    customerId: z.string().min(1, "Chọn khách hàng."),
    lines: z.array(z.object({
      productUnitId: z.string().min(1, "Chọn vật tư."),
      quantity: z.coerce.number().positive("Số lượng phải lớn hơn 0."),
      unitPrice: z.coerce.number().nonnegative("Đơn giá không được âm."),
      taxRate: z.coerce.number().min(0, "VAT không được âm.").max(1, "VAT tối đa 100%."),
      discount: commercialDiscountSchema.optional(),
      unitName: z.string().trim().min(1, "Chọn đơn vị bán.").optional(),
      unitFactor: z.coerce.number().positive("Hệ số quy đổi phải lớn hơn 0.").optional()
    })).min(1, "Đơn bán phải có ít nhất một dòng.").optional(),
    productUnitId: z.string().min(1).optional(),
    quantity: z.coerce.number().positive().optional(),
    unitPrice: z.coerce.number().nonnegative().optional(),
    taxRate: z.coerce.number().min(0).max(1).optional(),
    discount: commercialDiscountSchema.optional(),
    paymentTermDays: z.coerce.number().int().min(0).max(3650).optional(),
    paymentTermsNote: z.string().trim().max(500).optional(),
    promisedDeliveryDate: commercialDateSchema.optional(),
    deliveryCharge: z.object({
      netAmount: z.coerce.number().positive("Phí giao phải lớn hơn 0."),
      taxRate: z.coerce.number().min(0).max(1),
      idempotencyKey: commercialIdempotencyKeySchema
    }).optional()
  }),
  z.object({
    type: z.literal("createPurchaseOrderDraft"),
    supplierId: z.string().min(1, "Chọn nhà cung cấp."),
    createLinkedSalesDraft: z.boolean().optional(),
    lines: z.array(z.object({
      productUnitId: z.string().min(1, "Chọn vật tư."),
      orderedQuantity: z.coerce.number().positive("Số lượng mua phải lớn hơn 0."),
      unitCost: z.coerce.number().nonnegative("Giá mua không được âm."),
      taxRate: z.coerce.number().min(0, "VAT không được âm.").max(1, "VAT tối đa 100%."),
      discount: commercialDiscountSchema.optional(),
      unitName: z.string().trim().min(1, "Chọn đơn vị mua.").optional(),
      unitFactor: z.coerce.number().positive("Hệ số quy đổi phải lớn hơn 0.").optional(),
      actualBaseQuantity: z.coerce.number().positive("Số lượng thực nhận phải lớn hơn 0.").optional(),
      destinationType: z.enum(["warehouse", "customer_direct"]),
      customerId: z.string().optional()
    })).min(1, "Đơn mua phải có ít nhất một dòng.").optional(),
    productUnitId: z.string().min(1).optional(),
    orderedQuantity: z.coerce.number().positive().optional(),
    unitCost: z.coerce.number().nonnegative().optional(),
    taxRate: z.coerce.number().min(0).max(1).optional(),
    discount: commercialDiscountSchema.optional(),
    destinationType: z.enum(["warehouse", "customer_direct"]).optional(),
    customerId: z.string().optional(),
    paymentTermDays: z.coerce.number().int().min(0).max(3650).optional(),
    paymentTermsNote: z.string().trim().max(500).optional(),
    expectedDeliveryDate: commercialDateSchema.optional(),
    freightCharge: z.object({
      supplierId: z.string().min(1),
      netAmount: z.coerce.number().positive("Cước mua phải lớn hơn 0."),
      taxRate: z.coerce.number().min(0).max(1),
      idempotencyKey: commercialIdempotencyKeySchema
    }).optional()
  }),
  z.object({
    type: z.literal("createDeliveryJob"),
    salesOrderId: z.string().min(1, "Chọn đơn bán."),
    driverId: z.string().min(1, "Chọn tài xế."),
    vehicleId: z.string().min(1, "Chọn xe giao hàng."),
    plannedDate: z.string().min(1, "Chọn ngày giao.")
  }),
  z.object({
    type: z.literal("createCustomerPaymentDraft"),
    customerId: z.string().min(1, "Chọn khách hàng."),
    amount: z.coerce.number().positive("Số tiền thu phải lớn hơn 0.")
  }),
  z.object({
    type: z.literal("createSupplierPaymentDraft"),
    supplierId: z.string().min(1, "Chọn nhà cung cấp."),
    amount: z.coerce.number().positive("Số tiền chi phải lớn hơn 0.")
  }),
  z.object({
    type: z.literal("createCashVoucherDraft"),
    direction: z.enum(["in", "out"]),
    category: z.string().trim().min(1, "Nhập nhóm thu chi."),
    description: z.string().trim().min(1, "Nhập diễn giải."),
    amount: z.coerce.number().positive("Số tiền phải lớn hơn 0.")
  }),
  z.object({
    type: z.literal("createEmployeePaymentDraft"),
    employeeId: z.string().min(1, "Chọn nhân viên."),
    amount: z.coerce.number().positive("Số tiền thanh toán phải lớn hơn 0.")
  }),
  z.object({
    type: z.literal("createEmployeeAdvanceDraft"),
    employeeId: z.string().min(1, "Chọn nhân viên."),
    purpose: z.string().trim().min(1, "Nhập mục đích tạm ứng."),
    amount: z.coerce.number().positive("Số tiền tạm ứng phải lớn hơn 0.")
  }),
  z.object({
    type: z.literal("createWorkOrderDraft"),
    employeeId: z.string().min(1, "Chọn nhân viên."),
    productUnitId: z.string().min(1, "Chọn vật tư/sản lượng."),
    actualQuantity: z.coerce.number().positive("Sản lượng phải lớn hơn 0."),
    totalAmount: z.coerce.number().positive("Tổng tiền công phải lớn hơn 0.")
  }),
  z.object({
    type: z.literal("createImportIssue"),
    sourceSheet: z.string().trim().min(1, "Tên trang tính không được để trống."),
    rowNumber: z.coerce.number().int().positive("Số dòng phải lớn hơn 0."),
    severity: z.enum(["warning", "error"]),
    message: z.string().trim().min(1, "Nội dung vấn đề không được để trống.")
  })
]);

const createCommandInputSchema = z.object({
  command: createCommandSchema,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/, "Mã chống chạy trùng phải có 12-128 ký tự an toàn.")
});

const maximumImportRows = 100_000;
const maximumImportSheets = 24;

const createCommandPayloadSchema = createCommandInputSchema.superRefine((input, context) => {
  const command = input.command as { lines?: unknown[] };
  if (command.lines && command.lines.length > 100) {
    context.addIssue({
      code: "custom",
      path: ["command", "lines"],
      message: "Mỗi đơn chỉ được tối đa 100 dòng."
    });
  }
});

export async function runDemoOperationAction(input: unknown) {
  try {
    const command = operationPayloadSchema.parse(input);
    if (command.operation === "submitDeliveryCompletion") {
      throw new OperationInputError("Xác nhận đã giao phải được gửi kèm ảnh qua biểu mẫu giao hàng.");
    }
    const user = await requireIdentityUser();
    const actor = await requireOperationsActor();
    const result = await runDemoOperation(command.operation, command.idempotencyKey, command.targetId, actor, command.options);
    return { ok: true as const, result: { ...result, state: projectOperationsState(result.state, user) } };
  } catch (error) {
    return { ok: false as const, error: expectedActionError(error, "Không thể thực hiện thao tác.") };
  }
}

export async function submitGoodsReceiptWithImageAction(formData: FormData) {
  let attachment: Awaited<ReturnType<typeof saveOperationsReceiptImage>> | undefined;
  try {
    const targetId = formData.get("targetId");
    const quantityValue = formData.get("quantity");
    const file = formData.get("receiptImage");
    if (typeof targetId !== "string" || targetId.trim().length === 0 || targetId.length > 128) {
      throw new OperationInputError("Thiếu dòng mua cần gửi phiếu nhập.");
    }
    const quantity = Number(quantityValue);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new OperationInputError("Số lượng nhập phải lớn hơn 0.");
    }
    if (!(file instanceof File)) {
      throw new OperationInputError("Phải đính kèm ảnh thực nhận trước khi gửi phiếu nhập.");
    }

    const user = await requireIdentityUser();
    const actor = await requireOperationsActor();
    try {
      attachment = await saveOperationsReceiptImage(file, actor, new Date().toISOString());
    } catch (error) {
      throw new OperationInputError(error instanceof Error ? error.message : "Ảnh đính kèm không hợp lệ.");
    }
    const result = await runDemoOperation(
      "submitGoodsReceipt",
      `receipt-image-${randomUUID()}`,
      targetId,
      actor,
      { quantity, attachments: [attachment] }
    );
    return { ok: true as const, result: { ...result, state: projectOperationsState(result.state, user) } };
  } catch (error) {
    if (attachment) {
      await removeOperationsReceiptImage(attachment).catch(() => undefined);
    }
    return { ok: false as const, error: expectedActionError(error, "Không thể gửi phiếu nhập kèm ảnh.") };
  }
}

export async function submitDeliveryCompletionWithImageAction(formData: FormData) {
  let attachment: Awaited<ReturnType<typeof saveOperationsDeliveryImage>> | undefined;
  try {
    const targetId = formData.get("targetId");
    const recipientName = formData.get("recipientName");
    const evidence = formData.get("evidence");
    const rawLineQuantities = formData.get("lineQuantities") || "{}";
    const file = formData.get("deliveryImage");
    if (typeof targetId !== "string" || targetId.trim().length === 0 || targetId.length > 128) {
      throw new OperationInputError("Thiếu chuyến giao cần xác nhận.");
    }
    if (typeof recipientName !== "string" || recipientName.trim().length === 0 || recipientName.length > 160) {
      throw new OperationInputError("Nhập tên người nhận hàng.");
    }
    if (typeof evidence !== "string" || evidence.trim().length === 0 || evidence.length > 500) {
      throw new OperationInputError("Nhập ghi chú bằng chứng giao nhận.");
    }
    if (!(file instanceof File)) {
      throw new OperationInputError("Phải chụp hoặc đính kèm ít nhất một ảnh trước khi xác nhận đã giao.");
    }
    if (typeof rawLineQuantities !== "string" || rawLineQuantities.length === 0 || rawLineQuantities.length > 20_000) {
      throw new OperationInputError("Thiếu số lượng thực giao.");
    }

    let lineQuantities: Record<string, number>;
    try {
      const parsed = JSON.parse(rawLineQuantities);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length > 100) {
        throw new Error();
      }
      lineQuantities = Object.fromEntries(Object.entries(parsed).map(([lineId, quantity]) => {
        const value = Number(quantity);
        if (!lineId.trim() || lineId.length > 128 || !Number.isFinite(value) || value <= 0) {
          throw new Error();
        }
        return [lineId, value];
      }));
    } catch {
      throw new OperationInputError("Số lượng thực giao không hợp lệ.");
    }

    const user = await requireIdentityUser();
    const actor = await requireOperationsActor();
    try {
      attachment = await saveOperationsDeliveryImage(file, actor, new Date().toISOString());
    } catch (error) {
      throw new OperationInputError(error instanceof Error ? error.message : "Ảnh xác nhận giao không hợp lệ.");
    }
    const result = await runDemoOperation(
      "submitDeliveryCompletion",
      `delivery-image-${randomUUID()}`,
      targetId,
      actor,
      { recipientName: recipientName.trim(), evidence: evidence.trim(), lineQuantities, attachments: [attachment] }
    );
    return { ok: true as const, result: { ...result, state: projectOperationsState(result.state, user) } };
  } catch (error) {
    if (attachment) {
      await removeOperationsDeliveryImage(attachment).catch(() => undefined);
    }
    return { ok: false as const, error: expectedActionError(error, "Không thể gửi xác nhận giao kèm ảnh.") };
  }
}

export async function runDemoCreateCommandAction(input: unknown) {
  try {
    const command = createCommandPayloadSchema.parse(input);
    const user = await requireIdentityUser();
    const actor = await requireOperationsActor();
    const result = await runDemoCreateCommand(command.command, command.idempotencyKey, actor);
    return { ok: true as const, result: { ...result, state: projectOperationsState(result.state, user) } };
  } catch (error) {
    return { ok: false as const, error: expectedActionError(error, "Không thể tạo dữ liệu mới.") };
  }
}

export async function runDemoCreateCommandWithImageAction(formData: FormData) {
  let attachment: Awaited<ReturnType<typeof saveOperationsDocumentImage>> | undefined;
  try {
    const rawCommand = formData.get("command");
    const rawIdempotencyKey = formData.get("idempotencyKey");
    const file = formData.get("documentImage");
    if (typeof rawCommand !== "string" || rawCommand.length === 0 || rawCommand.length > 200_000) {
      throw new OperationInputError("Dữ liệu đơn hàng không hợp lệ.");
    }
    if (typeof rawIdempotencyKey !== "string") {
      throw new OperationInputError("Thiếu mã xử lý duy nhất cho đơn hàng.");
    }
    if (!(file instanceof File)) {
      throw new OperationInputError("Chọn ảnh chứng từ trước khi tạo đơn.");
    }

    const parsed = createCommandPayloadSchema.parse({
      command: JSON.parse(rawCommand),
      idempotencyKey: rawIdempotencyKey
    });
    if (parsed.command.type !== "createSalesOrderDraft" && parsed.command.type !== "createPurchaseOrderDraft") {
      throw new OperationInputError("Chỉ đơn bán hoặc đơn mua mới được đính kèm ảnh.");
    }

    const user = await requireIdentityUser();
    const actor = await requireOperationsActor();
    try {
      attachment = await saveOperationsDocumentImage(file, actor, new Date().toISOString());
    } catch (error) {
      throw new OperationInputError(error instanceof Error ? error.message : "Ảnh đính kèm không hợp lệ.");
    }
    const command = { ...parsed.command, attachments: [attachment] } as CreateCommand;
    const result = await runDemoCreateCommand(command, parsed.idempotencyKey, actor);
    if (result.severity === "warning") {
      await removeOperationsDocumentImage(attachment);
      attachment = undefined;
    }
    return { ok: true as const, result: { ...result, state: projectOperationsState(result.state, user) } };
  } catch (error) {
    if (attachment) {
      await removeOperationsDocumentImage(attachment).catch(() => undefined);
    }
    return { ok: false as const, error: expectedActionError(error, "Không thể tạo đơn kèm ảnh.") };
  }
}

export async function archiveBankTransferProofAction(formData: FormData): Promise<void> {
  const actor = await requireOperationsActor();
  if (!actor.permissions.includes("cash.archive_transfer_proof")) {
    redirect("/cash/transfer-proofs?error=Bạn+không+có+quyền+sao+lưu+chứng+từ+chuyển+khoản.");
  }

  const files = formData.getAll("document").filter((value): value is File => value instanceof File && value.size > 0);
  const parsed = z.object({
    idempotencyKey: z.string().min(8).max(200),
    direction: z.enum(["in", "out"]),
    amount: z.coerce.number().positive(),
    counterpartyName: z.string().trim().min(2).max(100),
    transactionReference: z.string().trim().min(3).max(120),
    transferredAt: z.string().min(1),
    relatedDocumentNo: z.string().trim().max(80).optional(),
    note: z.string().trim().max(1000).optional()
  }).safeParse({
    idempotencyKey: formData.get("idempotencyKey"),
    direction: formData.get("direction"),
    amount: formData.get("amount"),
    counterpartyName: formData.get("counterpartyName"),
    transactionReference: formData.get("transactionReference"),
    transferredAt: formData.get("transferredAt"),
    relatedDocumentNo: formData.get("relatedDocumentNo") || undefined,
    note: formData.get("note") || undefined
  });

  if (!parsed.success || files.length < 1 || files.length > 3 || Number.isNaN(Date.parse(String(formData.get("transferredAt"))))) {
    redirect("/cash/transfer-proofs?error=Thông+tin+hoặc+tệp+chứng+từ+không+hợp+lệ.");
  }

  const attachments: Array<Awaited<ReturnType<typeof saveOperationsTransferProofDocument>>> = [];
  try {
    for (const file of files) {
      attachments.push(await saveOperationsTransferProofDocument(file, actor, new Date().toISOString()));
    }

    const result = await runDemoCreateCommand({
      type: "createBankTransferProof",
      direction: parsed.data.direction,
      amount: parsed.data.amount,
      counterpartyName: parsed.data.counterpartyName,
      transactionReference: parsed.data.transactionReference,
      transferredAt: new Date(parsed.data.transferredAt).toISOString(),
      relatedDocumentNo: parsed.data.relatedDocumentNo || undefined,
      note: parsed.data.note || undefined,
      attachments
    }, parsed.data.idempotencyKey, actor);

    if (result.severity === "warning") {
      await Promise.all(attachments.map((attachment) => removeOperationsTransferProofDocument(attachment)));
      attachments.length = 0;
    }
  } catch (error) {
    await Promise.all(attachments.map((attachment) => removeOperationsTransferProofDocument(attachment).catch(() => undefined)));
    const message = error instanceof Error ? error.message : "Không thể sao lưu chứng từ chuyển khoản.";
    redirect(`/cash/transfer-proofs?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/");
  revalidatePath("/cash/transfer-proofs");
  redirect("/cash/transfer-proofs?message=Đã+sao+lưu+chứng+từ+chuyển+khoản.");
}

export async function resetDemoOperationsAction() {
  const user = await requireIdentityAdmin();
  return projectOperationsSnapshot(await resetDemoOperationsState(), user);
}

export async function getOperationsSnapshotAction() {
  const user = await requireIdentityUser();
  return projectOperationsSnapshot(await getDemoOperationsSnapshot(), user);
}

export async function importWorkbookDryRunAction(formData: FormData) {
  try {
    return await importWorkbookDryRunInternal(formData);
  } catch (error) {
    if (error instanceof OperationInputError) {
      throw new Error(error.message);
    }
    throw new Error("Không thể chạy thử workbook.");
  }
}

async function importWorkbookDryRunInternal(formData: FormData) {
  const file = formData.get("workbook");
  const user = await requireIdentityUser();
  const actor = await requireOperationsActor();
  if (!(file instanceof File)) {
    throw new Error("Chọn tệp Excel .xlsx để chạy kiểm tra dữ liệu.");
  }
  if (file.name.length > 200 || /[\u0000-\u001f\u007f]/u.test(file.name)) {
    throw new Error("Tên tệp Excel không hợp lệ.");
  }
  if (!file.name.toLocaleLowerCase("vi-VN").endsWith(".xlsx")) {
    throw new Error("Hệ thống chỉ nhận workbook .xlsx.");
  }
  if (file.size <= 0 || file.size > 40 * 1024 * 1024) {
    throw new Error("Tệp Excel phải có dung lượng từ 1 byte đến 40 MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const sheetNames = await readSheetNames(buffer);
  const transactionSheets = sheetNames.filter((sheetName) => /^\d{1,2}\.\d{2}$/.test(sheetName));
  if (transactionSheets.length > maximumImportSheets) {
    throw new Error("Workbook có quá nhiều trang giao dịch để xử lý an toàn.");
  }
  if (transactionSheets.length === 0) {
    throw new Error("Workbook không có trang giao dịch tháng dạng 5.26, 6.26, ...");
  }

  let rowCount = 0;
  const issues: Array<{ sourceSheet: string; rowNumber: number; severity: "warning" | "error"; message: string }> = [];
  for (const sheetName of transactionSheets) {
    const rows = await readXlsxFile(buffer, { sheet: sheetName });
    if (rows.length > maximumImportRows) {
      throw new Error("Trang giao dịch có quá nhiều dòng để xử lý an toàn.");
    }
    const result = inspectImportSheet(sheetName, rows);
    rowCount += result.rowCount;
    if (rowCount > maximumImportRows) {
      throw new Error("Workbook có quá nhiều dòng để xử lý an toàn.");
    }
    issues.push(...result.issues);
  }

  const result = await runDemoCreateCommand({
    type: "createImportDryRun",
    fileName: file.name,
    fileHash,
    sheetNames: transactionSheets,
    rowCount,
    issues
  }, `import-${fileHash}`, actor);
  return { ...result, state: projectOperationsState(result.state, user) };
}

function inspectImportSheet(sheetName: string, rows: readonly (readonly unknown[])[]) {
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell) === "ngay mua") && row.some((cell) => normalizeHeader(cell) === "ten kh"));
  if (headerIndex < 0) {
    const hasData = rows.some((row) => row.some((cell) => cell !== null));
    return {
      rowCount: 0,
      issues: hasData ? [{ sourceSheet: sheetName, rowNumber: 1, severity: "error" as const, message: "Không tìm thấy dòng tiêu đề NGÀY MUA/TÊN KH." }] : []
    };
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const column = (name: string) => headers.indexOf(name);
  const indexes = {
    sequence: column("tt"),
    date: column("ngay mua"),
    customer: column("ten kh"),
    product: column("ten vat tu"),
    unit: column("dvt"),
    quantity: column("sl"),
    net: column("thanh tien (truoc vat)"),
    tax: column("thue gtgt"),
    gross: column("thanh tien (sau vat)"),
    paymentMethod: column("hinh thuc thanh toan")
  };
  const issues: Array<{ sourceSheet: string; rowNumber: number; severity: "warning" | "error"; message: string }> = [];
  const fingerprints = new Map<string, number>();
  let rowCount = 0;
  const expectedMonth = Number(sheetName.split(".")[0]);

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2;
    if (indexes.sequence < 0 || typeof row[indexes.sequence] !== "number") {
      return;
    }
    rowCount += 1;
    const date = row[indexes.date];
    const customer = cellText(row[indexes.customer]);
    const product = cellText(row[indexes.product]);
    const unit = cellText(row[indexes.unit]);
    const quantity = row[indexes.quantity];

    if (!customer || !product || !unit) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "error", message: "Thiếu khách hàng, vật tư hoặc đơn vị giao dịch." });
    }
    if (typeof date === "string") {
      const parsedDate = new Date(date);
      if (Number.isNaN(parsedDate.getTime())) {
        issues.push({ sourceSheet: sheetName, rowNumber, severity: "error", message: "Ngày mua đang lưu dạng chữ và không thể chuẩn hóa." });
      } else {
        issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: "Ngày mua đang lưu dạng chữ, cần đổi thành ngày hợp lệ trước khi nhập dữ liệu." });
        if (parsedDate.getUTCMonth() + 1 !== expectedMonth) {
          issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: `Ngày giao dịch không thuộc tháng ${expectedMonth} của trang ${sheetName}.` });
        }
      }
    } else if (date instanceof Date && date.getMonth() + 1 !== expectedMonth) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: `Ngày giao dịch không thuộc tháng ${expectedMonth} của trang ${sheetName}.` });
    } else if (!(date instanceof Date)) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "error", message: "Thiếu ngày mua hợp lệ." });
    }
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "error", message: "Số lượng thiếu hoặc không lớn hơn 0." });
    } else if (quantity >= 30000 && quantity <= 60000) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: "Số lượng có dạng giống mã ngày của Excel, cần kiểm tra lại." });
    }

    const net = numericCell(row[indexes.net]);
    const tax = numericCell(row[indexes.tax]);
    const gross = numericCell(row[indexes.gross]);
    if (net !== undefined && tax !== undefined && gross !== undefined && Math.abs(net + tax - gross) > 1) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: "Tiền trước VAT + thuế không khớp tiền sau VAT." });
    }
    if (indexes.paymentMethod >= 0 && !cellText(row[indexes.paymentMethod])) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: "Thiếu hình thức thanh toán; chưa được tự suy diễn công nợ." });
    }

    const fingerprint = JSON.stringify([date instanceof Date ? date.toISOString() : date, customer, product, unit, quantity, net, tax, gross]);
    const firstRow = fingerprints.get(fingerprint);
    if (firstRow) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: `Dòng có nội dung trùng dòng ${firstRow}, cần đối chiếu trước khi nhập dữ liệu.` });
    } else {
      fingerprints.set(fingerprint, rowNumber);
    }
  });

  return { rowCount, issues };
}

function expectedActionError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? fallback;
  }
  return error instanceof OperationInputError ? error.message : fallback;
}

function normalizeHeader(value: unknown) {
  return cellText(value)
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numericCell(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
