"use server";

import { createHash, randomUUID } from "node:crypto";
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
  saveOperationsReceiptImage
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
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/, "Idempotency key pháº£i cÃ³ 12-128 kÃ½ tá»± an toÃ n."),
  targetId: z.string().min(1).optional(),
  options: z.object({
    expectedVersion: z.coerce.number().int().positive("PhiÃªn báº£n Ä‘Æ¡n khÃ´ng há»£p lá»‡.").optional(),
    location: z.object({
      latitude: z.coerce.number().min(-90, "Vi do phai nam giua -90 va 90.").max(90, "Vi do phai nam giua -90 va 90."),
      longitude: z.coerce.number().min(-180, "Kinh do phai nam giua -180 va 180.").max(180, "Kinh do phai nam giua -180 va 180."),
      recordedAt: z.string().trim().min(1, "Thoi gian ghi nhan khong hop le.").optional(),
      accuracyMeters: z.coerce.number().nonnegative("Do chinh xac phai khong am.").optional(),
      source: z.enum(["gps", "manual"]).optional()
    }).optional(),
    quantity: z.coerce.number().positive("Sá»‘ lÆ°á»£ng pháº£i lá»›n hÆ¡n 0.").optional(),
    lineQuantities: z.record(z.string(), z.coerce.number().positive("Sá»‘ lÆ°á»£ng giao pháº£i lá»›n hÆ¡n 0.")).optional(),
    recipientName: z.string().trim().min(1, "Nháº­p tÃªn ngÆ°á»i nháº­n.").optional(),
    evidence: z.string().trim().min(1, "Nháº­p báº±ng chá»©ng giao nháº­n.").optional(),
    reason: z.string().trim().min(5, "LÃ½ do pháº£i cÃ³ Ã­t nháº¥t 5 kÃ½ tá»±.").optional(),
    sourceWarehouseId: z.string().min(1).optional(),
    destinationWarehouseId: z.string().min(1).optional(),
    warehouseId: z.string().min(1).optional(),
    productUnitId: z.string().min(1).optional(),
    countedQuantity: z.coerce.number().nonnegative("Sá»‘ lÆ°á»£ng kiá»ƒm kÃª khÃ´ng Ä‘Æ°á»£c Ã¢m.").optional(),
    allocations: z.array(z.object({
      ledgerEntryId: z.string().min(1, "Thiáº¿u dÃ²ng cÃ´ng ná»£ cáº§n phÃ¢n bá»•."),
      amount: z.coerce.number().positive("Sá»‘ tiá»n phÃ¢n bá»• pháº£i lá»›n hÆ¡n 0.")
    })).min(1, "Chá»n Ã­t nháº¥t má»™t dÃ²ng cÃ´ng ná»£ Ä‘á»ƒ phÃ¢n bá»•.").optional()
  }).optional()
});

const operationPayloadSchema = operationInputSchema.superRefine((input, context) => {
  if (input.targetId && input.targetId.length > 128) {
    context.addIssue({ code: "custom", path: ["targetId"], message: "Ma doi tuong khong hop le." });
  }
  if (input.operation === "recordWorkOrderLocation" && !input.options?.location) {
    context.addIssue({
      code: "custom",
      path: ["options", "location"],
      message: "Can de nghi thong tin vi tri khi ghi nhan vi tri."
    });
  }
  if (input.options?.lineQuantities && Object.keys(input.options.lineQuantities).length > 100) {
    context.addIssue({ code: "custom", path: ["options", "lineQuantities"], message: "Má»™t láº§n giao chá»‰ Ä‘Æ°á»£c tá»‘i Ä‘a 100 dÃ²ng." });
  }
  if (input.options?.allocations && input.options.allocations.length > 100) {
    context.addIssue({ code: "custom", path: ["options", "allocations"], message: "Má»™t láº§n phÃ¢n bá»• chá»‰ Ä‘Æ°á»£c tá»‘i Ä‘a 100 dÃ²ng." });
  }
});

const createCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("createCustomer"),
    displayName: z.string().trim().min(1, "TÃªn khÃ¡ch hÃ ng khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng."),
    phone: z.string().trim(),
    creditLimit: z.coerce.number().nonnegative("Háº¡n má»©c ná»£ khÃ´ng Ä‘Æ°á»£c Ã¢m.")
  }),
  z.object({
    type: z.literal("createSupplier"),
    displayName: z.string().trim().min(1, "TÃªn nhÃ  cung cáº¥p khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng."),
    phone: z.string().trim()
  }),
  z.object({
    type: z.literal("createProductUnit"),
    productCode: z.string().trim().min(1, "MÃ£ váº­t tÆ° khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng."),
    productName: z.string().trim().min(1, "TÃªn váº­t tÆ° khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng."),
    unitName: z.string().trim().min(1, "ÄÆ¡n vá»‹ khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng.")
  }),
  z.object({
    type: z.literal("createUnitDefinition"),
    name: z.string().trim().min(1, "TÃªn Ä‘Æ¡n vá»‹ khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng.").max(40, "TÃªn Ä‘Æ¡n vá»‹ tá»‘i Ä‘a 40 kÃ½ tá»±.")
  }),
  z.object({
    type: z.literal("deleteUnitDefinition"),
    unitId: z.string().min(1, "Thiáº¿u Ä‘Æ¡n vá»‹ cáº§n xÃ³a.")
  }),
  z.object({
    type: z.literal("resetPurchaseUnitSettings"),
    expectedCustomUnitCount: z.coerce.number().int().nonnegative(),
    expectedConversionCount: z.coerce.number().int().nonnegative()
  }),
  z.object({
    type: z.literal("upsertPurchaseUnitConversion"),
    productUnitId: z.string().min(1, "Chá»n váº­t tÆ°."),
    unitId: z.string().min(1, "Chá»n Ä‘Æ¡n vá»‹ mua."),
    conversionMode: z.enum(["fixed", "variable"]),
    factorToBase: z.coerce.number().positive("Há»‡ sá»‘ quy Ä‘á»•i pháº£i lá»›n hÆ¡n 0.").optional(),
    expectedVersion: z.coerce.number().int().nonnegative().optional()
  }),
  z.object({
    type: z.literal("deletePurchaseUnitConversion"),
    conversionId: z.string().min(1, "Thiáº¿u quy Ä‘á»•i cáº§n xÃ³a."),
    expectedVersion: z.coerce.number().int().positive("PhiÃªn báº£n quy Ä‘á»•i khÃ´ng há»£p lá»‡.")
  }),
  z.object({
    type: z.literal("createWarehouse"),
    code: z.string().trim().min(1, "MÃ£ kho khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng."),
    name: z.string().trim().min(1, "TÃªn kho khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng.")
  }),
  z.object({
    type: z.literal("createVehicle"),
    code: z.string().trim().min(1, "MÃ£ xe khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng."),
    plateNumber: z.string().trim().min(1, "Biá»ƒn sá»‘ xe khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng."),
    capacityTons: z.coerce.number().positive("Táº£i trá»ng pháº£i lá»›n hÆ¡n 0.")
  }),
  z.object({
    type: z.literal("createEmployee"),
    displayName: z.string().trim().min(1, "TÃªn nhÃ¢n viÃªn khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng."),
    roleType: z.enum(["driver", "worker", "warehouse", "sales", "accountant", "supervisor"])
  }),
  z.object({
    type: z.literal("createSalesOrderDraft"),
    customerId: z.string().min(1, "Chá»n khÃ¡ch hÃ ng."),
    lines: z.array(z.object({
      productUnitId: z.string().min(1, "Chá»n váº­t tÆ°."),
      quantity: z.coerce.number().positive("Sá»‘ lÆ°á»£ng pháº£i lá»›n hÆ¡n 0."),
      unitPrice: z.coerce.number().nonnegative("ÄÆ¡n giÃ¡ khÃ´ng Ä‘Æ°á»£c Ã¢m."),
      taxRate: z.coerce.number().min(0, "VAT khÃ´ng Ä‘Æ°á»£c Ã¢m.").max(1, "VAT tá»‘i Ä‘a 100%."),
      unitName: z.string().trim().min(1, "Chá»n Ä‘Æ¡n vá»‹ bÃ¡n.").optional(),
      unitFactor: z.coerce.number().positive("Há»‡ sá»‘ quy Ä‘á»•i pháº£i lá»›n hÆ¡n 0.").optional()
    })).min(1, "ÄÆ¡n bÃ¡n pháº£i cÃ³ Ã­t nháº¥t má»™t dÃ²ng.").optional(),
    productUnitId: z.string().min(1).optional(),
    quantity: z.coerce.number().positive().optional(),
    unitPrice: z.coerce.number().nonnegative().optional(),
    taxRate: z.coerce.number().min(0).max(1).optional()
  }),
  z.object({
    type: z.literal("createPurchaseOrderDraft"),
    supplierId: z.string().min(1, "Chá»n nhÃ  cung cáº¥p."),
    lines: z.array(z.object({
      productUnitId: z.string().min(1, "Chá»n váº­t tÆ°."),
      orderedQuantity: z.coerce.number().positive("Sá»‘ lÆ°á»£ng mua pháº£i lá»›n hÆ¡n 0."),
      unitCost: z.coerce.number().nonnegative("GiÃ¡ mua khÃ´ng Ä‘Æ°á»£c Ã¢m."),
      taxRate: z.coerce.number().min(0, "VAT khÃ´ng Ä‘Æ°á»£c Ã¢m.").max(1, "VAT tá»‘i Ä‘a 100%."),
      unitName: z.string().trim().min(1, "Chá»n Ä‘Æ¡n vá»‹ mua.").optional(),
      unitFactor: z.coerce.number().positive("Há»‡ sá»‘ quy Ä‘á»•i pháº£i lá»›n hÆ¡n 0.").optional(),
      actualBaseQuantity: z.coerce.number().positive("Sá»‘ lÆ°á»£ng thá»±c nháº­n pháº£i lá»›n hÆ¡n 0.").optional(),
      destinationType: z.enum(["warehouse", "customer_direct"]),
      customerId: z.string().optional()
    })).min(1, "ÄÆ¡n mua pháº£i cÃ³ Ã­t nháº¥t má»™t dÃ²ng.").optional(),
    productUnitId: z.string().min(1).optional(),
    orderedQuantity: z.coerce.number().positive().optional(),
    unitCost: z.coerce.number().nonnegative().optional(),
    taxRate: z.coerce.number().min(0).max(1).optional(),
    destinationType: z.enum(["warehouse", "customer_direct"]).optional(),
    customerId: z.string().optional()
  }),
  z.object({
    type: z.literal("createDeliveryJob"),
    salesOrderId: z.string().min(1, "Chá»n Ä‘Æ¡n bÃ¡n."),
    driverId: z.string().min(1, "Chá»n tÃ i xáº¿."),
    vehicleId: z.string().min(1, "Chá»n xe giao hÃ ng."),
    plannedDate: z.string().min(1, "Chá»n ngÃ y giao.")
  }),
  z.object({
    type: z.literal("createCustomerPaymentDraft"),
    customerId: z.string().min(1, "Chá»n khÃ¡ch hÃ ng."),
    amount: z.coerce.number().positive("Sá»‘ tiá»n thu pháº£i lá»›n hÆ¡n 0.")
  }),
  z.object({
    type: z.literal("createSupplierPaymentDraft"),
    supplierId: z.string().min(1, "Chá»n nhÃ  cung cáº¥p."),
    amount: z.coerce.number().positive("Sá»‘ tiá»n chi pháº£i lá»›n hÆ¡n 0.")
  }),
  z.object({
    type: z.literal("createCashVoucherDraft"),
    direction: z.enum(["in", "out"]),
    category: z.string().trim().min(1, "Nháº­p nhÃ³m thu chi."),
    description: z.string().trim().min(1, "Nháº­p diá»…n giáº£i."),
    amount: z.coerce.number().positive("Sá»‘ tiá»n pháº£i lá»›n hÆ¡n 0.")
  }),
  z.object({
    type: z.literal("createEmployeePaymentDraft"),
    employeeId: z.string().min(1, "Chá»n nhÃ¢n viÃªn."),
    amount: z.coerce.number().positive("Sá»‘ tiá»n thanh toÃ¡n pháº£i lá»›n hÆ¡n 0.")
  }),
  z.object({
    type: z.literal("createEmployeeAdvanceDraft"),
    employeeId: z.string().min(1, "Chá»n nhÃ¢n viÃªn."),
    purpose: z.string().trim().min(1, "Nháº­p má»¥c Ä‘Ã­ch táº¡m á»©ng."),
    amount: z.coerce.number().positive("Sá»‘ tiá»n táº¡m á»©ng pháº£i lá»›n hÆ¡n 0.")
  }),
  z.object({
    type: z.literal("createWorkOrderDraft"),
    employeeId: z.string().min(1, "Chá»n nhÃ¢n viÃªn."),
    productUnitId: z.string().min(1, "Chá»n váº­t tÆ°/sáº£n lÆ°á»£ng."),
    actualQuantity: z.coerce.number().positive("Sáº£n lÆ°á»£ng pháº£i lá»›n hÆ¡n 0."),
    totalAmount: z.coerce.number().positive("Tá»•ng tiá»n cÃ´ng pháº£i lá»›n hÆ¡n 0.")
  }),
  z.object({
    type: z.literal("createImportIssue"),
    sourceSheet: z.string().trim().min(1, "TÃªn trang tÃ­nh khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng."),
    rowNumber: z.coerce.number().int().positive("Sá»‘ dÃ²ng pháº£i lá»›n hÆ¡n 0."),
    severity: z.enum(["warning", "error"]),
    message: z.string().trim().min(1, "Ná»™i dung váº¥n Ä‘á» khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng.")
  })
]);

const createCommandInputSchema = z.object({
  command: createCommandSchema,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/, "Idempotency key pháº£i cÃ³ 12-128 kÃ½ tá»± an toÃ n.")
});

const maximumImportRows = 100_000;
const maximumImportSheets = 24;

const createCommandPayloadSchema = createCommandInputSchema.superRefine((input, context) => {
  const command = input.command as { lines?: unknown[] };
  if (command.lines && command.lines.length > 100) {
    context.addIssue({
      code: "custom",
      path: ["command", "lines"],
      message: "Má»—i Ä‘Æ¡n chá»‰ Ä‘Æ°á»£c tá»‘i Ä‘a 100 dÃ²ng."
    });
  }
});

export async function runDemoOperationAction(input: unknown) {
  try {
    const command = operationPayloadSchema.parse(input);
    if (command.operation === "submitDeliveryCompletion") {
      throw new OperationInputError("Xac nhan da giao phai duoc gui kem anh qua bieu mau giao hang.");
    }
    const user = await requireIdentityUser();
    const actor = await requireOperationsActor();
    const result = await runDemoOperation(command.operation, command.idempotencyKey, command.targetId, actor, command.options);
    return { ok: true as const, result: { ...result, state: projectOperationsState(result.state, user) } };
  } catch (error) {
    return { ok: false as const, error: expectedActionError(error, "KhÃ´ng thá»ƒ thá»±c hiá»‡n thao tÃ¡c.") };
  }
}

export async function submitGoodsReceiptWithImageAction(formData: FormData) {
  let attachment: Awaited<ReturnType<typeof saveOperationsReceiptImage>> | undefined;
  try {
    const targetId = formData.get("targetId");
    const quantityValue = formData.get("quantity");
    const file = formData.get("receiptImage");
    if (typeof targetId !== "string" || targetId.trim().length === 0 || targetId.length > 128) {
      throw new OperationInputError("Thiáº¿u dÃ²ng mua cáº§n gá»­i phiáº¿u nháº­p.");
    }
    const quantity = Number(quantityValue);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new OperationInputError("Sá»‘ lÆ°á»£ng nháº­p pháº£i lá»›n hÆ¡n 0.");
    }
    if (!(file instanceof File)) {
      throw new OperationInputError("Pháº£i Ä‘Ã­nh kÃ¨m áº£nh thá»±c nháº­n trÆ°á»›c khi gá»­i phiáº¿u nháº­p.");
    }

    const user = await requireIdentityUser();
    const actor = await requireOperationsActor();
    try {
      attachment = await saveOperationsReceiptImage(file, actor, new Date().toISOString());
    } catch (error) {
      throw new OperationInputError(error instanceof Error ? error.message : "áº¢nh Ä‘Ã­nh kÃ¨m khÃ´ng há»£p lá»‡.");
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
    return { ok: false as const, error: expectedActionError(error, "KhÃ´ng thá»ƒ gá»­i phiáº¿u nháº­p kÃ¨m áº£nh.") };
  }
}

export async function submitDeliveryCompletionWithImageAction(formData: FormData) {
  let attachment: Awaited<ReturnType<typeof saveOperationsDeliveryImage>> | undefined;
  try {
    const targetId = formData.get("targetId");
    const recipientName = formData.get("recipientName");
    const evidence = formData.get("evidence");
    const rawLineQuantities = formData.get("lineQuantities");
    const file = formData.get("deliveryImage");
    if (typeof targetId !== "string" || targetId.trim().length === 0 || targetId.length > 128) {
      throw new OperationInputError("Thieu chuyen giao can xac nhan.");
    }
    if (typeof recipientName !== "string" || recipientName.trim().length === 0 || recipientName.length > 160) {
      throw new OperationInputError("Nhap ten nguoi nhan hang.");
    }
    if (typeof evidence !== "string" || evidence.trim().length === 0 || evidence.length > 500) {
      throw new OperationInputError("Nhap ghi chu bang chung giao nhan.");
    }
    if (!(file instanceof File)) {
      throw new OperationInputError("Phai chup hoac dinh kem it nhat mot anh truoc khi xac nhan da giao.");
    }
    if (typeof rawLineQuantities !== "string" || rawLineQuantities.length === 0 || rawLineQuantities.length > 20_000) {
      throw new OperationInputError("Thieu so luong thuc giao.");
    }

    let lineQuantities: Record<string, number>;
    try {
      const parsed = JSON.parse(rawLineQuantities);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length === 0 || Object.keys(parsed).length > 100) {
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
      throw new OperationInputError("So luong thuc giao khong hop le.");
    }

    const user = await requireIdentityUser();
    const actor = await requireOperationsActor();
    try {
      attachment = await saveOperationsDeliveryImage(file, actor, new Date().toISOString());
    } catch (error) {
      throw new OperationInputError(error instanceof Error ? error.message : "Anh xac nhan giao khong hop le.");
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
    return { ok: false as const, error: expectedActionError(error, "Khong the gui xac nhan giao kem anh.") };
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
    return { ok: false as const, error: expectedActionError(error, "KhÃ´ng thá»ƒ táº¡o dá»¯ liá»‡u má»›i.") };
  }
}

export async function runDemoCreateCommandWithImageAction(formData: FormData) {
  let attachment: Awaited<ReturnType<typeof saveOperationsDocumentImage>> | undefined;
  try {
    const rawCommand = formData.get("command");
    const rawIdempotencyKey = formData.get("idempotencyKey");
    const file = formData.get("documentImage");
    if (typeof rawCommand !== "string" || rawCommand.length === 0 || rawCommand.length > 200_000) {
      throw new OperationInputError("Dá»¯ liá»‡u Ä‘Æ¡n hÃ ng khÃ´ng há»£p lá»‡.");
    }
    if (typeof rawIdempotencyKey !== "string") {
      throw new OperationInputError("Thiáº¿u mÃ£ xá»­ lÃ½ duy nháº¥t cho Ä‘Æ¡n hÃ ng.");
    }
    if (!(file instanceof File)) {
      throw new OperationInputError("Chá»n áº£nh chá»©ng tá»« trÆ°á»›c khi táº¡o Ä‘Æ¡n.");
    }

    const parsed = createCommandPayloadSchema.parse({
      command: JSON.parse(rawCommand),
      idempotencyKey: rawIdempotencyKey
    });
    if (parsed.command.type !== "createSalesOrderDraft" && parsed.command.type !== "createPurchaseOrderDraft") {
      throw new OperationInputError("Chá»‰ Ä‘Æ¡n bÃ¡n hoáº·c Ä‘Æ¡n mua má»›i Ä‘Æ°á»£c Ä‘Ã­nh kÃ¨m áº£nh.");
    }

    const user = await requireIdentityUser();
    const actor = await requireOperationsActor();
    try {
      attachment = await saveOperationsDocumentImage(file, actor, new Date().toISOString());
    } catch (error) {
      throw new OperationInputError(error instanceof Error ? error.message : "áº¢nh Ä‘Ã­nh kÃ¨m khÃ´ng há»£p lá»‡.");
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
    return { ok: false as const, error: expectedActionError(error, "KhÃ´ng thá»ƒ táº¡o Ä‘Æ¡n kÃ¨m áº£nh.") };
  }
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
    throw new Error("KhÃ´ng thá»ƒ cháº¡y thá»­ workbook.");
  }
}

async function importWorkbookDryRunInternal(formData: FormData) {
  const file = formData.get("workbook");
  const user = await requireIdentityUser();
  const actor = await requireOperationsActor();
  if (!(file instanceof File)) {
    throw new Error("Chá»n file Excel .xlsx Ä‘á»ƒ cháº¡y thá»­ import.");
  }
  if (file.name.length > 200 || /[\u0000-\u001f\u007f]/u.test(file.name)) {
    throw new Error("TÃªn file import khÃ´ng há»£p lá»‡.");
  }
  if (!file.name.toLocaleLowerCase("vi-VN").endsWith(".xlsx")) {
    throw new Error("Há»‡ thá»‘ng chá»‰ nháº­n workbook .xlsx.");
  }
  if (file.size <= 0 || file.size > 40 * 1024 * 1024) {
    throw new Error("File import pháº£i cÃ³ dung lÆ°á»£ng tá»« 1 byte Ä‘áº¿n 40 MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const sheetNames = await readSheetNames(buffer);
  const transactionSheets = sheetNames.filter((sheetName) => /^\d{1,2}\.\d{2}$/.test(sheetName));
  if (transactionSheets.length > maximumImportSheets) {
    throw new Error("Workbook cÃ³ quÃ¡ nhiá»u trang giao dá»‹ch Ä‘á»ƒ xá»­ lÃ½ an toÃ n.");
  }
  if (transactionSheets.length === 0) {
    throw new Error("Workbook khÃ´ng cÃ³ trang giao dá»‹ch thÃ¡ng dáº¡ng 5.26, 6.26, ...");
  }

  let rowCount = 0;
  const issues: Array<{ sourceSheet: string; rowNumber: number; severity: "warning" | "error"; message: string }> = [];
  for (const sheetName of transactionSheets) {
    const rows = await readXlsxFile(buffer, { sheet: sheetName });
    if (rows.length > maximumImportRows) {
      throw new Error("Trang giao dá»‹ch cÃ³ quÃ¡ nhiá»u dÃ²ng Ä‘á»ƒ xá»­ lÃ½ an toÃ n.");
    }
    const result = inspectImportSheet(sheetName, rows);
    rowCount += result.rowCount;
    if (rowCount > maximumImportRows) {
      throw new Error("Workbook cÃ³ quÃ¡ nhiá»u dÃ²ng Ä‘á»ƒ xá»­ lÃ½ an toÃ n.");
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
      issues: hasData ? [{ sourceSheet: sheetName, rowNumber: 1, severity: "error" as const, message: "KhÃ´ng tÃ¬m tháº¥y dÃ²ng tiÃªu Ä‘á» NGÃ€Y MUA/TÃŠN KH." }] : []
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
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "error", message: "Thiáº¿u khÃ¡ch hÃ ng, váº­t tÆ° hoáº·c Ä‘Æ¡n vá»‹ giao dá»‹ch." });
    }
    if (typeof date === "string") {
      const parsedDate = new Date(date);
      if (Number.isNaN(parsedDate.getTime())) {
        issues.push({ sourceSheet: sheetName, rowNumber, severity: "error", message: "NgÃ y mua dáº¡ng text khÃ´ng thá»ƒ chuáº©n hÃ³a." });
      } else {
        issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: "NgÃ y mua Ä‘ang lÆ°u dáº¡ng text, cáº§n chuáº©n hÃ³a thÃ nh ngÃ y trÆ°á»›c khi import." });
        if (parsedDate.getUTCMonth() + 1 !== expectedMonth) {
          issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: `NgÃ y giao dá»‹ch khÃ´ng thuá»™c thÃ¡ng ${expectedMonth} cá»§a trang ${sheetName}.` });
        }
      }
    } else if (date instanceof Date && date.getMonth() + 1 !== expectedMonth) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: `NgÃ y giao dá»‹ch khÃ´ng thuá»™c thÃ¡ng ${expectedMonth} cá»§a trang ${sheetName}.` });
    } else if (!(date instanceof Date)) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "error", message: "Thiáº¿u ngÃ y mua há»£p lá»‡." });
    }
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "error", message: "Sá»‘ lÆ°á»£ng thiáº¿u hoáº·c khÃ´ng lá»›n hÆ¡n 0." });
    } else if (quantity >= 30000 && quantity <= 60000) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: "Sá»‘ lÆ°á»£ng giá»‘ng Excel serial date, cáº§n kiá»ƒm tra thá»§ cÃ´ng." });
    }

    const net = numericCell(row[indexes.net]);
    const tax = numericCell(row[indexes.tax]);
    const gross = numericCell(row[indexes.gross]);
    if (net !== undefined && tax !== undefined && gross !== undefined && Math.abs(net + tax - gross) > 1) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: "Tiá»n trÆ°á»›c VAT + thuáº¿ khÃ´ng khá»›p tiá»n sau VAT." });
    }
    if (indexes.paymentMethod >= 0 && !cellText(row[indexes.paymentMethod])) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: "Thiáº¿u hÃ¬nh thá»©c thanh toÃ¡n; chÆ°a Ä‘Æ°á»£c tá»± suy diá»…n cÃ´ng ná»£." });
    }

    const fingerprint = JSON.stringify([date instanceof Date ? date.toISOString() : date, customer, product, unit, quantity, net, tax, gross]);
    const firstRow = fingerprints.get(fingerprint);
    if (firstRow) {
      issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: `DÃ²ng cÃ³ ná»™i dung trÃ¹ng dÃ²ng ${firstRow}, cáº§n Ä‘á»‘i chiáº¿u trÆ°á»›c import.` });
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
    .replace(/Ä‘/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numericCell(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
