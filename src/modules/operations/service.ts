import {
  cashBalance,
  customerBalance,
  lineTotals,
  salesOrderTotals,
  stockBalance,
  supplierBalance
} from "./selectors";
import { createRoleActor as buildRoleActor } from "./identity";
import {
  customerAllocatedAmountForLedgerEntry,
  getOpenCustomerDebtObligations,
  getOpenSupplierDebtObligations,
  paymentAllocatedAmount,
  supplierAllocatedAmountForLedgerEntry
} from "./debt-reconciliation";
import { asOperationInputError } from "./errors";
import type {
  AuditLog,
  ApprovalRequestType,
  CompensationBatch,
  CustomerLedgerEntry,
  CustomerPayment,
  DeliveryJob,
  EmployeeLedgerEntry,
  EmployeePayment,
  InventoryMovement,
  OperationName,
  OperationOptions,
  OperationResult,
  OperationsActor,
  OperationsAttachment,
  OperationsApprovalRequest,
  OperationsState,
  PurchaseOrder,
  PurchaseOrderLine,
  SalesOrder,
  SalesOrderLine,
  SupplierPayment,
  SupplierLedgerEntry
} from "./types";

type RunOperationInput = {
  state: OperationsState;
  operation: OperationName;
  actor: OperationsActor;
  now: string;
  idempotencyKey: string;
  targetId?: string;
  options?: OperationOptions;
};

export const ORDER_ALREADY_CLAIMED = "ORDER_ALREADY_CLAIMED";

const requiredPermissions: Record<OperationName, string> = {
  confirmSalesOrder: "sales.confirm",
  recordWorkOrderLocation: "workforce.record_location",
  claimOpenSalesWorkOrder: "workforce.claim_open_order",
  allocateSalesSources: "sales.allocate_source",
  confirmPurchaseOrder: "procurement.confirm",
  submitGoodsReceipt: "inventory.submit_receipt",
  approveGoodsReceipt: "inventory.approve_receipt",
  rejectGoodsReceipt: "inventory.reject_receipt",
  postGoodsReceipt: "inventory.post_receipt",
  reverseInventoryMovement: "inventory.reverse_movement",
  postInventoryTransfer: "inventory.post_transfer",
  postInventoryCountAdjustment: "inventory.post_count_adjustment",
  confirmDirectDelivery: "delivery.confirm_direct",
  reverseDirectDelivery: "delivery.reverse_direct",
  startDeliveryLoading: "delivery.start_loading",
  dispatchDelivery: "delivery.dispatch",
  submitDeliveryCompletion: "delivery.submit_completion",
  approveDeliveryCompletion: "delivery.approve_completion",
  rejectDeliveryCompletion: "delivery.reject_completion",
  completeDelivery: "delivery.complete",
  failDelivery: "delivery.fail",
  confirmCustomerPayment: "cash.confirm_receipt",
  allocateCustomerPayment: "receivables.allocate_payment",
  reverseCustomerPayment: "cash.reverse_receipt",
  confirmSupplierPayment: "cash.confirm_payment",
  allocateSupplierPayment: "payables.allocate_payment",
  reverseSupplierPayment: "cash.reverse_payment",
  confirmCashVoucher: "cash.confirm_voucher",
  reverseCashVoucher: "cash.reverse_voucher",
  approveWorkOutput: "workforce.approve_output",
  postCompensation: "compensation.post",
  payEmployee: "cash.pay_employee",
  reverseEmployeePayment: "cash.reverse_employee_payment",
  confirmEmployeeAdvance: "cash.confirm_employee_advance",
  reverseEmployeeAdvance: "cash.reverse_employee_advance",
  resolveImportIssue: "import.resolve_issue",
  ignoreImportIssue: "import.ignore_issue"
};

export function runOperation(input: RunOperationInput): OperationResult {
  try {
    return runOperationInternal(input);
  } catch (error) {
    throw asOperationInputError(error);
  }
}

function runOperationInternal({
  state,
  operation,
  actor,
  now,
  idempotencyKey,
  targetId,
  options
}: RunOperationInput): OperationResult {
  if (state.processedOperations.some((entry) => entry.idempotencyKey === idempotencyKey)) {
    return {
      state,
      summary: "YÃªu cáº§u nÃ y Ä‘Ã£ Ä‘Æ°á»£c xá»­ lÃ½ trÆ°á»›c Ä‘Ã³, há»‡ thá»‘ng khÃ´ng ghi trÃ¹ng.",
      severity: "warning"
    };
  }

  assertPermission(actor, requiredPermissions[operation]);
  assertActorWarehouseScope(actor, state, operation, targetId, options);

  const draft = structuredClone(state) as OperationsState;
  const before = createAuditSnapshot(draft, targetId);
  let summary: string;

  switch (operation) {
    case "confirmSalesOrder":
      summary = confirmSalesOrder(draft, now, targetId);
      break;
    case "claimOpenSalesWorkOrder":
      summary = claimOpenSalesWorkOrder(draft, now, targetId, options, actor);
      break;
    case "recordWorkOrderLocation":
      summary = recordWorkOrderLocation(draft, now, targetId, options, actor);
      break;
    case "allocateSalesSources":
      summary = allocateSalesSources(draft, targetId);
      break;
    case "confirmPurchaseOrder":
      summary = confirmPurchaseOrder(draft, targetId);
      break;
    case "submitGoodsReceipt":
      summary = submitGoodsReceipt(draft, now, targetId, options, actor);
      break;
    case "approveGoodsReceipt":
      summary = approveGoodsReceipt(draft, now, targetId, actor);
      break;
    case "rejectGoodsReceipt":
      summary = rejectGoodsReceipt(draft, now, targetId, options, actor);
      break;
    case "postGoodsReceipt":
      summary = postGoodsReceipt(draft, now, targetId, options);
      break;
    case "reverseInventoryMovement":
      summary = reverseInventoryMovement(draft, now, targetId, options);
      break;
    case "postInventoryTransfer":
      summary = postInventoryTransfer(draft, now, options);
      break;
    case "postInventoryCountAdjustment":
      summary = postInventoryCountAdjustment(draft, now, options);
      break;
    case "confirmDirectDelivery":
      summary = confirmDirectDelivery(draft, now, targetId, options);
      break;
    case "reverseDirectDelivery":
      summary = reverseDirectDelivery(draft, now, targetId, options);
      break;
    case "startDeliveryLoading":
      summary = startDeliveryLoading(draft, targetId);
      break;
    case "dispatchDelivery":
      summary = dispatchDelivery(draft, targetId);
      break;
    case "submitDeliveryCompletion":
      summary = submitDeliveryCompletion(draft, now, targetId, options, actor);
      break;
    case "approveDeliveryCompletion":
      summary = approveDeliveryCompletion(draft, now, targetId, actor);
      break;
    case "rejectDeliveryCompletion":
      summary = rejectDeliveryCompletion(draft, now, targetId, options, actor);
      break;
    case "completeDelivery":
      summary = completeDelivery(draft, now, targetId, options);
      break;
    case "failDelivery":
      summary = failDelivery(draft, targetId, options);
      break;
    case "confirmCustomerPayment":
      summary = confirmCustomerPayment(draft, now, targetId);
      break;
    case "allocateCustomerPayment":
      summary = allocateCustomerPayment(draft, targetId, options);
      break;
    case "reverseCustomerPayment":
      summary = reverseCustomerPayment(draft, now, targetId, options);
      break;
    case "confirmSupplierPayment":
      summary = confirmSupplierPayment(draft, now, targetId);
      break;
    case "allocateSupplierPayment":
      summary = allocateSupplierPayment(draft, targetId, options);
      break;
    case "reverseSupplierPayment":
      summary = reverseSupplierPayment(draft, now, targetId, options);
      break;
    case "confirmCashVoucher":
      summary = confirmCashVoucher(draft, now, targetId);
      break;
    case "reverseCashVoucher":
      summary = reverseCashVoucher(draft, now, targetId, options);
      break;
    case "approveWorkOutput":
      summary = approveWorkOutput(draft, targetId);
      break;
    case "postCompensation":
      summary = postCompensation(draft, now, targetId);
      break;
    case "payEmployee":
      summary = payEmployee(draft, now, targetId);
      break;
    case "reverseEmployeePayment":
      summary = reverseEmployeePayment(draft, now, targetId, options);
      break;
    case "confirmEmployeeAdvance":
      summary = confirmEmployeeAdvance(draft, now, targetId);
      break;
    case "reverseEmployeeAdvance":
      summary = reverseEmployeeAdvance(draft, now, targetId, options);
      break;
    case "resolveImportIssue":
      summary = resolveImportIssue(draft, targetId);
      break;
    case "ignoreImportIssue":
      summary = ignoreImportIssue(draft, targetId);
      break;
    default:
      operation satisfies never;
      throw new Error("Thao tÃ¡c khÃ´ng Ä‘Æ°á»£c há»— trá»£.");
  }

  draft.processedOperations.push({
    idempotencyKey,
    operation,
    summary
  });
  draft.auditLogs.unshift(createAuditLog(
    draft,
    actor,
    operation,
    now,
    summary,
    requiredPermissions[operation],
    targetId,
    idempotencyKey,
    options?.reason,
    before,
    createAuditSnapshot(draft, targetId)
  ));

  return {
    state: draft,
    summary,
    severity: "success"
  };
}

export function createOwnerActor(): OperationsActor {
  return buildRoleActor("owner");
}

export { createRoleActor } from "./identity";

function assertPermission(actor: OperationsActor, permission: string) {
  if (!actor.permissions.includes(permission)) {
    throw new Error("Người dùng không có quyền thực hiện thao tác này.");
  }
}

function assertActorWarehouseScope(
  actor: OperationsActor,
  state: OperationsState,
  operation: OperationName,
  targetId?: string,
  options?: OperationOptions
) {
  if (actor.role !== "warehouse") {
    return;
  }
  const assigned = new Set(actor.warehouseIds ?? []);
  const warehouseIds: string[] = [];

  if (operation === "postGoodsReceipt") {
    const purchase = targetId
      ? findPurchaseLine(state, (order, line) => order.id === targetId || line.id === targetId)
      : findNextWarehouseReceipt(state);
    if (purchase?.line.warehouseId) {
      warehouseIds.push(purchase.line.warehouseId);
    }
  }
  if (operation === "reverseInventoryMovement" && targetId) {
    const movement = state.inventoryMovements.find((item) => item.id === targetId || item.postingKey === targetId);
    if (movement) {
      warehouseIds.push(movement.warehouseId);
      const related = movement.relatedMovementId ? state.inventoryMovements.find((item) => item.id === movement.relatedMovementId) : undefined;
      if (related) {
        warehouseIds.push(related.warehouseId);
      }
    }
  }
  if (operation === "postInventoryTransfer") {
    warehouseIds.push(...[options?.sourceWarehouseId, options?.destinationWarehouseId].filter((value): value is string => Boolean(value)));
  }
  if (operation === "postInventoryCountAdjustment" && options?.warehouseId) {
    warehouseIds.push(options.warehouseId);
  }
  if ((operation === "startDeliveryLoading" || operation === "dispatchDelivery") && targetId) {
    const job = state.deliveryJobs.find((item) => item.id === targetId);
    const order = job ? state.salesOrders.find((item) => item.id === job.salesOrderId) : undefined;
    warehouseIds.push(...(order?.lines.map((line) => line.warehouseId).filter((value): value is string => Boolean(value)) ?? []));
  }

  if (warehouseIds.some((warehouseId) => !assigned.has(warehouseId))) {
    throw new Error("Nhân viên kho không được thao tác kho/bãi ngoài phạm vi được phân công.");
  }
}

function confirmSalesOrder(state: OperationsState, now: string, targetId?: string) {
  const order = targetId ? state.salesOrders.find((item) => item.id === targetId) : state.salesOrders.find((item) => item.status === "draft");
  if (!order) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n bÃ¡n cáº§n xÃ¡c nháº­n." : "KhÃ´ng cÃ²n Ä‘Æ¡n bÃ¡n nhÃ¡p cáº§n xÃ¡c nháº­n.");
  }
  if (order.status !== "draft") {
    throw new Error("Chá»‰ Ä‘Æ¡n nhÃ¡p má»›i Ä‘Æ°á»£c xÃ¡c nháº­n.");
  }
  if (order.lines.length === 0) {
    throw new Error("ÄÆ¡n bÃ¡n pháº£i cÃ³ Ã­t nháº¥t má»™t dÃ²ng váº­t tÆ°.");
  }
  for (const line of order.lines) {
    if (line.quantity <= 0) {
      throw new Error("Sá»‘ lÆ°á»£ng bÃ¡n pháº£i lá»›n hÆ¡n 0.");
    }
    if (line.unitPrice < 0 || line.taxRate < 0) {
      throw new Error("GiÃ¡ hoáº·c VAT khÃ´ng há»£p lá»‡.");
    }
  }

  order.status = "confirmed";
  order.version += 1;
  const existingTask = state.workOrders.find((workOrder) => workOrder.salesOrderId === order.id);
  if (!existingTask) {
    const sequence = state.workOrders.length + 1;
    state.workOrders.push({
      id: nextId("wo", state.workOrders.length),
      documentNo: `CV-NHAN-${order.documentNo}`,
      sourceDocument: order.documentNo,
      salesOrderId: order.id,
      workType: "Nhận và chuẩn bị đơn giao hàng",
      workDate: order.orderDate,
      status: "open",
      version: 1,
      outputs: [],
      participants: []
    });
    return `Xác nhận ${order.documentNo}; giá và VAT được giữ theo ảnh chụp giá của đơn. Đã gửi thông báo việc mới cho thợ (phiếu ${String(sequence).padStart(4, "0")}).`;
  }
  return `XÃ¡c nháº­n ${order.documentNo}; giÃ¡ vÃ  VAT Ä‘Æ°á»£c giá»¯ theo áº£nh chá»¥p giÃ¡ cá»§a Ä‘Æ¡n.`;
}

function claimOpenSalesWorkOrder(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  assertWorkerClaimActor(actor);
  if (!targetId) {
    throw new Error("Chon don moi can nhan.");
  }

  const workOrder = state.workOrders.find((item) => item.id === targetId);
  if (!workOrder || !workOrder.salesOrderId) {
    throw new Error("Khong tim thay don moi can nhan.");
  }
  const currentVersion = workOrder.version ?? 1;
  if (options?.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
    throw new Error(
      `${ORDER_ALREADY_CLAIMED}: Don da duoc nhan hoac da thay doi, vui long tai lai danh sach cong viec.`
    );
  }
  if (workOrder.status !== "open" || workOrder.participants.length > 0) {
    throw new Error(`${ORDER_ALREADY_CLAIMED}: Don nay da co nguoi nhan.`);
  }

  const salesOrder = state.salesOrders.find((item) => item.id === workOrder.salesOrderId);
  if (!salesOrder || !["confirmed", "allocated", "partially_delivered"].includes(salesOrder.status)) {
    throw new Error("Don ban khong con san sang de nhan.");
  }

  const worker = findWorkerEmployee(state, actor);
  if (!worker || worker.status !== "active") {
    throw new Error("Tai khoan tho chua duoc gan vao nhan su dang hoat dong.");
  }

  const activeDeliveryJob = state.deliveryJobs.find((job) =>
    job.salesOrderId === salesOrder.id && ["assigned", "loading", "in_transit"].includes(job.status)
  );
  if (activeDeliveryJob && activeDeliveryJob.status !== "assigned") {
    throw new Error("Chuyen giao da bat dau, khong the nhan don moi.");
  }

  workOrder.status = "assigned";
  workOrder.participants = [{ employeeId: worker.id, shareFactor: 1 }];
  workOrder.claimedByEmployeeId = worker.id;
  workOrder.claimedAt = now;
  workOrder.version = currentVersion + 1;
  if (activeDeliveryJob && !activeDeliveryJob.helperIds.includes(worker.id)) {
    activeDeliveryJob.helperIds.push(worker.id);
  }

  return `${worker.displayName} da nhan ${workOrder.documentNo}. Don da duoc khoa cho nguoi nhan dau tien.`;
}

const MAX_WORK_ORDER_LOCATION_HISTORY = 50;

function recordWorkOrderLocation(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  assertWorkerClaimActor(actor);
  if (!targetId) {
    throw new Error("Chon don cong viec can cap nhat vi tri.");
  }

  const workOrder = state.workOrders.find((item) => item.id === targetId);
  if (!workOrder || !workOrder.salesOrderId) {
    throw new Error("Khong tim thay don cong viec.");
  }
  if (workOrder.status === "open" || !workOrder.claimedByEmployeeId) {
    throw new Error("Chi co the cap nhat vi tri khi don da duoc nhan.");
  }

  const worker = findWorkerEmployee(state, actor);
  if (!worker || worker.status !== "active") {
    throw new Error("Tai khoan tho chua duoc gan vao nhan su dang hoat dong.");
  }
  const canRecord = workOrder.claimedByEmployeeId === worker.id || workOrder.participants.some((participant) => participant.employeeId === worker.id);
  if (!canRecord) {
    throw new Error("Ban khong duoc phep ghi vi tri cho don nay.");
  }

  const rawLocation = options?.location;
  if (!rawLocation) {
    throw new Error("Thong tin vi tri khong duoc de trong.");
  }
  const latitude = rawLocation.latitude;
  const longitude = rawLocation.longitude;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("Vi do phai la so trong khoang -90 den 90.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("Kinh do phai la so trong khoang -180 den 180.");
  }

  const accuracyMeters = rawLocation.accuracyMeters;
  if (accuracyMeters !== undefined && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0)) {
    throw new Error("Do chinh xac phai la so duong.");
  }

  const source = rawLocation.source === "manual" ? ("manual" as const) : ("gps" as const);
  const nextLocation = {
    employeeId: worker.id,
    recordedAt: rawLocation.recordedAt?.trim() || now,
    latitude,
    longitude,
    accuracyMeters,
    source
  };
  const updatedHistory = [...(workOrder.locationHistory ?? []), nextLocation];
  if (updatedHistory.length > MAX_WORK_ORDER_LOCATION_HISTORY) {
    updatedHistory.splice(0, updatedHistory.length - MAX_WORK_ORDER_LOCATION_HISTORY);
  }
  workOrder.locationHistory = updatedHistory;

  return `${worker.displayName} da cap nhat vi tri cho ${workOrder.documentNo}.`;
}

function allocateSalesSources(state: OperationsState, targetId?: string) {
  const order = targetId ? state.salesOrders.find((item) => item.id === targetId) : state.salesOrders.find((item) => item.status === "confirmed");
  if (!order) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n bÃ¡n cáº§n phÃ¢n bá»• nguá»“n." : "KhÃ´ng cÃ³ Ä‘Æ¡n bÃ¡n Ä‘Ã£ xÃ¡c nháº­n cáº§n phÃ¢n bá»• nguá»“n.");
  }
  if (order.status !== "confirmed") {
    throw new Error("Chá»‰ phÃ¢n bá»• nguá»“n sau khi Ä‘Æ¡n bÃ¡n Ä‘Ã£ xÃ¡c nháº­n.");
  }

  for (const line of order.lines) {
    if (line.quantity <= 0) {
      throw new Error("Sá»‘ lÆ°á»£ng bÃ¡n pháº£i lá»›n hÆ¡n 0 trÆ°á»›c khi phÃ¢n bá»• nguá»“n.");
    }
    if (line.deliveredQuantity > 0) {
      throw new Error("KhÃ´ng phÃ¢n bá»• láº¡i dÃ²ng Ä‘Ã£ giao.");
    }

    const allocation = findSourceAllocation(state, order, line);
    line.sourceType = allocation.sourceType;
    line.warehouseId = allocation.warehouseId;
    line.purchaseOrderLineId = allocation.purchaseOrderLineId;
  }
  order.status = "allocated";
  order.version += 1;

  return `PhÃ¢n bá»• nguá»“n cho ${order.documentNo}: ${order.lines.length} dÃ²ng Ä‘Ã£ cÃ³ nguá»“n kho hoáº·c giao tháº³ng.`;
}

function confirmPurchaseOrder(state: OperationsState, targetId?: string) {
  const order = targetId
    ? state.purchaseOrders.find((item) => item.id === targetId)
    : state.purchaseOrders.find((item) => item.status === "draft");
  if (!order) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n mua cáº§n xÃ¡c nháº­n." : "KhÃ´ng cÃ²n Ä‘Æ¡n mua nhÃ¡p cáº§n xÃ¡c nháº­n.");
  }
  if (order.status !== "draft") {
    throw new Error("Chá»‰ Ä‘Æ¡n mua nhÃ¡p má»›i Ä‘Æ°á»£c xÃ¡c nháº­n.");
  }
  if (order.lines.length === 0) {
    throw new Error("ÄÆ¡n mua pháº£i cÃ³ Ã­t nháº¥t má»™t dÃ²ng váº­t tÆ°.");
  }
  for (const [index, line] of order.lines.entries()) {
    if (line.orderedQuantity <= 0 || line.unitCost < 0 || line.taxRate < 0 || line.taxRate > 1) {
      throw new Error(`DÃ²ng mua ${index + 1} cÃ³ sá»‘ lÆ°á»£ng, giÃ¡ hoáº·c VAT khÃ´ng há»£p lá»‡.`);
    }
    if (line.destinationType === "warehouse" && !line.warehouseId) {
      throw new Error(`DÃ²ng mua ${index + 1} thiáº¿u kho nháº­n.`);
    }
    if (line.destinationType === "customer_direct" && !line.customerId) {
      throw new Error(`DÃ²ng mua ${index + 1} giao tháº³ng thiáº¿u khÃ¡ch nháº­n.`);
    }
  }
  order.status = "ordered";
  return `XÃ¡c nháº­n ${order.documentNo}; khÃ³a giÃ¡ mua vÃ  Ä‘iá»ƒm nháº­n trÆ°á»›c khi nháº­n hÃ ng.`;
}

function submitGoodsReceipt(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  assertWorkerSubmissionActor(actor);
  if (!findWorkerEmployee(state, actor)) {
    throw new Error("TÃ i khoáº£n Thá»£ chÆ°a Ä‘Æ°á»£c gáº¯n vá»›i há»“ sÆ¡ nhÃ¢n viÃªn há»£p lá»‡.");
  }
  const candidate = targetId
    ? findPurchaseLine(state, (purchaseOrder, line) => purchaseOrder.id === targetId || line.id === targetId)
    : findNextWarehouseReceipt(state);
  const purchaseOrder = candidate?.purchaseOrder;
  const line = candidate?.line;
  if (!purchaseOrder || !line) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y dÃ²ng mua cáº§n gá»­i phiáº¿u nháº­p.");
  }
  if (purchaseOrder.status === "draft" || line.destinationType !== "warehouse" || !line.warehouseId) {
    throw new Error("DÃ²ng mua chÆ°a sáºµn sÃ ng Ä‘á»ƒ gá»­i phiáº¿u nháº­p kho.");
  }
  if (line.receivedQuantity >= line.orderedQuantity) {
    throw new Error("DÃ²ng mua Ä‘Ã£ nháº­p Ä‘á»§, khÃ´ng thá»ƒ gá»­i láº¡i phiáº¿u.");
  }
  if (findPendingApprovalRequest(state, "goods_receipt", line.id)) {
    throw new Error("DÃ²ng mua nÃ y Ä‘ang chá» Chá»§ cá»­a hÃ ng hoáº·c Káº¿ toÃ¡n duyá»‡t.");
  }

  const remainingQuantity = line.orderedQuantity - line.receivedQuantity;
  const receivedQuantity = options?.quantity ?? remainingQuantity;
  if (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0 || receivedQuantity > remainingQuantity) {
    throw new Error(`Sá»‘ lÆ°á»£ng nháº­p pháº£i lá»›n hÆ¡n 0 vÃ  khÃ´ng vÆ°á»£t ${remainingQuantity}.`);
  }
  const attachments = options?.attachments ?? [];
  validateReceiptAttachments(attachments, actor);

  state.approvalRequests.push({
    id: nextId("approval", state.approvalRequests.length),
    documentNo: `APR-NK-${String(state.approvalRequests.length + 1).padStart(6, "0")}`,
    type: "goods_receipt",
    targetId: line.id,
    status: "pending",
    quantity: receivedQuantity,
    attachments,
    submittedBy: actor.id,
    submittedByName: actor.displayName,
    submittedAt: now
  });
  return `Da gui phieu nhap ${receivedQuantity} cho ${purchaseOrder.documentNo}; cho Chu cua hang hoac Ke toan duyet.`;
}

function approveGoodsReceipt(state: OperationsState, now: string, targetId: string | undefined, actor: OperationsActor) {
  assertApprovalActor(actor);
  const request = findApprovalRequest(state, "goods_receipt", targetId);
  if (!request || request.status !== "pending" || !request.quantity) {
    throw new Error("Khong tim thay phieu nhap dang cho duyet.");
  }
  postGoodsReceipt(state, now, request.targetId, { quantity: request.quantity }, true);
  request.status = "approved";
  request.approvedBy = actor.id;
  request.approvedByName = actor.displayName;
  request.approvedAt = now;
  return `Da duyet va ghi nhan phieu nhap ${request.documentNo}.`;
}

function rejectGoodsReceipt(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  assertApprovalActor(actor);
  const request = findApprovalRequest(state, "goods_receipt", targetId);
  const reason = requireReason(options?.reason, "Tu choi phieu nhap");
  if (!request || request.status !== "pending") {
    throw new Error("Khong tim thay phieu nhap dang cho duyet.");
  }
  request.status = "rejected";
  request.rejectionReason = reason;
  request.approvedBy = actor.id;
  request.approvedByName = actor.displayName;
  request.approvedAt = now;
  return `Da tu choi phieu nhap ${request.documentNo}; ly do: ${reason}.`;
}

function postGoodsReceipt(
  state: OperationsState,
  now: string,
  targetId?: string,
  options?: OperationOptions,
  bypassApproval = false
) {
  const candidate = targetId ? findPurchaseLine(state, (purchaseOrder, line) => purchaseOrder.id === targetId || line.id === targetId) : findNextWarehouseReceipt(state);
  const purchaseOrder = candidate?.purchaseOrder;
  const line = candidate?.line;
  if (!purchaseOrder || !line) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y dÃ²ng mua cáº§n nháº­p kho." : "KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n mua nháº­p kho.");
  }
  if (purchaseOrder.status === "draft") {
    throw new Error("Cần xác nhận đơn mua trước khi nhập kho.");
  }
  if (line.destinationType !== "warehouse" || !line.warehouseId) {
    throw new Error("DÃ²ng mua nÃ y khÃ´ng pháº£i nháº­p kho cá»­a hÃ ng.");
  }
  if (line.receivedQuantity >= line.orderedQuantity) {
    throw new Error("DÃ²ng mua Ä‘Ã£ nháº­p Ä‘á»§, khÃ´ng thá»ƒ ghi nháº­n láº¡i.");
  }

  if (!bypassApproval && findPendingApprovalRequest(state, "goods_receipt", line.id)) {
    throw new Error("DÃ²ng mua nÃ y Ä‘ang chá» Chá»§ cá»­a hÃ ng hoáº·c Káº¿ toÃ¡n duyá»‡t.");
  }

  const remainingQuantity = line.orderedQuantity - line.receivedQuantity;
  const receivedQuantity = options?.quantity ?? remainingQuantity;
  if (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0 || receivedQuantity > remainingQuantity) {
    throw new Error(`Sá»‘ lÆ°á»£ng nháº­p pháº£i lá»›n hÆ¡n 0 vÃ  khÃ´ng vÆ°á»£t ${remainingQuantity}.`);
  }

  const postingKey = nextPostingKey(state, `receipt-${line.id}`);
  assertNoInventoryPosting(state, postingKey);

  line.receivedQuantity += receivedQuantity;
  syncPurchaseOrderStatus(purchaseOrder);

  state.inventoryMovements.push({
    id: nextId("im", state.inventoryMovements.length),
    movementType: "receipt",
    sourceDocument: purchaseOrder.documentNo,
    postingKey,
    sourceLineId: line.id,
    warehouseId: line.warehouseId,
    productUnitId: line.productUnitId,
    quantity: receivedQuantity,
    unitCost: line.unitCost,
    postedAt: now
  });

  state.supplierLedgerEntries.push(
    createSupplierLedgerEntry(state, {
      supplierId: purchaseOrder.supplierId,
      sourceDocument: purchaseOrder.documentNo,
      direction: "credit",
      amount: purchaseLineGross(receivedQuantity, line.unitCost, line.taxRate),
      netAmount: receivedQuantity * line.unitCost,
      taxAmount: receivedQuantity * line.unitCost * line.taxRate,
      quantity: receivedQuantity,
      sourceLineId: line.id,
      postingGroupId: postingKey,
      entryType: "inventory_receipt",
      postingDate: now
    })
  );

  return `Ghi nháº­n nháº­p ${receivedQuantity} cho ${purchaseOrder.documentNo}; cÃ²n ${line.orderedQuantity - line.receivedQuantity} chÆ°a nháº­n.`;
}

function postInventoryTransfer(state: OperationsState, now: string, options?: OperationOptions) {
  const sourceWarehouse = state.warehouses.find((item) => item.id === options?.sourceWarehouseId && item.status === "active");
  const destinationWarehouse = state.warehouses.find((item) => item.id === options?.destinationWarehouseId && item.status === "active");
  const product = state.productUnits.find((item) => item.id === options?.productUnitId && item.status === "active");
  const quantity = options?.quantity ?? Number.NaN;
  const reason = requireReason(options?.reason, "Chuyá»ƒn kho");
  if (!sourceWarehouse || !destinationWarehouse || !product) {
    throw new Error("Chuyá»ƒn kho cáº§n kho Ä‘i, kho Ä‘áº¿n vÃ  váº­t tÆ° há»£p lá»‡.");
  }
  if (sourceWarehouse.id === destinationWarehouse.id) {
    throw new Error("Kho Ä‘i vÃ  kho Ä‘áº¿n pháº£i khÃ¡c nhau.");
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Sá»‘ lÆ°á»£ng chuyá»ƒn kho pháº£i lá»›n hÆ¡n 0.");
  }
  if (stockBalance(state, sourceWarehouse.id, product.id) < quantity) {
    throw new Error("Tá»“n kho nguá»“n khÃ´ng Ä‘á»§ Ä‘á»ƒ chuyá»ƒn.");
  }

  const sequence = state.inventoryMovements.filter((item) => item.sourceDocument.startsWith("CK-")).length / 2 + 1;
  const sourceDocument = `CK-${String(Math.floor(sequence)).padStart(6, "0")}`;
  const transferOutId = nextId("im", state.inventoryMovements.length);
  const transferInId = nextId("im", state.inventoryMovements.length + 1);
  const unitCost = movingAverageCost(state, sourceWarehouse.id, product.id);
  state.inventoryMovements.push(
    {
      id: transferOutId,
      movementType: "transfer_out",
      sourceDocument,
      postingKey: `transfer-out-${sourceDocument}`,
      warehouseId: sourceWarehouse.id,
      productUnitId: product.id,
      quantity: -quantity,
      unitCost,
      postedAt: now,
      reason,
      relatedMovementId: transferInId
    },
    {
      id: transferInId,
      movementType: "transfer_in",
      sourceDocument,
      postingKey: `transfer-in-${sourceDocument}`,
      warehouseId: destinationWarehouse.id,
      productUnitId: product.id,
      quantity,
      unitCost,
      postedAt: now,
      reason,
      relatedMovementId: transferOutId
    }
  );
  return `Chuyá»ƒn ${quantity} ${product.unitName} ${product.productName} tá»« ${sourceWarehouse.name} sang ${destinationWarehouse.name}.`;
}

function postInventoryCountAdjustment(state: OperationsState, now: string, options?: OperationOptions) {
  const warehouse = state.warehouses.find((item) => item.id === options?.warehouseId && item.status === "active");
  const product = state.productUnits.find((item) => item.id === options?.productUnitId && item.status === "active");
  const countedQuantity = options?.countedQuantity ?? Number.NaN;
  const reason = requireReason(options?.reason, "Äiá»u chá»‰nh kiá»ƒm kÃª");
  if (!warehouse || !product) {
    throw new Error("Kiá»ƒm kÃª cáº§n kho vÃ  váº­t tÆ° há»£p lá»‡.");
  }
  if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
    throw new Error("Sá»‘ lÆ°á»£ng kiá»ƒm kÃª khÃ´ng Ä‘Æ°á»£c Ã¢m.");
  }
  const currentQuantity = stockBalance(state, warehouse.id, product.id);
  const difference = countedQuantity - currentQuantity;
  if (difference === 0) {
    throw new Error("Sá»‘ lÆ°á»£ng kiá»ƒm kÃª báº±ng tá»“n sá»•, khÃ´ng cáº§n táº¡o Ä‘iá»u chá»‰nh.");
  }
  const sequence = state.inventoryMovements.filter((item) => item.sourceDocument.startsWith("KK-")).length + 1;
  const sourceDocument = `KK-${String(sequence).padStart(6, "0")}`;
  state.inventoryMovements.push({
    id: nextId("im", state.inventoryMovements.length),
    movementType: "adjustment",
    sourceDocument,
    postingKey: `count-adjustment-${sourceDocument}`,
    warehouseId: warehouse.id,
    productUnitId: product.id,
    quantity: difference,
    unitCost: movingAverageCost(state, warehouse.id, product.id),
    postedAt: now,
    reason
  });
  return `Äiá»u chá»‰nh kiá»ƒm kÃª ${product.productName} táº¡i ${warehouse.name}: ${currentQuantity} â†’ ${countedQuantity}.`;
}

function reverseInventoryMovement(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  if (!targetId) {
    throw new Error("Chá»n phÃ¡t sinh kho cá»¥ thá»ƒ Ä‘á»ƒ Ä‘áº£o.");
  }
  const reason = requireReason(options?.reason, "Äáº£o phÃ¡t sinh kho");
  const movement = state.inventoryMovements.find((item) => item.id === targetId || item.postingKey === targetId);
  if (!movement) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y phÃ¡t sinh kho cáº§n Ä‘áº£o.");
  }
  if (movement.movementType === "opening") {
    throw new Error("Tá»“n Ä‘áº§u ká»³ khÃ´ng Ä‘Æ°á»£c Ä‘áº£o báº±ng thao tÃ¡c váº­n hÃ nh.");
  }
  if (movement.movementType === "reverse") {
    throw new Error("DÃ²ng Ä‘áº£o kho khÃ´ng Ä‘Æ°á»£c Ä‘áº£o tiáº¿p.");
  }
  if (movement.reversedById || state.inventoryMovements.some((item) => item.postingKey === `reverse-${movement.id}`)) {
    throw new Error("PhÃ¡t sinh kho nÃ y Ä‘Ã£ Ä‘Æ°á»£c Ä‘áº£o trÆ°á»›c Ä‘Ã³.");
  }
  if (movement.movementType === "transfer_out" || movement.movementType === "transfer_in") {
    return reverseInventoryTransfer(state, movement, now, reason);
  }

  const reverseQuantity = -movement.quantity;
  if (stockBalance(state, movement.warehouseId, movement.productUnitId) + reverseQuantity < 0) {
    throw new Error("Đảo phát sinh này sẽ làm âm tồn kho, cần nhập bù hoặc đảo chứng từ xuất liên quan trước.");
  }

  const reverseMovement: InventoryMovement = {
    id: nextId("im", state.inventoryMovements.length),
    movementType: "reverse",
    sourceDocument: reversalDocumentNo(movement.sourceDocument),
    postingKey: `reverse-${movement.id}`,
    warehouseId: movement.warehouseId,
    productUnitId: movement.productUnitId,
    quantity: reverseQuantity,
    unitCost: movement.unitCost,
    postedAt: now,
    sourceLineId: movement.sourceLineId,
    reason
  };

  if (movement.movementType === "receipt") {
    reverseReceiptFinancials(state, movement, reverseMovement.sourceDocument, now);
  }
  if (movement.movementType === "issue") {
    reverseIssueFinancials(state, movement, reverseMovement.sourceDocument, now);
  }

  state.inventoryMovements.push(reverseMovement);
  movement.reversedById = reverseMovement.id;

  return `Äáº£o phÃ¡t sinh kho ${movement.postingKey}; há»‡ thá»‘ng ghi movement ngÆ°á»£c chiá»u vÃ  bÃºt toÃ¡n cÃ´ng ná»£ liÃªn quan.`;
}

function reverseInventoryTransfer(state: OperationsState, movement: InventoryMovement, now: string, reason: string) {
  const related = movement.relatedMovementId
    ? state.inventoryMovements.find((item) => item.id === movement.relatedMovementId)
    : state.inventoryMovements.find((item) => item.sourceDocument === movement.sourceDocument && item.id !== movement.id &&
      (item.movementType === "transfer_out" || item.movementType === "transfer_in"));
  if (!related || related.reversedById) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y cáº·p phÃ¡t sinh chuyá»ƒn kho há»£p lá»‡ Ä‘á»ƒ Ä‘áº£o.");
  }
  const pair = [movement, related];
  for (const item of pair) {
    if (stockBalance(state, item.warehouseId, item.productUnitId) - item.quantity < 0) {
      throw new Error("Äáº£o chuyá»ƒn kho sáº½ lÃ m Ã¢m tá»“n táº¡i kho nháº­n; cáº§n xá»­ lÃ½ lÆ°á»£ng Ä‘Ã£ xuáº¥t tiáº¿p trÆ°á»›c.");
    }
  }

  const firstReverseId = nextId("im", state.inventoryMovements.length);
  const secondReverseId = nextId("im", state.inventoryMovements.length + 1);
  const reverseMovements: InventoryMovement[] = pair.map((item, index) => ({
    id: index === 0 ? firstReverseId : secondReverseId,
    movementType: "reverse",
    sourceDocument: reversalDocumentNo(item.sourceDocument),
    postingKey: `reverse-${item.id}`,
    warehouseId: item.warehouseId,
    productUnitId: item.productUnitId,
    quantity: -item.quantity,
    unitCost: item.unitCost,
    postedAt: now,
    reason,
    relatedMovementId: index === 0 ? secondReverseId : firstReverseId
  }));
  pair[0].reversedById = reverseMovements[0].id;
  pair[1].reversedById = reverseMovements[1].id;
  state.inventoryMovements.push(...reverseMovements);
  return `Äáº£o chá»©ng tá»« chuyá»ƒn kho ${movement.sourceDocument}; Ä‘Ã£ ghi Ä‘á»§ hai movement ngÆ°á»£c chiá»u.`;
}

function confirmDirectDelivery(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  const candidate = targetId ? findDirectDeliveryByPurchaseLineId(state, targetId) : findNextDirectDelivery(state);
  const purchaseOrder = candidate?.purchaseOrder;
  const purchaseLine = candidate?.purchaseLine;
  const salesOrder = candidate?.salesOrder;
  const salesLine = candidate?.salesLine;
  if (!purchaseOrder || !purchaseLine || !salesOrder || !salesLine) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y dÃ²ng giao tháº³ng cáº§n xÃ¡c nháº­n." : "KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u giao tháº³ng.");
  }
  if (purchaseOrder.status === "draft") {
    throw new Error("Cáº§n xÃ¡c nháº­n Ä‘Æ¡n mua trÆ°á»›c khi giao tháº³ng.");
  }
  if (purchaseLine.destinationType !== "customer_direct") {
    throw new Error("DÃ²ng mua nÃ y khÃ´ng pháº£i giao tháº³ng khÃ¡ch.");
  }
  if (purchaseLine.receivedQuantity >= purchaseLine.orderedQuantity) {
    throw new Error("Giao tháº³ng Ä‘Ã£ xÃ¡c nháº­n trÆ°á»›c Ä‘Ã³.");
  }
  if (state.inventoryMovements.some((movement) => movement.postingKey === `receipt-${purchaseLine.id}`)) {
    throw new Error("Giao tháº³ng khÃ´ng Ä‘Æ°á»£c táº¡o phÃ¡t sinh kho cá»­a hÃ ng.");
  }

  const purchaseRemaining = purchaseLine.orderedQuantity - purchaseLine.receivedQuantity;
  const salesRemaining = salesLine.quantity - salesLine.deliveredQuantity;
  const deliveredQuantity = options?.quantity ?? Math.min(purchaseRemaining, salesRemaining);
  if (!Number.isFinite(deliveredQuantity) || deliveredQuantity <= 0 || deliveredQuantity > purchaseRemaining || deliveredQuantity > salesRemaining) {
    throw new Error(`Sá»‘ lÆ°á»£ng giao tháº³ng pháº£i lá»›n hÆ¡n 0 vÃ  khÃ´ng vÆ°á»£t ${Math.min(purchaseRemaining, salesRemaining)}.`);
  }

  purchaseLine.receivedQuantity += deliveredQuantity;
  syncPurchaseOrderStatus(purchaseOrder);
  salesLine.deliveredQuantity += deliveredQuantity;
  syncSalesOrderDeliveryStatus(salesOrder);
  const postingSequence = state.supplierLedgerEntries.filter(
    (entry) => entry.entryType === "direct_delivery" && entry.sourceLineId === purchaseLine.id && entry.direction === "credit"
  ).length + 1;
  const postingGroupId = `direct-${purchaseLine.id}-${postingSequence}`;

  state.supplierLedgerEntries.push(
    createSupplierLedgerEntry(state, {
      supplierId: purchaseOrder.supplierId,
      sourceDocument: purchaseOrder.documentNo,
      direction: "credit",
      amount: purchaseLineGross(deliveredQuantity, purchaseLine.unitCost, purchaseLine.taxRate),
      netAmount: deliveredQuantity * purchaseLine.unitCost,
      taxAmount: deliveredQuantity * purchaseLine.unitCost * purchaseLine.taxRate,
      quantity: deliveredQuantity,
      sourceLineId: purchaseLine.id,
      postingGroupId,
      entryType: "direct_delivery",
      postingDate: now
    })
  );
  state.customerLedgerEntries.push(
    createCustomerLedgerEntry(state, {
      customerId: salesOrder.customerId,
      sourceDocument: `${salesOrder.documentNo}:GIAO-THANG`,
      direction: "debit",
      amount: lineTotals({
        quantity: deliveredQuantity,
        unitPrice: salesLine.unitPrice,
        taxRate: salesLine.taxRate
      }).gross,
      netAmount: deliveredQuantity * salesLine.unitPrice,
      taxAmount: deliveredQuantity * salesLine.unitPrice * salesLine.taxRate,
      quantity: deliveredQuantity,
      sourceLineId: salesLine.id,
      postingGroupId,
      entryType: "sale_delivery",
      postingDate: now
    })
  );

  return `XÃ¡c nháº­n giao tháº³ng ${deliveredQuantity}: khÃ´ng táº¡o nháº­p/xuáº¥t kho, Ä‘Ã£ ghi pháº£i thu vÃ  pháº£i tráº£.`;
}

function reverseDirectDelivery(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  if (!targetId) {
    throw new Error("Chá»n dÃ²ng mua giao tháº³ng cá»¥ thá»ƒ Ä‘á»ƒ Ä‘áº£o.");
  }
  const reason = requireReason(options?.reason, "Äáº£o giao tháº³ng");
  const candidate = findPurchaseLine(state, (_order, line) => line.id === targetId && line.destinationType === "customer_direct");
  const purchaseOrder = candidate?.purchaseOrder;
  const purchaseLine = candidate?.line;
  if (!purchaseOrder || !purchaseLine || !purchaseLine.salesOrderLineId || purchaseLine.receivedQuantity <= 0) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y láº§n giao tháº³ng Ä‘Ã£ ghi nháº­n Ä‘á»ƒ Ä‘áº£o.");
  }
  const salesOrder = state.salesOrders.find((order) => order.lines.some((line) => line.id === purchaseLine.salesOrderLineId));
  const salesLine = salesOrder?.lines.find((line) => line.id === purchaseLine.salesOrderLineId);
  if (!salesOrder || !salesLine) {
    throw new Error("DÃ²ng giao tháº³ng khÃ´ng cÃ²n liÃªn káº¿t Ä‘Æ¡n bÃ¡n há»£p lá»‡.");
  }
  const posting = [...state.supplierLedgerEntries].reverse().find((entry) =>
    entry.entryType === "direct_delivery" &&
    entry.sourceLineId === purchaseLine.id &&
    entry.direction === "credit" &&
    entry.postingGroupId &&
    !state.supplierLedgerEntries.some((reversal) =>
      reversal.postingGroupId === entry.postingGroupId && reversal.direction === "debit" && reversal.entryType === "reversal"
    )
  );
  const receivable = posting?.postingGroupId
    ? state.customerLedgerEntries.find((entry) => entry.postingGroupId === posting.postingGroupId && entry.direction === "debit")
    : undefined;
  const quantity = posting?.quantity ?? 0;
  if (!posting || !receivable || quantity <= 0) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y cáº·p bÃºt toÃ¡n giao tháº³ng cÃ³ thá»ƒ Ä‘áº£o.");
  }
  if (customerAllocatedAmountForLedgerEntry(state, receivable.id) > 0) {
    throw new Error("Cần đảo hoặc bỏ phân bổ phiếu thu trước khi đảo giao thẳng.");
  }
  if (supplierAllocatedAmountForLedgerEntry(state, posting.id) > 0) {
    throw new Error("Cáº§n Ä‘áº£o phiáº¿u chi nhÃ  cung cáº¥p liÃªn quan trÆ°á»›c khi Ä‘áº£o giao tháº³ng.");
  }
  if (purchaseLine.receivedQuantity < quantity || salesLine.deliveredQuantity < quantity) {
    throw new Error("Sá»‘ lÆ°á»£ng giao tháº³ng hiá»‡n táº¡i khÃ´ng Ä‘á»§ Ä‘á»ƒ Ä‘áº£o láº§n ghi nháº­n nÃ y.");
  }

  purchaseLine.receivedQuantity -= quantity;
  salesLine.deliveredQuantity -= quantity;
  syncPurchaseOrderStatus(purchaseOrder);
  syncSalesOrderDeliveryStatus(salesOrder);
  state.supplierLedgerEntries.push(createSupplierLedgerEntry(state, {
    supplierId: purchaseOrder.supplierId,
    sourceDocument: `${reversalDocumentNo(purchaseOrder.documentNo)}:${purchaseLine.id}`,
    direction: "debit",
    amount: posting.amount,
    netAmount: posting.netAmount,
    taxAmount: posting.taxAmount,
    quantity,
    sourceLineId: purchaseLine.id,
    postingGroupId: posting.postingGroupId,
    entryType: "reversal",
    postingDate: now
  }));
  state.customerLedgerEntries.push(createCustomerLedgerEntry(state, {
    customerId: salesOrder.customerId,
    sourceDocument: `${reversalDocumentNo(salesOrder.documentNo)}:${salesLine.id}`,
    direction: "credit",
    amount: receivable.amount,
    netAmount: receivable.netAmount,
    taxAmount: receivable.taxAmount,
    quantity,
    sourceLineId: salesLine.id,
    postingGroupId: posting.postingGroupId,
    entryType: "reversal",
    postingDate: now
  }));

  return `Äáº£o láº§n giao tháº³ng ${posting.postingGroupId}; giáº£m ${quantity} vÃ  ghi hai bÃºt toÃ¡n ngÆ°á»£c vá»›i lÃ½ do: ${reason}.`;
}

function startDeliveryLoading(state: OperationsState, targetId?: string) {
  const candidate = findNextDeliveryByStatus(state, ["assigned"], targetId);
  if (!candidate) {
    throw new Error(targetId ? "Chuyáº¿n giao nÃ y khÃ´ng á»Ÿ tráº¡ng thÃ¡i chá» bá»‘c hÃ ng." : "KhÃ´ng cÃ²n chuyáº¿n giao nÃ o chá» bá»‘c hÃ ng.");
  }

  candidate.job.status = "loading";
  candidate.job.evidence = "Äang bá»‘c hÃ ng, chá» tÃ i xáº¿ xÃ¡c nháº­n xuáº¥t báº¿n.";

  return `Báº¯t Ä‘áº§u bá»‘c hÃ ng chuyáº¿n ${candidate.job.documentNo}; chÆ°a ghi xuáº¥t kho hoáº·c cÃ´ng ná»£.`;
}

function dispatchDelivery(state: OperationsState, targetId?: string) {
  const candidate = findNextDeliveryByStatus(state, ["loading"], targetId);
  if (!candidate) {
    throw new Error(targetId ? "Chuyáº¿n giao nÃ y chÆ°a á»Ÿ tráº¡ng thÃ¡i Ä‘ang bá»‘c hÃ ng." : "KhÃ´ng cÃ²n chuyáº¿n giao nÃ o Ä‘ang bá»‘c hÃ ng.");
  }

  candidate.job.status = "in_transit";
  candidate.job.evidence = "ÄÃ£ xuáº¥t báº¿n, Ä‘ang giao cho khÃ¡ch.";

  return `Xuáº¥t báº¿n chuyáº¿n ${candidate.job.documentNo}; chá» xÃ¡c nháº­n giao thÃ nh cÃ´ng trÆ°á»›c khi ghi xuáº¥t kho.`;
}

function submitDeliveryCompletion(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  assertWorkerSubmissionActor(actor);
  const worker = findWorkerEmployee(state, actor);
  const candidate = findNextDeliveryCompletion(state, targetId);
  if (!worker || !candidate || (candidate.job.driverId !== worker.id && !candidate.job.helperIds.includes(worker.id))) {
    throw new Error("Tho khong duoc gui xac nhan cho chuyen giao khong duoc phan cong.");
  }
  if (findPendingApprovalRequest(state, "delivery_completion", candidate.job.id)) {
    throw new Error("Chuyen giao nay dang cho Chu cua hang hoac Ke toan duyet.");
  }

  const recipientName = options?.recipientName?.trim();
  const evidence = options?.evidence?.trim();
  if (!recipientName || !evidence) {
    throw new Error("Gui xac nhan giao can ten nguoi nhan va bang chung giao nhan.");
  }
  const attachments = options?.attachments ?? [];
  validateDeliveryCompletionAttachments(attachments, actor);

  const lineQuantities: Record<string, number> = {};
  for (const line of candidate.order.lines.filter((item) => item.sourceType === "warehouse")) {
    const remainingQuantity = line.quantity - line.deliveredQuantity;
    const quantity = options?.lineQuantities
      ? (options.lineQuantities[line.id] ?? 0)
      : remainingQuantity;
    if (quantity <= 0) {
      continue;
    }
    if (!Number.isFinite(quantity) || quantity > remainingQuantity) {
      throw new Error(`So luong giao cua dong ${line.id} khong hop le.`);
    }
    lineQuantities[line.id] = quantity;
  }
  if (Object.keys(lineQuantities).length === 0) {
    throw new Error("Nhap it nhat mot so luong thuc giao lon hon 0.");
  }

  state.approvalRequests.push({
    id: nextId("approval", state.approvalRequests.length),
    documentNo: `APR-GH-${String(state.approvalRequests.length + 1).padStart(6, "0")}`,
    type: "delivery_completion",
    targetId: candidate.job.id,
    status: "pending",
    lineQuantities,
    recipientName,
    evidence,
    attachments,
    submittedBy: actor.id,
    submittedByName: actor.displayName,
    submittedAt: now
  });
  return `Da gui xac nhan giao ${candidate.job.documentNo}; cho Chu cua hang hoac Ke toan duyet.`;
}

function approveDeliveryCompletion(state: OperationsState, now: string, targetId: string | undefined, actor: OperationsActor) {
  assertApprovalActor(actor);
  const request = findApprovalRequest(state, "delivery_completion", targetId);
  if (!request || request.status !== "pending" || !request.lineQuantities || !request.recipientName || !request.evidence || !request.attachments?.length) {
    throw new Error("Khong tim thay xac nhan giao dang cho duyet.");
  }
  completeDelivery(state, now, request.targetId, {
    lineQuantities: request.lineQuantities,
    recipientName: request.recipientName,
    evidence: request.evidence,
    attachments: request.attachments
  }, true);
  request.status = "approved";
  request.approvedBy = actor.id;
  request.approvedByName = actor.displayName;
  request.approvedAt = now;
  return `Da duyet va ghi nhan giao hang ${request.documentNo}.`;
}

function rejectDeliveryCompletion(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  assertApprovalActor(actor);
  const request = findApprovalRequest(state, "delivery_completion", targetId);
  const reason = requireReason(options?.reason, "Tu choi xac nhan giao");
  if (!request || request.status !== "pending") {
    throw new Error("Khong tim thay xac nhan giao dang cho duyet.");
  }
  request.status = "rejected";
  request.rejectionReason = reason;
  request.approvedBy = actor.id;
  request.approvedByName = actor.displayName;
  request.approvedAt = now;
  return `Da tu choi xac nhan giao ${request.documentNo}; ly do: ${reason}.`;
}

function completeDelivery(
  state: OperationsState,
  now: string,
  targetId?: string,
  options?: OperationOptions,
  bypassApproval = false
) {
  const candidate = findNextDeliveryCompletion(state, targetId);
  const order = candidate?.order;
  const job = candidate?.job;
  if (!bypassApproval && job && findPendingApprovalRequest(state, "delivery_completion", job.id)) {
    throw new Error("Chuyen giao nay dang cho Chu cua hang hoac Ke toan duyet.");
  }
  if (!order || !job) {
    throw new Error("Cần xuất bến chuyến giao trước khi hoàn tất giao hàng.");
  }
  if (order.status !== "allocated" && order.status !== "partially_delivered") {
    throw new Error("Chá»‰ hoÃ n táº¥t giao sau khi Ä‘Æ¡n Ä‘Ã£ phÃ¢n bá»• nguá»“n.");
  }
  if (job.status !== "in_transit") {
    throw new Error("Chá»‰ hoÃ n táº¥t giao sau khi chuyáº¿n Ä‘Ã£ xuáº¥t báº¿n.");
  }
  const recipientName = options?.recipientName?.trim();
  const evidence = options?.evidence?.trim();
  if (!recipientName || !evidence) {
    throw new Error("HoÃ n táº¥t giao cáº§n tÃªn ngÆ°á»i nháº­n vÃ  báº±ng chá»©ng giao nháº­n.");
  }

  const warehouseLines = order.lines.filter((line) => line.sourceType === "warehouse");
  const deliveryLines = warehouseLines
    .map((line) => ({
      line,
      quantity: options?.lineQuantities
        ? (options.lineQuantities[line.id] ?? 0)
        : line.quantity - line.deliveredQuantity
    }))
    .filter(({ quantity }) => quantity > 0);
  if (deliveryLines.length === 0) {
    throw new Error("Nháº­p Ã­t nháº¥t má»™t sá»‘ lÆ°á»£ng thá»±c giao lá»›n hÆ¡n 0.");
  }
  for (const { line, quantity } of deliveryLines) {
    if (!line.warehouseId) {
      throw new Error("DÃ²ng xuáº¥t kho thiáº¿u kho nguá»“n.");
    }
    const remainingQuantity = line.quantity - line.deliveredQuantity;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > remainingQuantity) {
      throw new Error(`Sá»‘ lÆ°á»£ng giao cá»§a dÃ²ng ${line.id} pháº£i lá»›n hÆ¡n 0 vÃ  khÃ´ng vÆ°á»£t ${remainingQuantity}.`);
    }
    const available = stockBalance(state, line.warehouseId, line.productUnitId);
    if (available < quantity) {
      throw new Error("KhÃ´ng Ä‘á»§ tá»“n kháº£ dá»¥ng Ä‘á»ƒ giao hÃ ng.");
    }
  }

  for (const { line, quantity } of deliveryLines) {
    const postingKey = nextPostingKey(state, `issue-${order.documentNo}-${line.id}`);
    assertNoInventoryPosting(state, postingKey);
    state.inventoryMovements.push({
      id: nextId("im", state.inventoryMovements.length),
      movementType: "issue",
      sourceDocument: order.documentNo,
      postingKey,
      sourceLineId: line.id,
      warehouseId: line.warehouseId ?? "wh-main",
      productUnitId: line.productUnitId,
      quantity: -quantity,
      unitCost: movingAverageCost(state, line.warehouseId ?? "wh-main", line.productUnitId),
      postedAt: now
    });
    line.deliveredQuantity += quantity;
    state.customerLedgerEntries.push(
      createCustomerLedgerEntry(state, {
        customerId: order.customerId,
        sourceDocument: `${order.documentNo}:GIAO-KHO`,
        direction: "debit",
        amount: lineTotals({ quantity, unitPrice: line.unitPrice, taxRate: line.taxRate }).gross,
        netAmount: quantity * line.unitPrice,
        taxAmount: quantity * line.unitPrice * line.taxRate,
        quantity,
        sourceLineId: line.id,
        postingGroupId: postingKey,
        entryType: "sale_delivery",
        postingDate: now
      })
    );
  }

  job.status = "delivered";
  job.evidence = evidence;
  job.recipientName = recipientName;
  if (options?.attachments?.length) {
    job.completionAttachments = options.attachments;
  }
  job.confirmedAt = now;
  order.status = order.lines.every((line) => line.deliveredQuantity >= line.quantity) ? "delivered" : "partially_delivered";
  order.version += 1;

  return `HoÃ n táº¥t chuyáº¿n ${job.documentNo}; xuáº¥t kho append-only vÃ  ghi pháº£i thu pháº§n giao tá»« kho.`;
}

function failDelivery(state: OperationsState, targetId?: string, options?: OperationOptions) {
  const candidate = findNextDeliveryByStatus(state, ["assigned", "loading", "in_transit"], targetId);
  if (!candidate) {
    throw new Error(targetId ? "Chuyáº¿n giao nÃ y khÃ´ng thá»ƒ bÃ¡o tháº¥t báº¡i." : "KhÃ´ng cÃ²n chuyáº¿n giao nÃ o cÃ³ thá»ƒ bÃ¡o tháº¥t báº¡i.");
  }

  const reason = requireReason(options?.reason, "BÃ¡o giao tháº¥t báº¡i");
  candidate.job.status = "failed";
  candidate.job.failureReason = reason;
  candidate.job.evidence = reason;

  return `BÃ¡o tháº¥t báº¡i chuyáº¿n ${candidate.job.documentNo}; khÃ´ng ghi xuáº¥t kho, khÃ´ng ghi cÃ´ng ná»£.`;
}


function confirmCustomerPayment(state: OperationsState, now: string, targetId?: string) {
  const payment = targetId ? state.customerPayments.find((item) => item.id === targetId) : findNextCustomerPaymentConfirmation(state);
  if (!payment) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y phiáº¿u thu cáº§n xÃ¡c nháº­n." : "KhÃ´ng tÃ¬m tháº¥y phiáº¿u thu.");
  }
  if (payment.status !== "draft") {
    throw new Error("Phiáº¿u thu Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c nháº­n.");
  }

  payment.status = "confirmed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiá»n máº·t cá»­a hÃ ng",
    sourceDocument: payment.documentNo,
    direction: "in",
    amount: payment.amount,
    postedAt: now
  });
  state.customerLedgerEntries.push(
    createCustomerLedgerEntry(state, {
      customerId: payment.customerId,
      sourceDocument: payment.documentNo,
      direction: "credit",
      amount: payment.amount,
      entryType: "customer_payment",
      postingDate: now
    })
  );

  return `XÃ¡c nháº­n phiáº¿u thu ${payment.documentNo}; ghi tÄƒng quá»¹ vÃ  giáº£m cÃ´ng ná»£ pháº£i thu.`;
}

function allocateCustomerPayment(state: OperationsState, targetId?: string, options?: OperationOptions) {
  const payment = targetId
    ? state.customerPayments.find((item) => item.id === targetId)
    : state.customerPayments.find((item) => ["confirmed", "partially_allocated"].includes(item.status) && paymentAllocatedAmount(item) < item.amount);
  if (!payment) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y phiáº¿u thu cáº§n phÃ¢n bá»•." : "KhÃ´ng tÃ¬m tháº¥y phiáº¿u thu.");
  }
  if (payment.status === "draft") {
    throw new Error("Pháº£i xÃ¡c nháº­n phiáº¿u thu trÆ°á»›c khi phÃ¢n bá»•.");
  }
  if (payment.status === "reversed") {
    throw new Error("Phiáº¿u thu Ä‘Ã£ Ä‘áº£o, khÃ´ng Ä‘Æ°á»£c phÃ¢n bá»• tiáº¿p.");
  }
  if (payment.status === "allocated") {
    throw new Error("Phiáº¿u thu Ä‘Ã£ Ä‘Æ°á»£c phÃ¢n bá»• háº¿t.");
  }

  const beforeAllocated = paymentAllocatedAmount(payment);
  const plan = createAllocationPlan({
    remainingPayment: payment.amount - beforeAllocated,
    obligations: getOpenCustomerDebtObligations(state, payment.customerId),
    requested: options?.allocations,
    invalidTargetMessage: "Dòng phân bổ phải là nghĩa vụ phải thu còn mở của đúng khách hàng."
  });
  payment.allocations.push(...plan);

  const totalAllocated = paymentAllocatedAmount(payment);
  payment.status = amountsEqual(totalAllocated, payment.amount) ? "allocated" : "partially_allocated";
  return `PhÃ¢n bá»• thÃªm ${formatAmount(totalAllocated - beforeAllocated)} tá»« ${payment.documentNo} vÃ o ${plan.length} nghÄ©a vá»¥; cÃ²n ${formatAmount(payment.amount - totalAllocated)} chÆ°a phÃ¢n bá»•.`;
}

function reverseCustomerPayment(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  if (!targetId) {
    throw new Error("Chá»n phiáº¿u thu cá»¥ thá»ƒ Ä‘á»ƒ Ä‘áº£o.");
  }
  requireReason(options?.reason, "Äáº£o phiáº¿u thu");
  const payment = state.customerPayments.find((item) => item.id === targetId);
  if (!payment) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y phiáº¿u thu cáº§n Ä‘áº£o.");
  }
  if (!["confirmed", "partially_allocated", "allocated"].includes(payment.status)) {
    throw new Error("Chá»‰ phiáº¿u thu Ä‘Ã£ xÃ¡c nháº­n hoáº·c Ä‘Ã£ phÃ¢n bá»• má»›i Ä‘Æ°á»£c Ä‘áº£o.");
  }

  const sourceDocument = reversalDocumentNo(payment.documentNo);
  payment.status = "reversed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiá»n máº·t cá»­a hÃ ng",
    sourceDocument,
    direction: "out",
    amount: payment.amount,
    postedAt: now
  });
  state.customerLedgerEntries.push(
    createCustomerLedgerEntry(state, {
      customerId: payment.customerId,
      sourceDocument,
      direction: "debit",
      amount: payment.amount,
      entryType: "reversal",
      postingDate: now
    })
  );

  return `Äáº£o phiáº¿u thu ${payment.documentNo}; ghi giáº£m quá»¹ vÃ  má»Ÿ láº¡i cÃ´ng ná»£ báº±ng bÃºt toÃ¡n ngÆ°á»£c.`;
}

function confirmSupplierPayment(state: OperationsState, now: string, targetId?: string) {
  const payment = targetId ? state.supplierPayments.find((item) => item.id === targetId) : findNextSupplierPaymentConfirmation(state);
  if (!payment) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y phiáº¿u chi nhÃ  cung cáº¥p cáº§n xÃ¡c nháº­n." : "KhÃ´ng tÃ¬m tháº¥y phiáº¿u chi nhÃ  cung cáº¥p.");
  }
  if (payment.status !== "draft") {
    throw new Error("Phiáº¿u chi nhÃ  cung cáº¥p Ä‘Ã£ xÃ¡c nháº­n.");
  }
  if (supplierBalance(state.supplierLedgerEntries, payment.supplierId) < payment.amount) {
    throw new Error("Sá»‘ tiá»n chi vÆ°á»£t pháº£i tráº£ nhÃ  cung cáº¥p hiá»‡n táº¡i.");
  }
  if (cashBalance(state) < payment.amount) {
    throw new Error("Quỹ tiền mặt không đủ để thanh toán nhà cung cấp.");
  }

  payment.status = "confirmed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiá»n máº·t cá»­a hÃ ng",
    sourceDocument: payment.documentNo,
    direction: "out",
    amount: payment.amount,
    postedAt: now
  });
  state.supplierLedgerEntries.push(
    createSupplierLedgerEntry(state, {
      supplierId: payment.supplierId,
      sourceDocument: payment.documentNo,
      direction: "debit",
      amount: payment.amount,
      entryType: "supplier_payment",
      postingDate: now
    })
  );

  return `XÃ¡c nháº­n phiáº¿u chi ${payment.documentNo}; giáº£m pháº£i tráº£ nhÃ  cung cáº¥p.`;
}

function allocateSupplierPayment(state: OperationsState, targetId?: string, options?: OperationOptions) {
  const payment = targetId
    ? state.supplierPayments.find((item) => item.id === targetId)
    : state.supplierPayments.find((item) => ["confirmed", "partially_allocated"].includes(item.status) && paymentAllocatedAmount(item) < item.amount);
  if (!payment) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y phiáº¿u chi nhÃ  cung cáº¥p cáº§n phÃ¢n bá»•." : "KhÃ´ng tÃ¬m tháº¥y phiáº¿u chi nhÃ  cung cáº¥p.");
  }
  if (payment.status === "draft") {
    throw new Error("Pháº£i xÃ¡c nháº­n phiáº¿u chi trÆ°á»›c khi phÃ¢n bá»•.");
  }
  if (payment.status === "reversed") {
    throw new Error("Phiáº¿u chi Ä‘Ã£ Ä‘áº£o, khÃ´ng Ä‘Æ°á»£c phÃ¢n bá»• tiáº¿p.");
  }
  if (payment.status === "allocated") {
    throw new Error("Phiáº¿u chi Ä‘Ã£ Ä‘Æ°á»£c phÃ¢n bá»• háº¿t.");
  }

  const beforeAllocated = paymentAllocatedAmount(payment);
  const plan = createAllocationPlan({
    remainingPayment: payment.amount - beforeAllocated,
    obligations: getOpenSupplierDebtObligations(state, payment.supplierId),
    requested: options?.allocations,
    invalidTargetMessage: "DÃ²ng phÃ¢n bá»• pháº£i lÃ  nghÄ©a vá»¥ pháº£i tráº£ cÃ²n má»Ÿ cá»§a Ä‘Ãºng nhÃ  cung cáº¥p."
  });
  payment.allocations.push(...plan);

  const totalAllocated = paymentAllocatedAmount(payment);
  payment.status = amountsEqual(totalAllocated, payment.amount) ? "allocated" : "partially_allocated";
  return `PhÃ¢n bá»• thÃªm ${formatAmount(totalAllocated - beforeAllocated)} tá»« ${payment.documentNo} vÃ o ${plan.length} nghÄ©a vá»¥; cÃ²n ${formatAmount(payment.amount - totalAllocated)} chÆ°a phÃ¢n bá»•.`;
}

function reverseSupplierPayment(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  if (!targetId) {
    throw new Error("Chá»n phiáº¿u chi nhÃ  cung cáº¥p cá»¥ thá»ƒ Ä‘á»ƒ Ä‘áº£o.");
  }
  requireReason(options?.reason, "Äáº£o phiáº¿u chi nhÃ  cung cáº¥p");
  const payment = state.supplierPayments.find((item) => item.id === targetId);
  if (!payment) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y phiáº¿u chi nhÃ  cung cáº¥p cáº§n Ä‘áº£o.");
  }
  if (!["confirmed", "partially_allocated", "allocated"].includes(payment.status)) {
    throw new Error("Chá»‰ phiáº¿u chi nhÃ  cung cáº¥p Ä‘Ã£ xÃ¡c nháº­n hoáº·c Ä‘Ã£ phÃ¢n bá»• má»›i Ä‘Æ°á»£c Ä‘áº£o.");
  }

  const sourceDocument = reversalDocumentNo(payment.documentNo);
  payment.status = "reversed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiá»n máº·t cá»­a hÃ ng",
    sourceDocument,
    direction: "in",
    amount: payment.amount,
    postedAt: now
  });
  state.supplierLedgerEntries.push(
    createSupplierLedgerEntry(state, {
      supplierId: payment.supplierId,
      sourceDocument,
      direction: "credit",
      amount: payment.amount,
      entryType: "reversal",
      postingDate: now
    })
  );

  return `Äáº£o phiáº¿u chi ${payment.documentNo}; ghi tÄƒng láº¡i quá»¹ vÃ  pháº£i tráº£ nhÃ  cung cáº¥p.`;
}

function confirmCashVoucher(state: OperationsState, now: string, targetId?: string) {
  const voucher = targetId
    ? state.cashVouchers.find((item) => item.id === targetId)
    : state.cashVouchers.find((item) => item.status === "draft");
  if (!voucher) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y phiáº¿u quá»¹ cáº§n xÃ¡c nháº­n." : "KhÃ´ng cÃ²n phiáº¿u quá»¹ nhÃ¡p.");
  }
  if (voucher.status !== "draft") {
    throw new Error("Chá»‰ phiáº¿u quá»¹ nhÃ¡p má»›i Ä‘Æ°á»£c xÃ¡c nháº­n.");
  }
  if (voucher.direction === "out" && cashBalance(state) < voucher.amount) {
    throw new Error("Tá»“n quá»¹ khÃ´ng Ä‘á»§ Ä‘á»ƒ xÃ¡c nháº­n phiáº¿u chi nÃ y.");
  }

  voucher.status = "confirmed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: voucher.accountName,
    sourceDocument: voucher.documentNo,
    direction: voucher.direction,
    amount: voucher.amount,
    postedAt: now
  });

  return `XÃ¡c nháº­n ${voucher.documentNo}; Ä‘Ã£ ghi ${voucher.direction === "in" ? "tÄƒng" : "giáº£m"} sá»• quá»¹.`;
}

function reverseCashVoucher(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  if (!targetId) {
    throw new Error("Chá»n phiáº¿u quá»¹ cá»¥ thá»ƒ Ä‘á»ƒ Ä‘áº£o.");
  }
  const voucher = state.cashVouchers.find((item) => item.id === targetId);
  if (!voucher) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y phiáº¿u quá»¹ cáº§n Ä‘áº£o.");
  }
  if (voucher.status !== "confirmed") {
    throw new Error("Chá»‰ phiáº¿u quá»¹ Ä‘Ã£ xÃ¡c nháº­n má»›i Ä‘Æ°á»£c Ä‘áº£o.");
  }
  const reason = requireReason(options?.reason, "Äáº£o phiáº¿u quá»¹");
  if (voucher.direction === "in" && cashBalance(state) < voucher.amount) {
    throw new Error("Tá»“n quá»¹ khÃ´ng Ä‘á»§ Ä‘á»ƒ Ä‘áº£o phiáº¿u thu nÃ y.");
  }

  voucher.status = "reversed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: voucher.accountName,
    sourceDocument: reversalDocumentNo(voucher.documentNo),
    direction: voucher.direction === "in" ? "out" : "in",
    amount: voucher.amount,
    postedAt: now
  });

  return `Äáº£o ${voucher.documentNo}; Ä‘Ã£ ghi bÃºt toÃ¡n quá»¹ ngÆ°á»£c chiá»u vá»›i lÃ½ do: ${reason}.`;
}

function approveWorkOutput(state: OperationsState, targetId?: string) {
  const workOrder = targetId ? state.workOrders.find((item) => item.id === targetId) : state.workOrders.find((item) => item.status === "submitted");
  if (!workOrder) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y phiáº¿u cÃ´ng cáº§n duyá»‡t." : "KhÃ´ng tÃ¬m tháº¥y phiáº¿u cÃ´ng viá»‡c.");
  }
  if (workOrder.status !== "submitted") {
    throw new Error("Chá»‰ duyá»‡t sáº£n lÆ°á»£ng Ä‘ang chá» duyá»‡t.");
  }

  for (const output of workOrder.outputs) {
    output.approvedQuantity = output.actualQuantity;
    output.status = "approved";
  }
  workOrder.status = "approved";

  return `Duyá»‡t sáº£n lÆ°á»£ng ${workOrder.documentNo}; output Ä‘Æ°á»£c khÃ³a trÆ°á»›c khi tÃ­nh cÃ´ng.`;
}

function postCompensation(state: OperationsState, now: string, targetId?: string) {
  const workOrder = targetId
    ? state.workOrders.find((item) => item.id === targetId)
    : state.workOrders.find((item) => item.status === "approved") ?? state.workOrders.find((item) => item.status === "submitted");
  const batch = workOrder
    ? state.compensationBatches.find((item) => item.workOrderId === workOrder.id && item.status === "draft" && item.lines.length === 0)
    : undefined;
  if (!workOrder || !batch) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y phiáº¿u cÃ´ng hoáº·c báº£ng cÃ´ng.");
  }
  if (workOrder.status !== "approved") {
    throw new Error("Chỉ tính công sau khi sản lượng được duyệt.");
  }
  if (batch.status !== "draft" || batch.lines.length > 0) {
    throw new Error("Báº£ng cÃ´ng Ä‘Ã£ Ä‘Æ°á»£c ghi nháº­n.");
  }

  const output = workOrder.outputs[0];
  if (!output || output.status !== "approved") {
    throw new Error("Output chÆ°a Ä‘Æ°á»£c duyá»‡t.");
  }
  const totalShare = workOrder.participants.reduce((sum, participant) => sum + participant.shareFactor, 0);
  if (totalShare <= 0) {
    throw new Error("Tá»•ng há»‡ sá»‘ chia cÃ´ng pháº£i lá»›n hÆ¡n 0.");
  }

  let remaining = batch.totalAmount;
  workOrder.participants.forEach((participant, index) => {
    const isLast = index === workOrder.participants.length - 1;
    const amount = isLast ? remaining : Math.round((batch.totalAmount * participant.shareFactor) / totalShare);
    remaining -= amount;
    batch.lines.push({
      workOutputId: output.id,
      employeeId: participant.employeeId,
      amount
    });
    state.employeeLedgerEntries.push(
      createEmployeeLedgerEntry(state, {
        employeeId: participant.employeeId,
        sourceDocument: batch.documentNo,
        direction: "credit",
        amount,
        entryType: "compensation",
        postingDate: now
      })
    );
  });

  const lineSum = batch.lines.reduce((sum, line) => sum + line.amount, 0);
  if (lineSum !== batch.totalAmount) {
    throw new Error("Tá»•ng tiá»n chia cho thÃ nh viÃªn pháº£i báº±ng tá»•ng tiá»n cÃ´ng cá»§a phiáº¿u.");
  }

  output.status = "compensated";
  workOrder.status = "compensated";
  batch.status = "posted";

  return `Ghi nháº­n báº£ng cÃ´ng ${batch.documentNo}; ${batch.lines.length} nhÃ¢n sá»± Ä‘Æ°á»£c ghi vÃ o sá»• tiá»n cÃ´ng.`;
}

function payEmployee(state: OperationsState, now: string, targetId?: string) {
  const payment = targetId ? state.employeePayments.find((item) => item.id === targetId) : findNextEmployeePaymentConfirmation(state);
  if (!payment) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y phiáº¿u thanh toÃ¡n nhÃ¢n viÃªn cáº§n xÃ¡c nháº­n." : "KhÃ´ng tÃ¬m tháº¥y phiáº¿u thanh toÃ¡n nhÃ¢n viÃªn.");
  }
  if (payment.status !== "draft") {
    throw new Error("Phiáº¿u thanh toÃ¡n nhÃ¢n viÃªn Ä‘Ã£ xÃ¡c nháº­n.");
  }
  const employeeBalance = employeePayableBalance(state, payment.employeeId);
  if (employeeBalance < payment.amount) {
    throw new Error("Sá»‘ tiá»n thanh toÃ¡n vÆ°á»£t cÃ´ng cÃ²n pháº£i tráº£ nhÃ¢n viÃªn.");
  }
  if (cashBalance(state) < payment.amount) {
    throw new Error("Quá»¹ tiá»n máº·t khÃ´ng Ä‘á»§ Ä‘á»ƒ thanh toÃ¡n nhÃ¢n viÃªn.");
  }

  payment.status = "confirmed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiá»n máº·t cá»­a hÃ ng",
    sourceDocument: payment.documentNo,
    direction: "out",
    amount: payment.amount,
    postedAt: now
  });
  state.employeeLedgerEntries.push(
    createEmployeeLedgerEntry(state, {
      employeeId: payment.employeeId,
      sourceDocument: payment.documentNo,
      direction: "debit",
      amount: payment.amount,
      entryType: "payment",
      postingDate: now
    })
  );

  return `Thanh toÃ¡n nhÃ¢n viÃªn ${payment.documentNo}; ghi giáº£m quá»¹ vÃ  giáº£m cÃ´ng ná»£ nhÃ¢n viÃªn.`;
}

function reverseEmployeePayment(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  if (!targetId) {
    throw new Error("Chá»n phiáº¿u thanh toÃ¡n nhÃ¢n viÃªn cá»¥ thá»ƒ Ä‘á»ƒ Ä‘áº£o.");
  }
  requireReason(options?.reason, "Äáº£o thanh toÃ¡n nhÃ¢n viÃªn");
  const payment = state.employeePayments.find((item) => item.id === targetId);
  if (!payment) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y phiáº¿u thanh toÃ¡n nhÃ¢n viÃªn cáº§n Ä‘áº£o.");
  }
  if (payment.status !== "confirmed") {
    throw new Error("Chá»‰ phiáº¿u thanh toÃ¡n nhÃ¢n viÃªn Ä‘Ã£ xÃ¡c nháº­n má»›i Ä‘Æ°á»£c Ä‘áº£o.");
  }

  const sourceDocument = reversalDocumentNo(payment.documentNo);
  payment.status = "reversed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiá»n máº·t cá»­a hÃ ng",
    sourceDocument,
    direction: "in",
    amount: payment.amount,
    postedAt: now
  });
  state.employeeLedgerEntries.push(
    createEmployeeLedgerEntry(state, {
      employeeId: payment.employeeId,
      sourceDocument,
      direction: "credit",
      amount: payment.amount,
      entryType: "reversal",
      postingDate: now
    })
  );

  return `Äáº£o phiáº¿u thanh toÃ¡n ${payment.documentNo}; ghi tÄƒng láº¡i quá»¹ vÃ  cÃ´ng cÃ²n pháº£i tráº£ nhÃ¢n viÃªn.`;
}

function confirmEmployeeAdvance(state: OperationsState, now: string, targetId?: string) {
  const advance = targetId
    ? state.employeeAdvances.find((item) => item.id === targetId)
    : state.employeeAdvances.find((item) => item.status === "draft");
  if (!advance) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y phiáº¿u táº¡m á»©ng cáº§n xÃ¡c nháº­n." : "KhÃ´ng cÃ²n phiáº¿u táº¡m á»©ng nhÃ¡p.");
  }
  if (advance.status !== "draft") {
    throw new Error("Chá»‰ phiáº¿u táº¡m á»©ng nhÃ¡p má»›i Ä‘Æ°á»£c xÃ¡c nháº­n.");
  }
  if (cashBalance(state) < advance.amount) {
    throw new Error("Quỹ tiền mặt không đủ để tạm ứng nhân viên.");
  }

  advance.status = "confirmed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiá»n máº·t cá»­a hÃ ng",
    sourceDocument: advance.documentNo,
    direction: "out",
    amount: advance.amount,
    postedAt: now
  });
  state.employeeLedgerEntries.push(createEmployeeLedgerEntry(state, {
    employeeId: advance.employeeId,
    sourceDocument: advance.documentNo,
    direction: "debit",
    amount: advance.amount,
    entryType: "advance",
    postingDate: now
  }));

  return `XÃ¡c nháº­n ${advance.documentNo}; giáº£m quá»¹ vÃ  ghi táº¡m á»©ng vÃ o sá»• nhÃ¢n viÃªn.`;
}

function reverseEmployeeAdvance(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  if (!targetId) {
    throw new Error("Chá»n phiáº¿u táº¡m á»©ng cá»¥ thá»ƒ Ä‘á»ƒ Ä‘áº£o.");
  }
  const reason = requireReason(options?.reason, "Äáº£o táº¡m á»©ng nhÃ¢n viÃªn");
  const advance = state.employeeAdvances.find((item) => item.id === targetId);
  if (!advance) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y phiáº¿u táº¡m á»©ng cáº§n Ä‘áº£o.");
  }
  if (advance.status !== "confirmed") {
    throw new Error("Chá»‰ phiáº¿u táº¡m á»©ng Ä‘Ã£ xÃ¡c nháº­n má»›i Ä‘Æ°á»£c Ä‘áº£o.");
  }

  advance.status = "reversed";
  const sourceDocument = reversalDocumentNo(advance.documentNo);
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiá»n máº·t cá»­a hÃ ng",
    sourceDocument,
    direction: "in",
    amount: advance.amount,
    postedAt: now
  });
  state.employeeLedgerEntries.push(createEmployeeLedgerEntry(state, {
    employeeId: advance.employeeId,
    sourceDocument,
    direction: "credit",
    amount: advance.amount,
    entryType: "reversal",
    postingDate: now
  }));

  return `Äáº£o ${advance.documentNo}; hoÃ n láº¡i quá»¹ vÃ  sá»• nhÃ¢n viÃªn vá»›i lÃ½ do: ${reason}.`;
}

function resolveImportIssue(state: OperationsState, targetId?: string) {
  const issue = targetId ? state.importIssues.find((item) => item.id === targetId) : state.importIssues.find((item) => item.status === "open");
  if (!issue) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y váº¥n Ä‘á» import cáº§n xá»­ lÃ½." : "KhÃ´ng cÃ²n váº¥n Ä‘á» import Ä‘ang má»Ÿ.");
  }
  if (issue.status !== "open") {
    throw new Error("Váº¥n Ä‘á» import nÃ y Ä‘Ã£ Ä‘Æ°á»£c xá»­ lÃ½ trÆ°á»›c Ä‘Ã³.");
  }
  issue.status = "resolved";
  syncImportJobReviewStatus(state, issue.importJobId);

  return `ÄÃ¡nh dáº¥u Ä‘Ã£ xá»­ lÃ½ váº¥n Ä‘á» import dÃ²ng ${issue.rowNumber} trang tÃ­nh ${issue.sourceSheet}.`;
}

function ignoreImportIssue(state: OperationsState, targetId?: string) {
  const issue = targetId
    ? state.importIssues.find((item) => item.id === targetId)
    : state.importIssues.find((item) => item.status === "open" && item.severity === "warning");
  if (!issue) {
    throw new Error(targetId ? "KhÃ´ng tÃ¬m tháº¥y cáº£nh bÃ¡o import cáº§n bá» qua." : "KhÃ´ng cÃ²n cáº£nh bÃ¡o import Ä‘ang má»Ÿ.");
  }
  if (issue.status !== "open") {
    throw new Error("Váº¥n Ä‘á» import nÃ y Ä‘Ã£ Ä‘Æ°á»£c xá»­ lÃ½ trÆ°á»›c Ä‘Ã³.");
  }
  if (issue.severity !== "warning") {
    throw new Error("Lỗi import bắt buộc phải xử lý, không được bỏ qua.");
  }

  issue.status = "ignored";
  syncImportJobReviewStatus(state, issue.importJobId);

  return `Bá» qua cáº£nh bÃ¡o import dÃ²ng ${issue.rowNumber} trang tÃ­nh ${issue.sourceSheet}; lá»—i nghiÃªm trá»ng váº«n pháº£i xá»­ lÃ½.`;
}

function syncImportJobReviewStatus(state: OperationsState, importJobId?: string) {
  if (!importJobId) {
    return;
  }
  const job = state.importJobs.find((item) => item.id === importJobId);
  if (!job) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y batch import liÃªn káº¿t vá»›i váº¥n Ä‘á» nÃ y.");
  }
  job.status = state.importIssues.some((issue) => issue.importJobId === job.id && issue.status === "open")
    ? "dry_run"
    : "reviewed";
}

function reverseReceiptFinancials(state: OperationsState, movement: InventoryMovement, sourceDocument: string, now: string) {
  const receiptLineId = movement.sourceLineId ?? (movement.postingKey.startsWith("receipt-") ? movement.postingKey.slice("receipt-".length) : "");
  const candidate = receiptLineId ? findPurchaseLine(state, (_purchaseOrder, line) => line.id === receiptLineId) : undefined;
  if (!candidate) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y dÃ²ng mua nguá»“n cá»§a phÃ¡t sinh nháº­p kho.");
  }
  const { purchaseOrder, line } = candidate;
  if (line.destinationType !== "warehouse" || line.productUnitId !== movement.productUnitId || line.warehouseId !== movement.warehouseId) {
    throw new Error("PhÃ¡t sinh nháº­p kho khÃ´ng khá»›p vá»›i dÃ²ng mua nguá»“n.");
  }
  if (line.receivedQuantity < movement.quantity) {
    throw new Error("Sá»‘ lÆ°á»£ng Ä‘Ã£ nháº­n cá»§a Ä‘Æ¡n mua khÃ´ng Ä‘á»§ Ä‘á»ƒ Ä‘áº£o phÃ¡t sinh nháº­p kho.");
  }

  const amount = purchaseLineGross(movement.quantity, line.unitCost, line.taxRate);
  const payable = findReceiptPayableEntry(state, movement, purchaseOrder.supplierId, amount);
  if (!payable) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y Ä‘Ãºng bÃºt toÃ¡n pháº£i tráº£ cá»§a láº§n nháº­p kho nÃ y Ä‘á»ƒ Ä‘áº£o.");
  }
  if (supplierAllocatedAmountForLedgerEntry(state, payable.id) > 0) {
    throw new Error("Cần đảo phiếu chi nhà cung cấp đã phân bổ cho lần nhập kho này trước khi đảo nhập kho.");
  }

  line.receivedQuantity -= movement.quantity;
  syncPurchaseOrderStatus(purchaseOrder);
  state.supplierLedgerEntries.push(
    createSupplierLedgerEntry(state, {
      supplierId: purchaseOrder.supplierId,
      sourceDocument: `${sourceDocument}:${line.id}`,
      direction: "debit",
      amount,
      netAmount: movement.quantity * line.unitCost,
      taxAmount: movement.quantity * line.unitCost * line.taxRate,
      quantity: movement.quantity,
      sourceLineId: line.id,
      postingGroupId: payable.postingGroupId ?? movement.postingKey,
      entryType: "reversal",
      postingDate: now
    })
  );
}

function reverseIssueFinancials(state: OperationsState, movement: InventoryMovement, sourceDocument: string, now: string) {
  const issuePrefix = `issue-${movement.sourceDocument}-`;
  const salesLineId = movement.sourceLineId ?? (movement.postingKey.startsWith(issuePrefix) ? movement.postingKey.slice(issuePrefix.length) : "");
  const salesOrder = state.salesOrders.find((order) => order.documentNo === movement.sourceDocument);
  const salesLine = salesOrder?.lines.find((line) => line.id === salesLineId);
  if (!salesOrder || !salesLine) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n bÃ¡n nguá»“n cá»§a phÃ¡t sinh xuáº¥t kho.");
  }
  if (salesLine.productUnitId !== movement.productUnitId || salesLine.warehouseId !== movement.warehouseId) {
    throw new Error("PhÃ¡t sinh xuáº¥t kho khÃ´ng khá»›p vá»›i dÃ²ng bÃ¡n nguá»“n.");
  }

  const reversedQuantity = Math.abs(movement.quantity);
  if (salesLine.deliveredQuantity < reversedQuantity) {
    throw new Error("Sá»‘ lÆ°á»£ng Ä‘Ã£ giao cá»§a Ä‘Æ¡n bÃ¡n khÃ´ng Ä‘á»§ Ä‘á»ƒ Ä‘áº£o phÃ¡t sinh xuáº¥t kho.");
  }

  const amount = lineTotals({
    quantity: reversedQuantity,
    unitPrice: salesLine.unitPrice,
    taxRate: salesLine.taxRate
  }).gross;
  const receivable = findIssueReceivableEntry(state, movement, salesOrder.customerId, amount);
  if (!receivable) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y Ä‘Ãºng bÃºt toÃ¡n pháº£i thu cá»§a láº§n xuáº¥t kho nÃ y Ä‘á»ƒ Ä‘áº£o.");
  }
  if (customerAllocatedAmountForLedgerEntry(state, receivable.id) > 0) {
    throw new Error("Cần đảo hoặc bỏ phân bổ phiếu thu khách hàng trước khi đảo xuất kho này.");
  }

  salesLine.deliveredQuantity -= reversedQuantity;
  syncSalesOrderDeliveryStatus(salesOrder);
  state.customerLedgerEntries.push(
    createCustomerLedgerEntry(state, {
      customerId: salesOrder.customerId,
      sourceDocument: `${sourceDocument}:${salesLine.id}`,
      direction: "credit",
      amount,
      netAmount: reversedQuantity * salesLine.unitPrice,
      taxAmount: reversedQuantity * salesLine.unitPrice * salesLine.taxRate,
      quantity: reversedQuantity,
      sourceLineId: salesLine.id,
      postingGroupId: receivable.postingGroupId ?? movement.postingKey,
      entryType: "reversal",
      postingDate: now
    })
  );
}

function findReceiptPayableEntry(
  state: OperationsState,
  movement: InventoryMovement,
  supplierId: string,
  amount: number
) {
  const exact = state.supplierLedgerEntries.find((entry) =>
    entry.postingGroupId === movement.postingKey &&
    entry.supplierId === supplierId &&
    entry.direction === "credit" &&
    entry.entryType === "inventory_receipt"
  );
  if (exact) {
    return exact;
  }

  const legacyMatches = state.supplierLedgerEntries.filter((entry) =>
    entry.supplierId === supplierId &&
    entry.sourceDocument === movement.sourceDocument &&
    entry.sourceLineId === movement.sourceLineId &&
    entry.direction === "credit" &&
    entry.entryType === "inventory_receipt" &&
    amountsEqual(entry.amount, amount) &&
    (entry.quantity === undefined || amountsEqual(entry.quantity, movement.quantity)) &&
    !state.supplierLedgerEntries.some((reversal) =>
      reversal.entryType === "reversal" &&
      reversal.direction === "debit" &&
      reversal.postingGroupId &&
      reversal.postingGroupId === entry.postingGroupId
    )
  );
  return legacyMatches.length === 1 ? legacyMatches[0] : undefined;
}

function findIssueReceivableEntry(
  state: OperationsState,
  movement: InventoryMovement,
  customerId: string,
  amount: number
) {
  const exact = state.customerLedgerEntries.find((entry) =>
    entry.postingGroupId === movement.postingKey &&
    entry.customerId === customerId &&
    entry.direction === "debit" &&
    entry.entryType === "sale_delivery"
  );
  if (exact) {
    return exact;
  }

  const legacyMatches = state.customerLedgerEntries.filter((entry) =>
    entry.customerId === customerId &&
    entry.sourceDocument === `${movement.sourceDocument}:GIAO-KHO` &&
    entry.sourceLineId === movement.sourceLineId &&
    entry.direction === "debit" &&
    entry.entryType === "sale_delivery" &&
    amountsEqual(entry.amount, amount) &&
    (entry.quantity === undefined || amountsEqual(entry.quantity, Math.abs(movement.quantity))) &&
    !state.customerLedgerEntries.some((reversal) =>
      reversal.entryType === "reversal" &&
      reversal.direction === "credit" &&
      reversal.postingGroupId &&
      reversal.postingGroupId === entry.postingGroupId
    )
  );
  return legacyMatches.length === 1 ? legacyMatches[0] : undefined;
}

function findSourceAllocation(state: OperationsState, order: SalesOrder, line: SalesOrderLine) {
  const stockedWarehouse = state.warehouses.find(
    (warehouse) =>
      warehouse.status === "active" && availableWarehouseStockForAllocation(state, warehouse.id, line.productUnitId) >= line.quantity
  );
  if (stockedWarehouse) {
    return {
      sourceType: "warehouse" as const,
      warehouseId: stockedWarehouse.id,
      purchaseOrderLineId: undefined
    };
  }

  const warehousePurchase = findPurchaseLine(state, (purchaseOrder, purchaseLine) => {
    return (
      purchaseOrder.status !== "draft" &&
      purchaseOrder.status !== "fully_received" &&
      purchaseLine.destinationType === "warehouse" &&
      purchaseLine.productUnitId === line.productUnitId &&
      purchaseLineAvailableQuantity(state, purchaseLine) >= line.quantity
    );
  });
  if (warehousePurchase) {
    return {
      sourceType: "warehouse" as const,
      warehouseId: warehousePurchase.line.warehouseId ?? "wh-main",
      purchaseOrderLineId: warehousePurchase.line.id
    };
  }

  const directPurchase = findPurchaseLine(state, (purchaseOrder, purchaseLine) => {
    return (
      purchaseOrder.status !== "draft" &&
      purchaseOrder.status !== "fully_received" &&
      purchaseLine.destinationType === "customer_direct" &&
      purchaseLine.productUnitId === line.productUnitId &&
      purchaseLineAvailableQuantity(state, purchaseLine) >= line.quantity &&
      (!purchaseLine.salesOrderLineId || purchaseLine.salesOrderLineId === line.id) &&
      (!purchaseLine.customerId || purchaseLine.customerId === order.customerId)
    );
  });
  if (directPurchase) {
    directPurchase.line.salesOrderLineId = line.id;
    directPurchase.line.customerId = order.customerId;
    return {
      sourceType: "direct_supplier" as const,
      warehouseId: undefined,
      purchaseOrderLineId: directPurchase.line.id
    };
  }

  throw new Error("ChÆ°a cÃ³ tá»“n kho hoáº·c Ä‘Æ¡n mua phÃ¹ há»£p Ä‘á»ƒ phÃ¢n bá»• nguá»“n cho dÃ²ng bÃ¡n.");
}

function availableWarehouseStockForAllocation(state: OperationsState, warehouseId: string, productUnitId: string) {
  return stockBalance(state, warehouseId, productUnitId) - reservedWarehouseStock(state, warehouseId, productUnitId);
}

function reservedWarehouseStock(state: OperationsState, warehouseId: string, productUnitId: string) {
  return state.salesOrders.reduce(
    (orderSum, order) =>
      orderSum +
      order.lines.reduce((lineSum, line) => {
        if (!isReservationStatus(order.status)) {
          return lineSum;
        }
        if (line.sourceType !== "warehouse" || line.purchaseOrderLineId || line.warehouseId !== warehouseId || line.productUnitId !== productUnitId) {
          return lineSum;
        }
        return lineSum + openSalesLineQuantity(line);
      }, 0),
    0
  );
}

function purchaseLineAvailableQuantity(state: OperationsState, purchaseLine: PurchaseOrderLine) {
  return purchaseLine.orderedQuantity - purchaseLine.receivedQuantity - reservedPurchaseLineQuantity(state, purchaseLine.id);
}

function reservedPurchaseLineQuantity(state: OperationsState, purchaseOrderLineId: string) {
  return state.salesOrders.reduce(
    (orderSum, order) =>
      orderSum +
      order.lines.reduce((lineSum, line) => {
        if (!isReservationStatus(order.status) || line.purchaseOrderLineId !== purchaseOrderLineId) {
          return lineSum;
        }
        return lineSum + openSalesLineQuantity(line);
      }, 0),
    0
  );
}

function isReservationStatus(status: SalesOrder["status"]) {
  return status === "confirmed" || status === "allocated" || status === "partially_delivered";
}

function openSalesLineQuantity(line: SalesOrderLine) {
  return Math.max(line.quantity - line.deliveredQuantity, 0);
}

function findNextWarehouseReceipt(state: OperationsState) {
  return findPurchaseLine(
    state,
    (purchaseOrder, line) =>
      purchaseOrder.status !== "draft" &&
      purchaseOrder.status !== "fully_received" &&
      line.destinationType === "warehouse" &&
      Boolean(line.warehouseId) &&
      line.receivedQuantity < line.orderedQuantity
  );
}

function findNextDirectDelivery(state: OperationsState) {
  for (const purchaseOrder of state.purchaseOrders) {
    if (purchaseOrder.status === "draft" || purchaseOrder.status === "fully_received") {
      continue;
    }
    for (const purchaseLine of purchaseOrder.lines) {
      if (purchaseLine.destinationType !== "customer_direct" || purchaseLine.receivedQuantity >= purchaseLine.orderedQuantity) {
        continue;
      }
      const linked = findLinkedSalesLineForDirectDelivery(state, purchaseLine);
      if (linked) {
        purchaseLine.salesOrderLineId = linked.salesLine.id;
        purchaseLine.customerId = linked.salesOrder.customerId;
        return {
          purchaseOrder,
          purchaseLine,
          salesOrder: linked.salesOrder,
          salesLine: linked.salesLine
        };
      }
    }
  }
  return undefined;
}

function findDirectDeliveryByPurchaseLineId(state: OperationsState, targetId: string) {
  const purchase = findPurchaseLine(state, (purchaseOrder, purchaseLine) => purchaseOrder.id === targetId || purchaseLine.id === targetId);
  if (!purchase) {
    return undefined;
  }
  const linked = findLinkedSalesLineForDirectDelivery(state, purchase.line);
  if (!linked) {
    return undefined;
  }
  purchase.line.salesOrderLineId = linked.salesLine.id;
  purchase.line.customerId = linked.salesOrder.customerId;
  return {
    purchaseOrder: purchase.purchaseOrder,
    purchaseLine: purchase.line,
    salesOrder: linked.salesOrder,
    salesLine: linked.salesLine
  };
}

function findNextDeliveryByStatus(
  state: OperationsState,
  statuses: Array<DeliveryJob["status"]>,
  targetId?: string
): { order: SalesOrder; job: DeliveryJob } | undefined {
  for (const job of state.deliveryJobs) {
    if (targetId && job.id !== targetId) {
      continue;
    }
    if (!statuses.includes(job.status)) {
      continue;
    }
    const order = state.salesOrders.find((item) => item.id === job.salesOrderId);
    if (!order || (order.status !== "allocated" && order.status !== "partially_delivered")) {
      continue;
    }
    if (order.lines.some((line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity)) {
      return { order, job };
    }
  }
  return undefined;
}

function findNextDeliveryCompletion(state: OperationsState, targetId?: string): { order: SalesOrder; job: DeliveryJob } | undefined {
  return findNextDeliveryByStatus(state, ["in_transit"], targetId);
}

function assertWorkerSubmissionActor(actor: OperationsActor) {
  if (actor.role !== "worker") {
    throw new Error("Chi tai khoan Tho moi duoc gui xac nhan nhap kho hoac giao hang.");
  }
}

function assertWorkerClaimActor(actor: OperationsActor) {
  if (actor.role !== "worker") {
    throw new Error("Chá»‰ tÃ i khoáº£n Thá»£ má»›i Ä‘Æ°á»£c nháº­n Ä‘Æ¡n má»›i.");
  }
}

function validateReceiptAttachments(attachments: OperationsAttachment[], actor: OperationsActor) {
  if (attachments.length === 0 || attachments.length > 3) {
    throw new Error("Phiáº¿u nháº­p cá»§a Thá»£ báº¯t buá»™c Ä‘Ã­nh kÃ¨m Ã­t nháº¥t má»™t áº£nh vÃ  tá»‘i Ä‘a 3 áº£nh.");
  }
  for (const attachment of attachments) {
    if (attachment.uploadedBy !== actor.id || !attachment.id.trim() || !attachment.fileName.trim() || attachment.size <= 0 || attachment.size > 8 * 1024 * 1024 || !/^[a-f0-9]{64}$/i.test(attachment.sha256)) {
      throw new Error("áº¢nh Ä‘Ã­nh kÃ¨m phiáº¿u nháº­p khÃ´ng há»£p lá»‡ hoáº·c khÃ´ng thuá»™c tÃ i khoáº£n gá»­i.");
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(attachment.contentType)) {
      throw new Error("Chá»‰ cháº¥p nháº­n áº£nh JPG, PNG hoáº·c WEBP cho phiáº¿u nháº­p.");
    }
  }
}

function validateDeliveryCompletionAttachments(attachments: OperationsAttachment[], actor: OperationsActor) {
  if (attachments.length === 0 || attachments.length > 3) {
    throw new Error("Xac nhan da giao cua Tho bat buoc dinh kem it nhat mot anh va toi da 3 anh.");
  }
  for (const attachment of attachments) {
    if (attachment.uploadedBy !== actor.id || !attachment.id.trim() || !attachment.fileName.trim() || attachment.size <= 0 || attachment.size > 8 * 1024 * 1024 || !/^[a-f0-9]{64}$/i.test(attachment.sha256)) {
      throw new Error("Anh xac nhan giao khong hop le hoac khong thuoc tai khoan gui.");
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(attachment.contentType)) {
      throw new Error("Chi chap nhan anh JPG, PNG hoac WEBP de xac nhan da giao.");
    }
  }
}

function assertApprovalActor(actor: OperationsActor) {
  if (actor.role !== "owner" && actor.role !== "accountant") {
    throw new Error("Chi tai khoan Chu cua hang hoac Ke toan moi duoc phe duyet.");
  }
}

function findWorkerEmployee(state: OperationsState, actor: OperationsActor) {
  const normalizedActorName = normalizePersonName(actor.displayName);
  return state.employees.find((employee) =>
    employee.roleType === "worker" && normalizePersonName(employee.displayName) === normalizedActorName
  );
}

function findApprovalRequest(
  state: OperationsState,
  type: ApprovalRequestType,
  targetId?: string
): OperationsApprovalRequest | undefined {
  return state.approvalRequests.find((request) =>
    request.type === type &&
    request.status === "pending" &&
    (!targetId || request.id === targetId || request.targetId === targetId)
  );
}

function findPendingApprovalRequest(state: OperationsState, type: ApprovalRequestType, targetId: string) {
  return findApprovalRequest(state, type, targetId);
}

function normalizePersonName(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findNextCustomerPaymentConfirmation(state: OperationsState): CustomerPayment | undefined {
  return state.customerPayments.find(
    (payment) =>
      payment.status === "draft" &&
      state.customerLedgerEntries.some((entry) => entry.customerId === payment.customerId && entry.direction === "debit" && !entry.reversedById)
  );
}

function findNextSupplierPaymentConfirmation(state: OperationsState): SupplierPayment | undefined {
  return state.supplierPayments.find(
    (payment) => payment.status === "draft" && supplierBalance(state.supplierLedgerEntries, payment.supplierId) >= payment.amount
  );
}

function findNextEmployeePaymentConfirmation(state: OperationsState): EmployeePayment | undefined {
  return state.employeePayments.find(
    (payment) =>
      payment.status === "draft" &&
      employeePayableBalance(state, payment.employeeId) >= payment.amount &&
      cashBalance(state) >= payment.amount
  );
}

function findPurchaseLine(
  state: OperationsState,
  predicate: (purchaseOrder: PurchaseOrder, line: PurchaseOrderLine) => boolean
) {
  for (const purchaseOrder of state.purchaseOrders) {
    for (const line of purchaseOrder.lines) {
      if (predicate(purchaseOrder, line)) {
        return { purchaseOrder, line };
      }
    }
  }
  return undefined;
}

function findLinkedSalesLineForDirectDelivery(state: OperationsState, purchaseLine: PurchaseOrderLine) {
  for (const salesOrder of state.salesOrders) {
    if (salesOrder.status !== "allocated" && salesOrder.status !== "partially_delivered") {
      continue;
    }
    if (purchaseLine.customerId && salesOrder.customerId !== purchaseLine.customerId) {
      continue;
    }
    const salesLine = salesOrder.lines.find(
      (line) =>
        line.productUnitId === purchaseLine.productUnitId &&
        line.deliveredQuantity < line.quantity &&
        (line.purchaseOrderLineId === purchaseLine.id || line.sourceType === "direct_supplier")
    );
    if (salesLine) {
      return { salesOrder, salesLine };
    }
  }
  return undefined;
}

function syncPurchaseOrderStatus(purchaseOrder: PurchaseOrder) {
  const allReceived = purchaseOrder.lines.every((line) => line.receivedQuantity >= line.orderedQuantity);
  const anyReceived = purchaseOrder.lines.some((line) => line.receivedQuantity > 0);
  purchaseOrder.status = allReceived ? "fully_received" : anyReceived ? "partially_received" : purchaseOrder.status === "draft" ? "draft" : "ordered";
}

function syncSalesOrderDeliveryStatus(order: SalesOrder) {
  const allDelivered = order.lines.every((line) => line.deliveredQuantity >= line.quantity);
  const anyDelivered = order.lines.some((line) => line.deliveredQuantity > 0);
  if (allDelivered) {
    order.status = "delivered";
  } else if (anyDelivered) {
    order.status = "partially_delivered";
  } else if (order.status === "delivered" || order.status === "partially_delivered") {
    order.status = "allocated";
  }
}

function createAllocationPlan(input: {
  remainingPayment: number;
  obligations: Array<{ ledgerEntryId: string; openAmount: number }>;
  requested?: Array<{ ledgerEntryId: string; amount: number }>;
  invalidTargetMessage: string;
}) {
  if (!Number.isFinite(input.remainingPayment) || input.remainingPayment <= 0) {
    throw new Error("Phiáº¿u Ä‘Ã£ háº¿t sá»‘ tiá»n cÃ³ thá»ƒ phÃ¢n bá»•.");
  }

  const plan = input.requested
    ? input.requested.map((allocation) => ({ ...allocation }))
    : createFifoAllocationPlan(input.obligations, input.remainingPayment);
  if (plan.length === 0) {
    throw new Error("KhÃ´ng cÃ²n nghÄ©a vá»¥ cÃ´ng ná»£ phÃ¹ há»£p Ä‘á»ƒ phÃ¢n bá»•.");
  }

  const seenTargets = new Set<string>();
  for (const allocation of plan) {
    if (seenTargets.has(allocation.ledgerEntryId)) {
      throw new Error("Má»™t lá»‡nh phÃ¢n bá»• khÃ´ng Ä‘Æ°á»£c láº·p láº¡i cÃ¹ng dÃ²ng cÃ´ng ná»£.");
    }
    seenTargets.add(allocation.ledgerEntryId);
    if (!Number.isFinite(allocation.amount) || allocation.amount <= 0) {
      throw new Error("Sá»‘ tiá»n phÃ¢n bá»• pháº£i lá»›n hÆ¡n 0.");
    }
    const obligation = input.obligations.find((item) => item.ledgerEntryId === allocation.ledgerEntryId);
    if (!obligation) {
      throw new Error(input.invalidTargetMessage);
    }
    if (allocation.amount - obligation.openAmount > 0.000001) {
      throw new Error("Số tiền phân bổ vượt phần còn mở của chứng từ công nợ.");
    }
  }

  const total = plan.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (total - input.remainingPayment > 0.000001) {
    throw new Error("Tá»•ng phÃ¢n bá»• vÆ°á»£t sá»‘ tiá»n cÃ²n láº¡i cá»§a phiáº¿u.");
  }
  return plan;
}

function createFifoAllocationPlan(obligations: Array<{ ledgerEntryId: string; openAmount: number }>, availableAmount: number) {
  const plan: Array<{ ledgerEntryId: string; amount: number }> = [];
  let remaining = availableAmount;
  for (const obligation of obligations) {
    if (remaining <= 0) {
      break;
    }
    const amount = Math.min(obligation.openAmount, remaining);
    if (amount > 0) {
      plan.push({ ledgerEntryId: obligation.ledgerEntryId, amount });
      remaining -= amount;
    }
  }
  return plan;
}

function amountsEqual(left: number, right: number) {
  return Math.abs(left - right) <= 0.000001;
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Math.max(0, amount));
}

function employeePayableBalance(state: OperationsState, employeeId: string) {
  return state.employeeLedgerEntries
    .filter((entry) => entry.employeeId === employeeId && !entry.reversedById)
    .reduce((balance, entry) => balance + (entry.direction === "credit" ? entry.amount : -entry.amount), 0);
}

function reversalDocumentNo(documentNo: string) {
  return `REV-${documentNo}`;
}

function getPrimarySalesOrder(state: OperationsState) {
  const order = state.salesOrders.find((item) => item.id === "so-001");
  if (!order) {
    throw new Error("KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n bÃ¡n máº«u.");
  }
  return order;
}

function assertNoInventoryPosting(state: OperationsState, postingKey: string) {
  if (state.inventoryMovements.some((movement) => movement.postingKey === postingKey)) {
    throw new Error("MÃ£ ghi sá»• kho Ä‘Ã£ tá»“n táº¡i, khÃ´ng Ä‘Æ°á»£c ghi kho trÃ¹ng.");
  }
}

function purchaseLineGross(quantity: number, unitCost: number, taxRate: number) {
  const net = quantity * unitCost;
  return net + net * taxRate;
}

function movingAverageCost(state: OperationsState, warehouseId: string, productUnitId: string) {
  const movements = state.inventoryMovements.filter(
    (movement) =>
      movement.warehouseId === warehouseId &&
      movement.productUnitId === productUnitId
  );
  const totalQuantity = movements.reduce((sum, movement) => sum + movement.quantity, 0);
  const inventoryValue = movements.reduce((sum, movement) => sum + movement.quantity * movement.unitCost, 0);

  if (totalQuantity <= 0) {
    return 0;
  }

  const cost = inventoryValue / totalQuantity;
  if (!Number.isFinite(cost) || cost < 0) {
    throw new Error("GiÃ¡ trá»‹ tá»“n kho khÃ´ng há»£p lá»‡; cáº§n Ä‘á»‘i chiáº¿u phÃ¡t sinh kho trÆ°á»›c khi tiáº¿p tá»¥c.");
  }
  return cost;
}

function createCustomerLedgerEntry(
  state: OperationsState,
  entry: Omit<CustomerLedgerEntry, "id">
): CustomerLedgerEntry {
  return {
    id: nextId("cl", state.customerLedgerEntries.length),
    ...entry
  };
}

function createSupplierLedgerEntry(
  state: OperationsState,
  entry: Omit<SupplierLedgerEntry, "id">
): SupplierLedgerEntry {
  return {
    id: nextId("sl", state.supplierLedgerEntries.length),
    ...entry
  };
}

function createEmployeeLedgerEntry(
  state: OperationsState,
  entry: Omit<EmployeeLedgerEntry, "id">
): EmployeeLedgerEntry {
  return {
    id: nextId("el", state.employeeLedgerEntries.length),
    ...entry
  };
}

export function createAuditLog(
  state: OperationsState,
  actor: OperationsActor,
  operation: OperationName,
  now: string,
  summary: string,
  permission?: string,
  targetId?: string,
  correlationId?: string,
  reason?: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>
): AuditLog {
  return {
    id: nextId("audit", state.auditLogs.length),
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    action: operation,
    entityType: "operations_workspace",
    entityId: "full_erp",
    permission,
    targetId,
    correlationId,
    reason,
    before,
    after,
    occurredAt: now,
    summary
  };
}

export function createAuditSnapshot(state: OperationsState, targetId?: string): Record<string, unknown> {
  if (targetId) {
    const collections: Array<[string, Array<{ id: string }>]> = [
      ["sales_order", state.salesOrders],
      ["purchase_order", state.purchaseOrders],
      ["delivery_job", state.deliveryJobs],
      ["approval_request", state.approvalRequests],
      ["inventory_movement", state.inventoryMovements],
      ["customer_payment", state.customerPayments],
      ["supplier_payment", state.supplierPayments],
      ["cash_voucher", state.cashVouchers],
      ["employee_payment", state.employeePayments],
      ["work_order", state.workOrders],
      ["import_issue", state.importIssues]
    ];
    for (const [entityType, records] of collections) {
      const record = records.find((item) => item.id === targetId);
      if (record) {
        return { entityType, record: structuredClone(record) };
      }
    }
    const purchaseLine = findPurchaseLine(state, (_order, line) => line.id === targetId);
    if (purchaseLine) {
      return {
        entityType: "purchase_order_line",
        purchaseOrderId: purchaseLine.purchaseOrder.id,
        record: structuredClone(purchaseLine.line)
      };
    }
  }

  return {
    salesOrders: state.salesOrders.length,
    purchaseOrders: state.purchaseOrders.length,
    inventoryMovements: state.inventoryMovements.length,
    customerLedgerEntries: state.customerLedgerEntries.length,
    supplierLedgerEntries: state.supplierLedgerEntries.length,
    cashTransactions: state.cashTransactions.length,
    auditLogs: state.auditLogs.length
  };
}

function requireReason(value: string | undefined, action: string) {
  const reason = value?.trim() ?? "";
  if (reason.length < 5) {
    throw new Error(`${action} cáº§n lÃ½ do Ã­t nháº¥t 5 kÃ½ tá»± Ä‘á»ƒ lÆ°u audit.`);
  }
  return reason;
}

function nextPostingKey(state: OperationsState, baseKey: string) {
  if (!state.inventoryMovements.some((movement) => movement.postingKey === baseKey)) {
    return baseKey;
  }
  let sequence = 2;
  while (state.inventoryMovements.some((movement) => movement.postingKey === `${baseKey}-${sequence}`)) {
    sequence += 1;
  }
  return `${baseKey}-${sequence}`;
}

function nextId(prefix: string, count: number) {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}
