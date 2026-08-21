import {
  cashBalance,
  customerBalance,
  lineTotals,
  salesOrderTotals,
  stockBalance,
  supplierBalance
} from "../selectors";
import { createRoleActor as buildRoleActor } from "../identity";
import {
  customerAllocatedAmountForLedgerEntry,
  getOpenCustomerDebtObligations,
  getOpenSupplierDebtObligations,
  paymentAllocatedAmount,
  supplierAllocatedAmountForLedgerEntry
} from "../debt-reconciliation";
import { asOperationInputError } from "../errors";
import {
  hasOpenWarehouseAllocation,
  openAllocationQuantity,
  salesSourceAllocations,
  setSalesSourceAllocations,
  syncAllocationStatus
} from "../sales-source-allocations";
import type {
  AuditLog,
  ApprovalRequestType,
  CompensationBatch,
  CustomerLedgerEntry,
  CustomerPayment,
  DeliveryJob,
  EmployeeLedgerEntry,
  EmployeePayment,
  InventoryCountLine,
  InventoryCountSession,
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
  SalesSourceAllocation,
  SupplierPayment,
  SupplierLedgerEntry,
  WorkOrder
} from "../types";

export type RunOperationInput = {
  state: OperationsState;
  operation: OperationName;
  actor: OperationsActor;
  now: string;
  idempotencyKey: string;
  targetId?: string;
  options?: OperationOptions;
};

export const ORDER_ALREADY_CLAIMED = "ORDER_ALREADY_CLAIMED";

export const erpV2OperationPermissions: Record<OperationName, string> = {
  updateProductCommercialPolicy: "catalog.update_commercial_policy",
  assignCustomerCollectionOwner: "receivables.assign_collection_owner",
  recordCustomerCollectionFollowUp: "receivables.record_collection_follow_up",
  confirmSalesOrder: "sales.confirm",
  recordWorkOrderLocation: "workforce.record_location",
  claimOpenSalesWorkOrder: "workforce.claim_open_order",
  assignSalesWorkOrder: "workforce.assign_order",
  allocateSalesSources: "sales.allocate_source",
  requestNegativeStockOverride: "inventory.request_negative_stock_override",
  approveNegativeStockOverride: "inventory.approve_negative_stock_override",
  rejectNegativeStockOverride: "inventory.reject_negative_stock_override",
  confirmPurchaseOrder: "procurement.confirm",
  submitGoodsReceipt: "inventory.submit_receipt",
  approveGoodsReceipt: "inventory.approve_receipt",
  rejectGoodsReceipt: "inventory.reject_receipt",
  postGoodsReceipt: "inventory.post_receipt",
  reverseInventoryMovement: "inventory.reverse_movement",
  postOpeningInventory: "inventory.post_opening",
  postInventoryTransfer: "inventory.post_transfer",
  postInventoryCountAdjustment: "inventory.create_count_session",
  createInventoryCountSession: "inventory.create_count_session",
  addInventoryCountLine: "inventory.record_count_line",
  recordInventoryCountLine: "inventory.record_count_line",
  submitInventoryCountSession: "inventory.submit_count_session",
  requestInventoryCountRecount: "inventory.request_count_recount",
  approveInventoryCountSession: "inventory.approve_count_session",
  rejectInventoryCountSession: "inventory.reject_count_session",
  reverseInventoryCountSession: "inventory.reverse_count_session",
  confirmDirectDelivery: "delivery.confirm_direct",
  reverseDirectDelivery: "delivery.reverse_direct",
  startDeliveryLoading: "delivery.start_loading",
  dispatchDelivery: "delivery.dispatch",
  requestDeliveryQuantityChange: "delivery.request_quantity_change",
  approveDeliveryQuantityChange: "delivery.approve_quantity_change",
  rejectDeliveryQuantityChange: "delivery.reject_quantity_change",
  confirmCustomerDeliveryReceipt: "portal.customer.confirm_delivery_receipt",
  waiveCustomerDeliveryReceipt: "delivery.waive_customer_receipt",
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

export function runCoreOperation(input: RunOperationInput): OperationResult {
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
      summary: "Yêu cầu này đã được xử lý trước đó, hệ thống không ghi trùng.",
      severity: "warning"
    };
  }

  assertPermission(actor, erpV2OperationPermissions[operation]);
  assertActorWarehouseScope(actor, state, operation, targetId, options);

  const draft = structuredClone(state) as OperationsState;
  const before = createAuditSnapshot(draft, targetId);
  let summary: string;
  let severity: OperationResult["severity"] = "success";

  switch (operation) {
    case "updateProductCommercialPolicy":
      summary = updateProductCommercialPolicy(draft, now, targetId, options, actor);
      break;
    case "assignCustomerCollectionOwner":
      summary = assignCustomerCollectionOwner(draft, targetId, options, actor);
      break;
    case "recordCustomerCollectionFollowUp":
      summary = recordCustomerCollectionFollowUp(draft, now, targetId, options, actor);
      break;
    case "confirmSalesOrder":
      summary = confirmSalesOrder(draft, now, targetId, options);
      break;
    case "claimOpenSalesWorkOrder":
      summary = claimOpenSalesWorkOrder(draft, now, targetId, options, actor);
      break;
    case "assignSalesWorkOrder":
      summary = assignSalesWorkOrder(draft, now, targetId, options, actor);
      break;
    case "recordWorkOrderLocation":
      summary = recordWorkOrderLocation(draft, now, targetId, options, actor);
      break;
    case "allocateSalesSources":
      summary = allocateSalesSources(draft, targetId, options);
      break;
    case "requestNegativeStockOverride":
      summary = requestNegativeStockOverride(draft, now, targetId, options, actor);
      severity = "warning";
      break;
    case "approveNegativeStockOverride":
      summary = approveNegativeStockOverride(draft, now, targetId, actor);
      severity = "warning";
      break;
    case "rejectNegativeStockOverride":
      summary = rejectNegativeStockOverride(draft, now, targetId, options, actor);
      break;
    case "confirmPurchaseOrder":
      summary = confirmPurchaseOrder(draft, targetId, options);
      break;
    case "submitGoodsReceipt":
      summary = submitGoodsReceipt(draft, now, targetId, options, actor);
      break;
    case "approveGoodsReceipt":
      summary = approveGoodsReceipt(draft, now, targetId, options, actor);
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
    case "postOpeningInventory":
      summary = postOpeningInventory(draft, now, options);
      break;
    case "postInventoryTransfer":
      summary = postInventoryTransfer(draft, now, options);
      break;
    case "postInventoryCountAdjustment":
      summary = postInventoryCountAdjustment(draft, now, options, actor);
      severity = "warning";
      break;
    case "createInventoryCountSession":
      summary = createInventoryCountSession(draft, now, options, actor);
      break;
    case "addInventoryCountLine":
      summary = addInventoryCountLine(draft, targetId, options);
      break;
    case "recordInventoryCountLine":
      summary = recordInventoryCountLine(draft, now, targetId, options, actor);
      break;
    case "submitInventoryCountSession":
      summary = submitInventoryCountSession(draft, now, targetId, options, actor);
      break;
    case "requestInventoryCountRecount":
      summary = requestInventoryCountRecount(draft, now, targetId, options, actor);
      break;
    case "approveInventoryCountSession":
      summary = approveInventoryCountSession(draft, now, targetId, options, actor);
      if (summary.startsWith("Cần kiểm lại")) severity = "warning";
      break;
    case "rejectInventoryCountSession":
      summary = rejectInventoryCountSession(draft, now, targetId, options, actor);
      break;
    case "reverseInventoryCountSession":
      summary = reverseInventoryCountSession(draft, now, targetId, options, actor);
      break;
    case "confirmDirectDelivery":
      summary = confirmDirectDelivery(draft, now, targetId, options, actor);
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
    case "requestDeliveryQuantityChange":
      summary = requestDeliveryQuantityChange(draft, now, targetId, options, actor);
      break;
    case "approveDeliveryQuantityChange":
      summary = approveDeliveryQuantityChange(draft, now, targetId, actor);
      break;
    case "rejectDeliveryQuantityChange":
      summary = rejectDeliveryQuantityChange(draft, now, targetId, options, actor);
      break;
    case "confirmCustomerDeliveryReceipt":
      summary = confirmCustomerDeliveryReceipt(draft, now, targetId, options, actor);
      break;
    case "waiveCustomerDeliveryReceipt":
      summary = waiveCustomerDeliveryReceipt(draft, now, targetId, options, actor);
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
      summary = completeDelivery(draft, now, targetId, options, false, actor);
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
      summary = approveWorkOutput(draft, targetId, options);
      break;
    case "postCompensation":
      summary = postCompensation(draft, now, targetId, options);
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
      throw new Error("Thao tác không được hỗ trợ.");
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
    erpV2OperationPermissions[operation],
    targetId,
    idempotencyKey,
    options?.reason,
    before,
    createAuditSnapshot(draft, targetId)
  ));

  return {
    state: draft,
    summary,
    severity
  };
}

export function createOwnerActor(): OperationsActor {
  return buildRoleActor("owner");
}

export { createRoleActor } from "../identity";

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
  if (operation === "postOpeningInventory" && options?.warehouseId) {
    warehouseIds.push(options.warehouseId);
  }
  if (operation === "requestNegativeStockOverride" && options?.warehouseId) {
    warehouseIds.push(options.warehouseId);
  }
  if (operation === "postInventoryTransfer") {
    warehouseIds.push(...[options?.sourceWarehouseId, options?.destinationWarehouseId].filter((value): value is string => Boolean(value)));
  }
  if (["postInventoryCountAdjustment", "createInventoryCountSession"].includes(operation) && options?.warehouseId) {
    warehouseIds.push(options.warehouseId);
  }
  if (["addInventoryCountLine", "recordInventoryCountLine", "submitInventoryCountSession"].includes(operation) && targetId) {
    const session = state.inventoryCountSessions?.find((item) => item.id === targetId);
    if (session) warehouseIds.push(session.warehouseId);
  }
  if ((operation === "startDeliveryLoading" || operation === "dispatchDelivery") && targetId) {
    const job = state.deliveryJobs.find((item) => item.id === targetId);
    const order = job ? state.salesOrders.find((item) => item.id === job.salesOrderId) : undefined;
    warehouseIds.push(...(order?.lines.flatMap((line) =>
      salesSourceAllocations(line).map((allocation) => allocation.warehouseId).filter((value): value is string => Boolean(value))
    ) ?? []));
  }

  if (warehouseIds.some((warehouseId) => !assigned.has(warehouseId))) {
    throw new Error("Nhân viên kho không được thao tác kho/bãi ngoài phạm vi được phân công.");
  }
}

function confirmSalesOrder(
  state: OperationsState,
  now: string,
  targetId?: string,
  options?: OperationOptions
) {
  const order = targetId ? state.salesOrders.find((item) => item.id === targetId) : state.salesOrders.find((item) => item.status === "draft");
  if (!order) {
    throw new Error(targetId ? "Không tìm thấy đơn bán cần xác nhận." : "Không còn đơn bán nháp cần xác nhận.");
  }
  assertExpectedDocumentVersion(order.version, options?.expectedVersion, "Đơn bán");
  if (order.status !== "draft") {
    throw new Error("Chỉ đơn nháp mới được xác nhận.");
  }
  if (order.lines.length === 0) {
    throw new Error("Đơn bán phải có ít nhất một dòng vật tư.");
  }
  for (const line of order.lines) {
    if (line.quantity <= 0) {
      throw new Error("Số lượng bán phải lớn hơn 0.");
    }
    if (line.unitPrice < 0 || line.taxRate < 0) {
      throw new Error("Giá hoặc VAT không hợp lệ.");
    }
  }

  if (order.paymentMethod === "credit_requested") {
    const customer = state.customers.find((item) => item.id === order.customerId && item.status === "active");
    const outstandingBalance = customerBalance(state.customerLedgerEntries, order.customerId);
    const requestedTotal = salesOrderTotals(order.lines, order.deliveryCharge, order.commission).customerGross;
    const availableCredit = customer ? Math.max(0, customer.creditLimit - Math.max(0, outstandingBalance)) : 0;
    if (!customer || requestedTotal > availableCredit + 0.000001) {
      throw new Error("CREDIT_LIMIT_EXCEEDED: Hạn mức công nợ còn lại không đủ để xác nhận đơn này.");
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
  return `Xác nhận ${order.documentNo}; giá và VAT được giữ theo ảnh chụp giá của đơn.`;
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
    throw new Error("Chọn đơn mới cần nhận.");
  }

  const workOrder = state.workOrders.find((item) => item.id === targetId);
  if (!workOrder || !workOrder.salesOrderId) {
    throw new Error("Không tìm thấy đơn mới cần nhận.");
  }
  const currentVersion = workOrder.version ?? 1;
  if (options?.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
    throw new Error(
      `${ORDER_ALREADY_CLAIMED}: Đơn đã được nhận hoặc đã thay đổi, vui lòng tải lại danh sách công việc.`
    );
  }
  if (workOrder.status !== "open" || workOrder.participants.length > 0) {
    throw new Error(`${ORDER_ALREADY_CLAIMED}: Đơn này đã có người nhận.`);
  }

  const salesOrder = state.salesOrders.find((item) => item.id === workOrder.salesOrderId);
  if (!salesOrder || !["confirmed", "allocated", "partially_delivered"].includes(salesOrder.status)) {
    throw new Error("Đơn bán không còn sẵn sàng để nhận.");
  }

  const worker = findWorkerEmployee(state, actor);
  if (!worker || worker.status !== "active") {
    throw new Error("Tài khoản thợ chưa được gắn vào nhân sự đang hoạt động.");
  }

  const activeDeliveryJob = state.deliveryJobs.find((job) =>
    job.salesOrderId === salesOrder.id && ["assigned", "loading", "in_transit"].includes(job.status)
  );
  if (activeDeliveryJob && activeDeliveryJob.status !== "assigned") {
    throw new Error("Chuyến giao đã bắt đầu, không thể nhận đơn mới.");
  }

  workOrder.status = "assigned";
  workOrder.participants = [{ employeeId: worker.id, shareFactor: 1 }];
  workOrder.claimedByEmployeeId = worker.id;
  workOrder.claimedAt = now;
  workOrder.version = currentVersion + 1;
  if (activeDeliveryJob && !activeDeliveryJob.helperIds.includes(worker.id)) {
    activeDeliveryJob.helperIds.push(worker.id);
  }

  return `${worker.displayName} đã nhận ${workOrder.documentNo}. Đơn đã được khóa cho người nhận đầu tiên.`;
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
    throw new Error("Chọn đơn công việc cần cập nhật vị trí.");
  }

  const workOrder = state.workOrders.find((item) => item.id === targetId);
  if (!workOrder || !workOrder.salesOrderId) {
    throw new Error("Không tìm thấy đơn công việc.");
  }
  if (workOrder.status === "open" || !workOrder.claimedByEmployeeId) {
    throw new Error("Chỉ có thể cập nhật vị trí khi đơn đã được nhận.");
  }

  const worker = findWorkerEmployee(state, actor);
  if (!worker || worker.status !== "active") {
    throw new Error("Tài khoản thợ chưa được gắn vào nhân sự đang hoạt động.");
  }
  const canRecord = workOrder.claimedByEmployeeId === worker.id || workOrder.participants.some((participant) => participant.employeeId === worker.id);
  if (!canRecord) {
    throw new Error("Bạn không được phép ghi vị trí cho đơn này.");
  }

  const rawLocation = options?.location;
  if (!rawLocation) {
    throw new Error("Thông tin vị trí không được để trống.");
  }
  const latitude = rawLocation.latitude;
  const longitude = rawLocation.longitude;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("Vĩ độ phải là số trong khoảng -90 đến 90.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("Kinh độ phải là số trong khoảng -180 đến 180.");
  }

  const accuracyMeters = rawLocation.accuracyMeters;
  if (accuracyMeters !== undefined && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0)) {
    throw new Error("Độ chính xác phải là số dương.");
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

  return `${worker.displayName} đã cập nhật vị trí cho ${workOrder.documentNo}.`;
}

function allocateSalesSources(state: OperationsState, targetId?: string, options?: OperationOptions) {
  const order = targetId ? state.salesOrders.find((item) => item.id === targetId) : state.salesOrders.find((item) => item.status === "confirmed");
  if (!order) {
    throw new Error(targetId ? "Không tìm thấy đơn bán cần phân bổ nguồn." : "Không có đơn bán đã xác nhận cần phân bổ nguồn.");
  }
  assertExpectedDocumentVersion(order.version, options?.expectedVersion, "Đơn bán");
  if (order.status !== "confirmed") {
    throw new Error("Chỉ phân bổ nguồn sau khi đơn bán đã xác nhận.");
  }

  for (const line of order.lines) {
    if (line.quantity <= 0) {
      throw new Error("Số lượng bán phải lớn hơn 0 trước khi phân bổ nguồn.");
    }
    if (line.deliveredQuantity > 0) {
      throw new Error("Không phân bổ lại dòng đã giao.");
    }

  }
  const plan = buildSalesSourceAllocationPlan(state, order);
  if (plan.shortages.length > 0) {
    const shortage = plan.shortages.reduce((sum, item) => sum + item.quantity, 0);
    throw new Error(`Chưa đủ nguồn cho ${shortage} đơn vị; Kho hoặc Điều phối cần gửi yêu cầu tồn âm để Chủ cửa hàng duyệt.`);
  }
  applySalesSourceAllocationPlan(state, order, plan.allocationsByLine);
  order.status = "allocated";
  order.version += 1;

  const sourceCount = [...plan.allocationsByLine.values()].reduce((sum, allocations) => sum + allocations.length, 0);
  return `Phân bổ nguồn cho ${order.documentNo}: ${order.lines.length} dòng qua ${sourceCount} nguồn kho hoặc giao thẳng.`;
}

function requestNegativeStockOverride(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  const order = targetId ? state.salesOrders.find((item) => item.id === targetId) : undefined;
  if (!order || order.status !== "confirmed") throw new Error("Chỉ gửi yêu cầu tồn âm cho đơn bán đã xác nhận và chưa phân bổ.");
  assertExpectedDocumentVersion(order.version, options?.expectedVersion, "Đơn bán");
  if (findPendingApprovalRequest(state, "negative_stock_override", order.id)) throw new Error("Đơn bán đang có yêu cầu tồn âm chờ duyệt.");
  const warehouse = state.warehouses.find((item) => item.id === options?.warehouseId && item.status === "active");
  if (!warehouse) throw new Error("Cần chọn kho chính đang hoạt động cho phần yêu cầu tồn âm.");
  const reason = requireReason(options?.reason, "Yêu cầu tồn âm");
  const plan = buildSalesSourceAllocationPlan(state, order);
  if (plan.shortages.length === 0) throw new Error("Đơn bán hiện đã đủ nguồn; không cần yêu cầu tồn âm.");

  state.approvalRequests.push({
    id: nextId("approval", state.approvalRequests.length),
    documentNo: `APR-AM-${String(state.approvalRequests.length + 1).padStart(6, "0")}`,
    type: "negative_stock_override",
    targetId: order.id,
    status: "pending",
    negativeStockLines: plan.shortages.map((shortage) => ({ ...shortage, warehouseId: warehouse.id })),
    reason,
    submittedBy: actor.id,
    submittedByName: actor.displayName,
    submittedAt: now
  });
  return `Đã gửi yêu cầu tồn âm cho ${order.documentNo}; chưa phân bổ, chưa tạo phát sinh kho.`;
}

function approveNegativeStockOverride(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  actor: OperationsActor
) {
  assertOwnerActor(actor, "Chỉ Chủ cửa hàng được duyệt tồn âm.");
  const request = findApprovalRequest(state, "negative_stock_override", targetId);
  const order = request ? state.salesOrders.find((item) => item.id === request.targetId) : undefined;
  if (!request || !order || order.status !== "confirmed" || !request.negativeStockLines?.length) {
    throw new Error("Không tìm thấy yêu cầu tồn âm đang chờ duyệt cho đơn bán hợp lệ.");
  }
  const plan = buildSalesSourceAllocationPlan(state, order);
  const approvedByLine = new Map(request.negativeStockLines.map((line) => [line.salesOrderLineId, line]));
  for (const shortage of plan.shortages) {
    const approved = approvedByLine.get(shortage.salesOrderLineId);
    if (!approved || approved.productUnitId !== shortage.productUnitId || approved.quantity < shortage.quantity) {
      throw new Error("Nguồn hàng đã thay đổi và phần thiếu vượt yêu cầu được gửi; cần tạo yêu cầu tồn âm mới.");
    }
    const allocations = plan.allocationsByLine.get(shortage.salesOrderLineId) ?? [];
    allocations.push({
      id: `${shortage.salesOrderLineId}-allocation-${allocations.length + 1}`,
      sourceType: "warehouse",
      warehouseId: approved.warehouseId,
      allocatedQuantity: shortage.quantity,
      deliveredQuantity: 0,
      version: 1,
      status: "allocated",
      negativeStockOverrideRequestId: request.id
    });
    plan.allocationsByLine.set(shortage.salesOrderLineId, allocations);
  }
  applySalesSourceAllocationPlan(state, order, plan.allocationsByLine);
  order.status = "allocated";
  order.version += 1;
  request.status = "approved";
  request.approvedBy = actor.id;
  request.approvedByName = actor.displayName;
  request.approvedAt = now;
  return `Chủ cửa hàng đã duyệt tồn âm cho ${order.documentNo}; approval chỉ mở quyền xuất khi giao được duyệt.`;
}

function rejectNegativeStockOverride(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  assertOwnerActor(actor, "Chỉ Chủ cửa hàng được từ chối yêu cầu tồn âm.");
  const request = findApprovalRequest(state, "negative_stock_override", targetId);
  if (!request) throw new Error("Không tìm thấy yêu cầu tồn âm đang chờ duyệt.");
  request.status = "rejected";
  request.rejectionReason = requireReason(options?.reason, "Từ chối yêu cầu tồn âm");
  request.approvedBy = actor.id;
  request.approvedByName = actor.displayName;
  request.approvedAt = now;
  return `Đã từ chối yêu cầu tồn âm ${request.documentNo}; đơn bán vẫn chưa được phép giao.`;
}

function confirmPurchaseOrder(state: OperationsState, targetId?: string, options?: OperationOptions) {
  const order = targetId
    ? state.purchaseOrders.find((item) => item.id === targetId)
    : state.purchaseOrders.find((item) => item.status === "draft");
  if (!order) {
    throw new Error(targetId ? "Không tìm thấy đơn mua cần xác nhận." : "Không còn đơn mua nháp cần xác nhận.");
  }
  const currentVersion = order.version ?? 1;
  assertExpectedDocumentVersion(currentVersion, options?.expectedVersion, "Phiếu mua");
  if (order.status !== "draft") {
    throw new Error("Chỉ đơn mua nháp mới được xác nhận.");
  }
  if (order.lines.length === 0) {
    throw new Error("Đơn mua phải có ít nhất một dòng vật tư.");
  }
  for (const [index, line] of order.lines.entries()) {
    if (line.orderedQuantity <= 0 || line.unitCost < 0 || line.taxRate < 0 || line.taxRate > 1) {
      throw new Error(`Dòng mua ${index + 1} có số lượng, giá hoặc VAT không hợp lệ.`);
    }
    if (line.destinationType === "warehouse" && !line.warehouseId) {
      throw new Error(`Dòng mua ${index + 1} thiếu kho nhận.`);
    }
    if (line.destinationType === "customer_direct" && !line.customerId) {
      throw new Error(`Dòng mua ${index + 1} giao thẳng thiếu khách nhận.`);
    }
  }
  order.status = "ordered";
  order.version = currentVersion + 1;
  return `Xác nhận ${order.documentNo}; khóa giá mua và điểm nhận trước khi nhận hàng.`;
}

function assertExpectedDocumentVersion(
  currentVersion: number | undefined,
  expectedVersion: number | undefined,
  documentLabel: string
) {
  if (expectedVersion === undefined) {
    return;
  }
  const normalizedCurrentVersion = currentVersion ?? 1;
  if (expectedVersion !== normalizedCurrentVersion) {
    throw new Error(`VERSION_CONFLICT: ${documentLabel} đã được cập nhật bởi thao tác khác. Vui lòng tải lại trước khi tiếp tục.`);
  }
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
    throw new Error("Tài khoản Thợ chưa được gắn với hồ sơ nhân viên hợp lệ.");
  }
  const candidate = targetId
    ? findPurchaseLine(state, (purchaseOrder, line) => purchaseOrder.id === targetId || line.id === targetId)
    : findNextWarehouseReceipt(state);
  const purchaseOrder = candidate?.purchaseOrder;
  const line = candidate?.line;
  if (!purchaseOrder || !line) {
    throw new Error("Không tìm thấy dòng mua cần gửi phiếu nhập.");
  }
  assertExpectedPurchaseOrderVersion(purchaseOrder, options?.expectedVersion);
  if (purchaseOrder.status === "draft" || line.destinationType !== "warehouse" || !line.warehouseId) {
    throw new Error("Dòng mua chưa sẵn sàng để gửi phiếu nhập kho.");
  }
  if (line.receivedQuantity >= line.orderedQuantity) {
    throw new Error("Dòng mua đã nhập đủ, không thể gửi lại phiếu.");
  }
  if (findPendingApprovalRequest(state, "goods_receipt", line.id)) {
    throw new Error("Dòng mua này đang chờ Chủ cửa hàng hoặc Kế toán duyệt.");
  }

  const remainingQuantity = line.orderedQuantity - line.receivedQuantity;
  const receivedQuantity = options?.quantity ?? remainingQuantity;
  if (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0 || receivedQuantity > remainingQuantity) {
    throw new Error(`Số lượng nhập phải lớn hơn 0 và không vượt ${remainingQuantity}.`);
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
  incrementPurchaseOrderVersion(purchaseOrder);
  return `Đã gửi phiếu nhập ${receivedQuantity} cho ${purchaseOrder.documentNo}; chờ Chủ cửa hàng hoặc Kế toán duyệt.`;
}

function approveGoodsReceipt(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  assertApprovalActor(actor);
  const request = findApprovalRequest(state, "goods_receipt", targetId);
  if (!request || request.status !== "pending" || !request.quantity) {
    throw new Error("Không tìm thấy phiếu nhập đang chờ duyệt.");
  }
  postGoodsReceipt(state, now, request.targetId, {
    quantity: request.quantity,
    expectedVersion: options?.expectedVersion
  }, true);
  request.status = "approved";
  request.approvedBy = actor.id;
  request.approvedByName = actor.displayName;
  request.approvedAt = now;
  return `Đã duyệt và ghi nhận phiếu nhập ${request.documentNo}.`;
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
  const reason = requireReason(options?.reason, "Từ chối phiếu nhập");
  if (!request || request.status !== "pending") {
    throw new Error("Không tìm thấy phiếu nhập đang chờ duyệt.");
  }
  const candidate = findPurchaseLine(state, (_purchaseOrder, line) => line.id === request.targetId);
  if (!candidate) {
    throw new Error("Không tìm thấy dòng mua của phiếu nhập chờ duyệt.");
  }
  assertExpectedPurchaseOrderVersion(candidate.purchaseOrder, options?.expectedVersion);
  request.status = "rejected";
  request.rejectionReason = reason;
  request.approvedBy = actor.id;
  request.approvedByName = actor.displayName;
  request.approvedAt = now;
  incrementPurchaseOrderVersion(candidate.purchaseOrder);
  return `Đã từ chối phiếu nhập ${request.documentNo}; lý do: ${reason}.`;
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
    throw new Error(targetId ? "Không tìm thấy dòng mua cần nhập kho." : "Không tìm thấy đơn mua nhập kho.");
  }
  assertExpectedPurchaseOrderVersion(purchaseOrder, options?.expectedVersion);
  if (purchaseOrder.status === "draft") {
    throw new Error("Cần xác nhận đơn mua trước khi nhập kho.");
  }
  if (line.destinationType !== "warehouse" || !line.warehouseId) {
    throw new Error("Dòng mua này không phải nhập kho cửa hàng.");
  }
  if (line.receivedQuantity >= line.orderedQuantity) {
    throw new Error("Dòng mua đã nhập đủ, không thể ghi nhận lại.");
  }

  if (!bypassApproval && findPendingApprovalRequest(state, "goods_receipt", line.id)) {
    throw new Error("Dòng mua này đang chờ Chủ cửa hàng hoặc Kế toán duyệt.");
  }

  const remainingQuantity = line.orderedQuantity - line.receivedQuantity;
  const receivedQuantity = options?.quantity ?? remainingQuantity;
  if (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0 || receivedQuantity > remainingQuantity) {
    throw new Error(`Số lượng nhập phải lớn hơn 0 và không vượt ${remainingQuantity}.`);
  }

  const postingKey = nextPostingKey(state, `receipt-${line.id}`);
  assertNoInventoryPosting(state, postingKey);

  line.receivedQuantity += receivedQuantity;
  syncPurchaseOrderStatus(purchaseOrder);
  incrementPurchaseOrderVersion(purchaseOrder);

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

  return `Ghi nhận nhập ${receivedQuantity} cho ${purchaseOrder.documentNo}; còn ${line.orderedQuantity - line.receivedQuantity} chưa nhận.`;
}

function assertExpectedPurchaseOrderVersion(order: { version?: number }, expectedVersion: number | undefined) {
  if (expectedVersion === undefined) return;
  const currentVersion = order.version ?? 1;
  if (currentVersion !== expectedVersion) {
    throw new Error("VERSION_CONFLICT: PURCHASE_ORDER_VERSION_MISMATCH");
  }
}

function incrementPurchaseOrderVersion(order: { version?: number }) {
  order.version = (order.version ?? 1) + 1;
}

function postInventoryTransfer(state: OperationsState, now: string, options?: OperationOptions) {
  const sourceWarehouse = state.warehouses.find((item) => item.id === options?.sourceWarehouseId && item.status === "active");
  const destinationWarehouse = state.warehouses.find((item) => item.id === options?.destinationWarehouseId && item.status === "active");
  const product = state.productUnits.find((item) => item.id === options?.productUnitId && item.status === "active");
  const quantity = options?.quantity ?? Number.NaN;
  const reason = requireReason(options?.reason, "Chuyển kho");
  if (!sourceWarehouse || !destinationWarehouse || !product) {
    throw new Error("Chuyển kho cần kho đi, kho đến và vật tư hợp lệ.");
  }
  if (sourceWarehouse.id === destinationWarehouse.id) {
    throw new Error("Kho đi và kho đến phải khác nhau.");
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Số lượng chuyển kho phải lớn hơn 0.");
  }
  if (stockBalance(state, sourceWarehouse.id, product.id) < quantity) {
    throw new Error("Tồn kho nguồn không đủ để chuyển.");
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
  return `Chuyển ${quantity} ${product.unitName} ${product.productName} từ ${sourceWarehouse.name} sang ${destinationWarehouse.name}.`;
}

function postInventoryCountAdjustment(state: OperationsState, now: string, options: OperationOptions | undefined, actor: OperationsActor) {
  const warehouse = state.warehouses.find((item) => item.id === options?.warehouseId && item.status === "active");
  const product = state.productUnits.find((item) => item.id === options?.productUnitId && item.status === "active");
  const countedQuantity = options?.countedQuantity ?? Number.NaN;
  requireReason(options?.reason, "Kiểm kê");
  if (!warehouse || !product) {
    throw new Error("Kiểm kê cần kho và vật tư hợp lệ.");
  }
  if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
    throw new Error("Số lượng kiểm kê không được âm.");
  }
  const session = createInventoryCountSession(state, now, { warehouseId: warehouse.id }, actor, [product.id]);
  return `${session} Số đếm cũ chưa được ghi vào kho; hãy lưu lại số đếm kèm ảnh hoặc biên bản rồi gửi duyệt.`;
}

function createInventoryCountSession(
  state: OperationsState,
  now: string,
  options: OperationOptions | undefined,
  actor: OperationsActor,
  onlyProductIds?: string[]
) {
  const warehouse = state.warehouses.find((item) => item.id === options?.warehouseId && item.status === "active");
  if (!warehouse) throw new Error("Chọn kho đang hoạt động để kiểm kê.");
  const sessions = state.inventoryCountSessions ?? (state.inventoryCountSessions = []);
  const selected = onlyProductIds
    ? state.productUnits.filter((product) => onlyProductIds.includes(product.id) && product.status === "active")
    : state.productUnits.filter((product) => product.status === "active" && (
      state.inventoryMovements.some((movement) => movement.warehouseId === warehouse.id && movement.productUnitId === product.id) ||
      product.reorderPolicies?.some((policy) => policy.warehouseId === warehouse.id)
    ));
  if (selected.length === 0) throw new Error("Kho này chưa có vật tư để kiểm. Có thể tạo phiếu sau khi thêm vật tư hoặc cấu hình ngưỡng tồn.");
  const sequence = sessions.length + state.inventoryMovements.filter((movement) => movement.sourceDocument.startsWith("KK-")).length + 1;
  const session: InventoryCountSession = {
    id: nextId("kks", sessions.length),
    documentNo: `KK-${String(sequence).padStart(6, "0")}`,
    warehouseId: warehouse.id,
    status: "draft",
    version: 1,
    createdBy: actor.id,
    createdByName: actor.displayName,
    createdAt: now,
    lines: selected.map((product, index) => createInventoryCountLine(state, warehouse.id, product.id, sessions.length * 1000 + index))
  };
  sessions.push(session);
  return `Đã tạo phiếu kiểm kê ${session.documentNo} tại ${warehouse.name}.`;
}

function createInventoryCountLine(state: OperationsState, warehouseId: string, productUnitId: string, offset: number): InventoryCountLine {
  return {
    id: nextId("kkl", offset),
    productUnitId,
    bookQuantity: stockBalance(state, warehouseId, productUnitId),
    movementFingerprint: inventoryMovementFingerprint(state, warehouseId, productUnitId),
    unitCost: movingAverageCost(state, warehouseId, productUnitId),
    attachments: [],
    status: "pending"
  };
}

function addInventoryCountLine(state: OperationsState, targetId: string | undefined, options?: OperationOptions) {
  const session = requireInventoryCountSession(state, targetId);
  assertInventoryCountSessionVersion(session, options?.expectedVersion);
  if (!["draft", "counting", "needs_recount"].includes(session.status)) throw new Error("Chỉ được thêm vật tư khi phiếu đang kiểm.");
  const product = state.productUnits.find((item) => item.id === options?.productUnitId && item.status === "active");
  if (!product) throw new Error("Chọn vật tư đang hoạt động để thêm vào phiếu kiểm kê.");
  if (session.lines.some((line) => line.productUnitId === product.id)) throw new Error("Vật tư này đã có trong phiếu kiểm kê.");
  session.lines.push(createInventoryCountLine(state, session.warehouseId, product.id, session.lines.length + 1));
  session.status = "counting";
  session.version += 1;
  return `Đã thêm ${product.productName} vào phiếu ${session.documentNo}.`;
}

function recordInventoryCountLine(state: OperationsState, now: string, targetId: string | undefined, options: OperationOptions | undefined, actor: OperationsActor) {
  const session = requireInventoryCountSession(state, targetId);
  assertInventoryCountSessionVersion(session, options?.expectedVersion);
  if (!["draft", "counting", "needs_recount"].includes(session.status)) throw new Error("Phiếu kiểm kê này không còn ở bước nhập số đếm.");
  const line = session.lines.find((item) => item.id === options?.productUnitId);
  if (!line) throw new Error("Không tìm thấy dòng kiểm kê cần lưu.");
  if (options?.skipCountLine) {
    line.status = "skipped";
    session.status = "counting";
    session.version += 1;
    return `Đã bỏ qua dòng ${line.id}; dòng này không được ghi chênh lệch kho.`;
  }
  const countedQuantity = options?.countedQuantity ?? Number.NaN;
  if (!Number.isFinite(countedQuantity) || countedQuantity < 0) throw new Error("Số đếm thực tế không được âm.");
  const differenceQuantity = countedQuantity - line.bookQuantity;
  const attachments = options?.attachments ?? [];
  if (differenceQuantity !== 0) {
    const reason = requireReason(options?.reason, "Chênh lệch kiểm kê");
    if (attachments.length === 0) throw new Error("Chênh lệch kiểm kê cần ít nhất một ảnh hoặc biên bản riêng tư.");
    line.reason = reason;
  } else {
    line.reason = options?.reason?.trim() || undefined;
  }
  line.countedQuantity = countedQuantity;
  line.differenceQuantity = differenceQuantity;
  line.estimatedDifferenceValue = differenceQuantity * line.unitCost;
  line.attachments = [...line.attachments, ...attachments];
  line.status = "counted";
  line.countedBy = actor.id;
  line.countedByName = actor.displayName;
  line.countedAt = now;
  session.status = "counting";
  session.version += 1;
  return `Đã lưu số đếm cho dòng ${line.id} của phiếu ${session.documentNo}.`;
}

function submitInventoryCountSession(state: OperationsState, now: string, targetId: string | undefined, options: OperationOptions | undefined, actor: OperationsActor) {
  const session = requireInventoryCountSession(state, targetId);
  assertInventoryCountSessionVersion(session, options?.expectedVersion);
  if (!["draft", "counting", "needs_recount"].includes(session.status)) throw new Error("Phiếu kiểm kê này không thể gửi duyệt ở trạng thái hiện tại.");
  if (!session.lines.some((line) => line.status === "counted")) throw new Error("Nhập số đếm cho ít nhất một dòng trước khi gửi duyệt.");
  if (session.lines.some((line) => !["counted", "skipped"].includes(line.status))) throw new Error("Hoàn tất hoặc bỏ qua từng dòng trước khi gửi duyệt.");
  assertInventoryCountEvidence(session);
  session.status = "submitted";
  session.submittedBy = actor.id;
  session.submittedByName = actor.displayName;
  session.submittedAt = now;
  session.version += 1;
  return `Đã gửi phiếu ${session.documentNo} chờ Chủ cửa hàng hoặc Kế toán duyệt.`;
}

function requestInventoryCountRecount(state: OperationsState, now: string, targetId: string | undefined, options: OperationOptions | undefined, actor: OperationsActor) {
  const session = requireInventoryCountSession(state, targetId);
  assertInventoryCountSessionVersion(session, options?.expectedVersion);
  if (!["submitted", "needs_recount"].includes(session.status)) throw new Error("Chỉ yêu cầu kiểm lại phiếu đang chờ duyệt.");
  const reason = requireReason(options?.reason, "Yêu cầu kiểm lại");
  for (const line of session.lines) {
    if (line.status === "counted") {
      line.status = "needs_recount";
      line.recountRequiredAt = now;
    }
  }
  session.status = "needs_recount";
  session.rejectionReason = reason;
  session.reviewedBy = actor.id;
  session.reviewedByName = actor.displayName;
  session.reviewedAt = now;
  session.version += 1;
  return `Đã yêu cầu kiểm lại phiếu ${session.documentNo}: ${reason}`;
}

function approveInventoryCountSession(state: OperationsState, now: string, targetId: string | undefined, options: OperationOptions | undefined, actor: OperationsActor) {
  const session = requireInventoryCountSession(state, targetId);
  assertInventoryCountSessionVersion(session, options?.expectedVersion);
  if (session.status !== "submitted") throw new Error("Chỉ duyệt phiếu kiểm kê đang chờ duyệt.");
  assertInventoryCountEvidence(session);
  const staleLines = session.lines.filter((line) => line.status === "counted" && line.movementFingerprint !== inventoryMovementFingerprint(state, session.warehouseId, line.productUnitId));
  if (staleLines.length > 0) {
    for (const line of staleLines) {
      line.status = "needs_recount";
      line.recountRequiredAt = now;
    }
    session.status = "needs_recount";
    session.rejectionReason = "Tồn sổ đã thay đổi trong lúc kiểm, cần kiểm lại các dòng bị ảnh hưởng.";
    session.reviewedBy = actor.id;
    session.reviewedByName = actor.displayName;
    session.reviewedAt = now;
    session.version += 1;
    return `Cần kiểm lại ${staleLines.length} dòng của phiếu ${session.documentNo} vì tồn sổ đã thay đổi.`;
  }
  for (const line of session.lines) {
    if (line.status === "skipped") continue;
    if (line.status !== "counted" || line.countedQuantity === undefined || line.differenceQuantity === undefined) throw new Error("Phiếu kiểm kê còn dòng chưa hoàn tất.");
    if (line.differenceQuantity !== 0) {
      if (stockBalance(state, session.warehouseId, line.productUnitId) + line.differenceQuantity < 0) throw new Error("Ghi chênh lệch sẽ làm âm tồn kho, cần kiểm lại số đếm.");
      const movement: InventoryMovement = {
        id: nextId("im", state.inventoryMovements.length),
        movementType: "adjustment",
        sourceDocument: session.documentNo,
        postingKey: `count-session-${session.id}-${line.id}`,
        warehouseId: session.warehouseId,
        productUnitId: line.productUnitId,
        quantity: line.differenceQuantity,
        unitCost: line.unitCost,
        postedAt: now,
        sourceLineId: line.id,
        reason: line.reason
      };
      state.inventoryMovements.push(movement);
      line.postedMovementId = movement.id;
    }
    line.status = "posted";
  }
  session.status = "posted";
  session.postedBy = actor.id;
  session.postedByName = actor.displayName;
  session.postedAt = now;
  session.reviewedBy = actor.id;
  session.reviewedByName = actor.displayName;
  session.reviewedAt = now;
  session.version += 1;
  return `Đã duyệt và ghi kho phiếu ${session.documentNo}.`;
}

function rejectInventoryCountSession(state: OperationsState, now: string, targetId: string | undefined, options: OperationOptions | undefined, actor: OperationsActor) {
  const session = requireInventoryCountSession(state, targetId);
  assertInventoryCountSessionVersion(session, options?.expectedVersion);
  if (!["submitted", "needs_recount"].includes(session.status)) throw new Error("Chỉ từ chối phiếu kiểm kê chưa ghi kho.");
  session.status = "rejected";
  session.rejectionReason = requireReason(options?.reason, "Từ chối kiểm kê");
  session.reviewedBy = actor.id;
  session.reviewedByName = actor.displayName;
  session.reviewedAt = now;
  session.version += 1;
  return `Đã từ chối phiếu ${session.documentNo}; chưa có phát sinh kho nào được tạo.`;
}

function reverseInventoryCountSession(state: OperationsState, now: string, targetId: string | undefined, options: OperationOptions | undefined, actor: OperationsActor) {
  const session = requireInventoryCountSession(state, targetId);
  assertInventoryCountSessionVersion(session, options?.expectedVersion);
  if (session.status !== "posted") throw new Error("Chỉ đảo phiếu kiểm kê đã ghi kho.");
  const reason = requireReason(options?.reason, "Đảo phiếu kiểm kê");
  for (const line of session.lines) {
    if (line.postedMovementId) reverseInventoryMovement(state, now, line.postedMovementId, { reason }, true);
    if (line.status === "posted") line.status = "reversed";
  }
  session.status = "reversed";
  session.reversedBy = actor.id;
  session.reversedByName = actor.displayName;
  session.reversedAt = now;
  session.reversalReason = reason;
  session.version += 1;
  return `Đã đảo phiếu ${session.documentNo} bằng các phát sinh kho ngược chiều.`;
}

function requireInventoryCountSession(state: OperationsState, targetId?: string) {
  const session = state.inventoryCountSessions?.find((item) => item.id === targetId || item.documentNo === targetId);
  if (!session) throw new Error("Không tìm thấy phiếu kiểm kê.");
  return session;
}

function assertInventoryCountSessionVersion(session: InventoryCountSession, expectedVersion?: number) {
  if (expectedVersion === undefined || expectedVersion !== session.version) throw new Error("VERSION_CONFLICT: Phiếu kiểm kê đã thay đổi, hãy tải lại trước khi tiếp tục.");
}

function assertInventoryCountEvidence(session: InventoryCountSession) {
  for (const line of session.lines) {
    if (line.status !== "counted" || line.differenceQuantity === 0) continue;
    if ((line.reason?.trim().length ?? 0) < 5 || line.attachments.length === 0) throw new Error(`Dòng ${line.id} chênh lệch cần lý do và ít nhất một ảnh hoặc biên bản riêng tư.`);
  }
}

function inventoryMovementFingerprint(state: OperationsState, warehouseId: string, productUnitId: string) {
  return state.inventoryMovements
    .filter((movement) => movement.warehouseId === warehouseId && movement.productUnitId === productUnitId)
    .map((movement) => `${movement.id}:${movement.quantity}:${movement.reversedById ?? ""}`)
    .sort()
    .join("|");
}

function reverseInventoryMovement(state: OperationsState, now: string, targetId?: string, options?: OperationOptions, allowCountSession = false) {
  if (!targetId) {
    throw new Error("Chọn phát sinh kho cụ thể để đảo.");
  }
  const reason = requireReason(options?.reason, "Đảo phát sinh kho");
  const movement = state.inventoryMovements.find((item) => item.id === targetId || item.postingKey === targetId);
  if (!movement) {
    throw new Error("Không tìm thấy phát sinh kho cần đảo.");
  }
  if (!allowCountSession && state.inventoryCountSessions?.some((session) => session.documentNo === movement.sourceDocument && session.status === "posted")) {
    throw new Error("Phát sinh này thuộc phiếu kiểm kê; hãy dùng thao tác Đảo phiếu kiểm kê để đảo đủ các dòng.");
  }
  if (movement.movementType === "reverse") {
    throw new Error("Dòng đảo kho không được đảo tiếp.");
  }
  if (movement.reversedById || state.inventoryMovements.some((item) => item.postingKey === `reverse-${movement.id}`)) {
    throw new Error("Phát sinh kho này đã được đảo trước đó.");
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

  return `Đảo phát sinh kho ${movement.postingKey}; hệ thống ghi movement ngược chiều và bút toán công nợ liên quan.`;
}

function reverseInventoryTransfer(state: OperationsState, movement: InventoryMovement, now: string, reason: string) {
  const related = movement.relatedMovementId
    ? state.inventoryMovements.find((item) => item.id === movement.relatedMovementId)
    : state.inventoryMovements.find((item) => item.sourceDocument === movement.sourceDocument && item.id !== movement.id &&
      (item.movementType === "transfer_out" || item.movementType === "transfer_in"));
  if (!related || related.reversedById) {
    throw new Error("Không tìm thấy cặp phát sinh chuyển kho hợp lệ để đảo.");
  }
  const pair = [movement, related];
  for (const item of pair) {
    if (stockBalance(state, item.warehouseId, item.productUnitId) - item.quantity < 0) {
      throw new Error("Đảo chuyển kho sẽ làm âm tồn tại kho nhận; cần xử lý lượng đã xuất tiếp trước.");
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
  return `Đảo chứng từ chuyển kho ${movement.sourceDocument}; đã ghi đủ hai movement ngược chiều.`;
}

function confirmDirectDelivery(state: OperationsState, now: string, targetId: string | undefined, options: OperationOptions | undefined, actor: OperationsActor) {
  if (!["owner", "accountant", "warehouse"].includes(actor.role)) {
    throw new Error("Chỉ Chủ cửa hàng, Kế toán hoặc Kho được duyệt xác nhận giao thẳng.");
  }
  const candidate = targetId ? findDirectDeliveryByPurchaseLineId(state, targetId) : findNextDirectDelivery(state);
  const purchaseOrder = candidate?.purchaseOrder;
  const purchaseLine = candidate?.purchaseLine;
  const salesOrder = candidate?.salesOrder;
  const salesLine = candidate?.salesLine;
  if (!purchaseOrder || !purchaseLine || !salesOrder || !salesLine) {
    throw new Error(targetId ? "Không tìm thấy dòng giao thẳng cần xác nhận." : "Không tìm thấy dữ liệu giao thẳng.");
  }
  if (purchaseOrder.status === "draft") {
    throw new Error("Cần xác nhận đơn mua trước khi giao thẳng.");
  }
  if (purchaseLine.destinationType !== "customer_direct") {
    throw new Error("Dòng mua này không phải giao thẳng khách.");
  }
  if (purchaseLine.receivedQuantity >= purchaseLine.orderedQuantity) {
    throw new Error("Giao thẳng đã xác nhận trước đó.");
  }
  if (state.inventoryMovements.some((movement) => movement.postingKey === `receipt-${purchaseLine.id}`)) {
    throw new Error("Giao thẳng không được tạo phát sinh kho cửa hàng.");
  }

  const purchaseRemaining = purchaseLine.orderedQuantity - purchaseLine.receivedQuantity;
  const directAllocation = salesLine.allocations?.find((allocation) =>
    allocation.sourceType === "direct_supplier" && allocation.purchaseOrderLineId === purchaseLine.id && allocation.status !== "cancelled"
  );
  if (salesLine.allocations && !directAllocation) throw new Error("Dòng mua không còn allocation giao thẳng hợp lệ trên đơn bán.");
  const salesRemaining = directAllocation ? openAllocationQuantity(directAllocation) : salesLine.quantity - salesLine.deliveredQuantity;
  const maxQuantity = Math.min(purchaseRemaining, salesRemaining);
  const deliveredQuantity = options?.quantity ?? maxQuantity;
  if (!Number.isFinite(deliveredQuantity) || deliveredQuantity <= 0 || deliveredQuantity > maxQuantity) {
    throw new Error(`Số lượng giao thẳng phải lớn hơn 0 và không vượt ${maxQuantity}.`);
  }

  purchaseLine.receivedQuantity += deliveredQuantity;
  syncPurchaseOrderStatus(purchaseOrder);
  salesLine.deliveredQuantity += deliveredQuantity;
  if (directAllocation) {
    directAllocation.deliveredQuantity += deliveredQuantity;
    syncAllocationStatus(directAllocation);
  }
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
        postingDate: now,
        dueDate: deliveryDueDate(salesOrder, now),
        collectionOwnerEmployeeId: state.customers.find((customer) => customer.id === salesOrder.customerId)?.collectionOwnerEmployeeId
      })
    );

  return `Xác nhận giao thẳng ${deliveredQuantity}: không tạo nhập/xuất kho, đã ghi phải thu và phải trả.`;
}

function reverseDirectDelivery(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  if (!targetId) {
    throw new Error("Chọn dòng mua giao thẳng cụ thể để đảo.");
  }
  const reason = requireReason(options?.reason, "Đảo giao thẳng");
  const candidate = findPurchaseLine(state, (_order, line) => line.id === targetId && line.destinationType === "customer_direct");
  const purchaseOrder = candidate?.purchaseOrder;
  const purchaseLine = candidate?.line;
  if (!purchaseOrder || !purchaseLine || !purchaseLine.salesOrderLineId || purchaseLine.receivedQuantity <= 0) {
    throw new Error("Không tìm thấy lần giao thẳng đã ghi nhận để đảo.");
  }
  const salesOrder = state.salesOrders.find((order) => order.lines.some((line) => line.id === purchaseLine.salesOrderLineId));
  const salesLine = salesOrder?.lines.find((line) => line.id === purchaseLine.salesOrderLineId);
  if (!salesOrder || !salesLine) {
    throw new Error("Dòng giao thẳng không còn liên kết đơn bán hợp lệ.");
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
    throw new Error("Không tìm thấy cặp bút toán giao thẳng có thể đảo.");
  }
  if (customerAllocatedAmountForLedgerEntry(state, receivable.id) > 0) {
    throw new Error("Cần đảo hoặc bỏ phân bổ phiếu thu trước khi đảo giao thẳng.");
  }
  if (supplierAllocatedAmountForLedgerEntry(state, posting.id) > 0) {
    throw new Error("Cần đảo phiếu chi nhà cung cấp liên quan trước khi đảo giao thẳng.");
  }
  if (purchaseLine.receivedQuantity < quantity || salesLine.deliveredQuantity < quantity) {
    throw new Error("Số lượng giao thẳng hiện tại không đủ để đảo lần ghi nhận này.");
  }

  purchaseLine.receivedQuantity -= quantity;
  salesLine.deliveredQuantity -= quantity;
  const directAllocation = salesLine.allocations?.find((allocation) =>
    allocation.sourceType === "direct_supplier" && allocation.purchaseOrderLineId === purchaseLine.id && allocation.deliveredQuantity >= quantity
  );
  if (salesLine.allocations && !directAllocation) throw new Error("Không tìm thấy allocation giao thẳng để đảo số lượng.");
  if (directAllocation) {
    directAllocation.deliveredQuantity -= quantity;
    syncAllocationStatus(directAllocation);
  }
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

  return `Đảo lần giao thẳng ${posting.postingGroupId}; giảm ${quantity} và ghi hai bút toán ngược với lý do: ${reason}.`;
}

function startDeliveryLoading(state: OperationsState, targetId?: string) {
  const candidate = findNextDeliveryByStatus(state, ["assigned"], targetId);
  if (!candidate) {
    throw new Error(targetId ? "Chuyến giao này không ở trạng thái chờ bốc hàng." : "Không còn chuyến giao nào chờ bốc hàng.");
  }

  candidate.job.status = "loading";
  candidate.job.evidence = "Đang bốc hàng, chờ tài xế xác nhận xuất bến.";

  return `Bắt đầu bốc hàng chuyến ${candidate.job.documentNo}; chưa ghi xuất kho hoặc công nợ.`;
}

function dispatchDelivery(state: OperationsState, targetId?: string) {
  const candidate = findNextDeliveryByStatus(state, ["loading"], targetId);
  if (!candidate) {
    throw new Error(targetId ? "Chuyến giao này chưa ở trạng thái đang bốc hàng." : "Không còn chuyến giao nào đang bốc hàng.");
  }

  candidate.job.status = "in_transit";
  candidate.job.evidence = "Đã xuất bến, đang giao cho khách.";

  return `Xuất bến chuyến ${candidate.job.documentNo}; chờ xác nhận giao thành công trước khi ghi xuất kho.`;
}

function updateProductCommercialPolicy(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  if (!["owner", "administrator", "sales"].includes(actor.role)) {
    throw new Error("Chỉ Chủ cửa hàng hoặc nhân viên được cấp quyền mới được đổi chính sách giá.");
  }
  const product = state.productUnits.find((item) => item.id === targetId && item.status === "active");
  if (!product) throw new Error("Không tìm thấy vật tư đang hoạt động để cập nhật giá.");
  const reason = requireReason(options?.reason, "Đổi chính sách thương mại");
  const previous = {
    salePrice: product.salePrice,
    saleTaxRate: product.saleTaxRate,
    targetMarginRate: product.targetMarginRate,
    standardLeadTimeDays: product.standardLeadTimeDays
  };
  const next = {
    salePrice: options?.salePrice ?? product.salePrice,
    saleTaxRate: options?.saleTaxRate ?? product.saleTaxRate,
    targetMarginRate: options?.targetMarginRate ?? product.targetMarginRate,
    standardLeadTimeDays: options?.standardLeadTimeDays ?? product.standardLeadTimeDays
  };
  const nextVisibleOnCustomerPortal = options?.visibleOnCustomerPortal ?? product.visibleOnCustomerPortal ?? true;
  const nextOrderableOnline = options?.orderableOnline ?? product.orderableOnline ?? true;
  if (typeof nextVisibleOnCustomerPortal !== "boolean" || typeof nextOrderableOnline !== "boolean") {
    throw new Error("Chính sách hiển thị và đặt trực tuyến không hợp lệ.");
  }
  if (next.salePrice !== undefined && (!Number.isFinite(next.salePrice) || next.salePrice < 0)) throw new Error("Giá bán phải là số không âm.");
  if (next.saleTaxRate !== undefined && (!Number.isFinite(next.saleTaxRate) || next.saleTaxRate < 0 || next.saleTaxRate > 1)) throw new Error("VAT phải từ 0 đến 1.");
  if (next.targetMarginRate !== undefined && (!Number.isFinite(next.targetMarginRate) || next.targetMarginRate < 0 || next.targetMarginRate >= 1)) throw new Error("Biên lợi nhuận mục tiêu phải từ 0 đến nhỏ hơn 1.");
  if (next.standardLeadTimeDays !== undefined && (!Number.isInteger(next.standardLeadTimeDays) || next.standardLeadTimeDays < 0 || next.standardLeadTimeDays > 365)) throw new Error("Thời gian giao chuẩn phải là số ngày từ 0 đến 365.");

  const reorderPolicies = options?.reorderPolicies?.map((policy) => {
    if (!state.warehouses.some((warehouse) => warehouse.id === policy.warehouseId && warehouse.status === "active")) {
      throw new Error("Ngưỡng tồn phải thuộc kho đang hoạt động.");
    }
    if (!Number.isFinite(policy.minimumQuantity) || policy.minimumQuantity < 0) throw new Error("Ngưỡng tồn tối thiểu không hợp lệ.");
    return { warehouseId: policy.warehouseId, minimumQuantity: policy.minimumQuantity, updatedAt: now, updatedBy: actor.id };
  });
  const priceChanged = JSON.stringify(previous) !== JSON.stringify(next);
  const reorderChanged = reorderPolicies !== undefined && JSON.stringify(product.reorderPolicies ?? []) !== JSON.stringify(reorderPolicies);
  const portalPolicyChanged = product.visibleOnCustomerPortal !== nextVisibleOnCustomerPortal || product.orderableOnline !== nextOrderableOnline;
  if (!priceChanged && !reorderChanged && !portalPolicyChanged) throw new Error("Không có thay đổi giá, ngưỡng tồn hoặc chính sách portal để lưu.");

  if (priceChanged) {
    product.priceHistory ??= [];
    product.priceHistory.push({
      id: `${product.id}-price-${product.priceHistory.length + 1}`,
      version: product.priceHistory.length + 1,
      previous,
      next,
      reason,
      changedBy: actor.id,
      changedByName: actor.displayName,
      changedAt: now
    });
    product.salePrice = next.salePrice;
    product.saleTaxRate = next.saleTaxRate;
    product.targetMarginRate = next.targetMarginRate;
    product.standardLeadTimeDays = next.standardLeadTimeDays;
  }
  if (reorderPolicies !== undefined) product.reorderPolicies = reorderPolicies;
  product.visibleOnCustomerPortal = nextVisibleOnCustomerPortal;
  product.orderableOnline = nextOrderableOnline;
  return `Đã lưu chính sách thương mại và portal của ${product.productName}; giá mới chỉ áp dụng cho chứng từ tạo sau thời điểm này.`;
}

function postOpeningInventory(state: OperationsState, now: string, options?: OperationOptions) {
  const warehouse = state.warehouses.find((item) => item.id === options?.warehouseId && item.status === "active");
  const product = state.productUnits.find((item) => item.id === options?.productUnitId && item.status === "active");
  const quantity = options?.quantity ?? Number.NaN;
  const unitCost = options?.unitCost ?? Number.NaN;
  const reason = requireReason(options?.reason, "Ghi tồn đầu kỳ");
  if (!warehouse || !product) {
    throw new Error("Tồn đầu kỳ cần kho và vật tư đang hoạt động.");
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Số lượng tồn đầu kỳ phải lớn hơn 0.");
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    throw new Error("Đơn giá vốn tồn đầu kỳ không được âm.");
  }

  const sequence = state.inventoryMovements.filter((item) => item.sourceDocument.startsWith("TDK-")).length + 1;
  const sourceDocument = `TDK-${String(sequence).padStart(6, "0")}`;
  state.inventoryMovements.push({
    id: nextId("im", state.inventoryMovements.length),
    movementType: "opening",
    sourceDocument,
    postingKey: `opening-${sourceDocument}`,
    warehouseId: warehouse.id,
    productUnitId: product.id,
    quantity,
    unitCost,
    postedAt: now,
    reason
  });
  return `Đã ghi tồn đầu kỳ ${quantity} ${product.unitName} ${product.productName} tại ${warehouse.name}.`;
}

function assignSalesWorkOrder(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  if (!targetId || !options?.employeeId) throw new Error("Cần chọn công việc và thợ được chỉ định.");
  if (!["owner", "administrator", "supervisor", "dispatcher"].includes(actor.role)) {
    throw new Error("Chỉ quản lý hoặc điều phối mới được chỉ định công việc.");
  }
  const workOrder = state.workOrders.find((item) => item.id === targetId);
  if (!workOrder || !workOrder.salesOrderId) throw new Error("Không tìm thấy công việc gắn với đơn bán.");
  const worker = state.employees.find((item) => item.id === options.employeeId && item.status === "active" && item.roleType === "worker");
  if (!worker) throw new Error("Thợ được chỉ định không hợp lệ hoặc đã ngừng hoạt động.");
  assertExpectedWorkOrderVersion(workOrder, options.expectedVersion);
  if (workOrder.status !== "open" || workOrder.participants.length > 0) throw new Error(`${ORDER_ALREADY_CLAIMED}: Đơn đã được nhận hoặc đã chỉ định cho người khác.`);
  workOrder.status = "assigned";
  workOrder.participants = [{ employeeId: worker.id, shareFactor: 1 }];
  workOrder.claimedByEmployeeId = worker.id;
  workOrder.claimedAt = now;
  workOrder.version = (workOrder.version ?? 1) + 1;
  return `Quản lý đã chỉ định ${worker.displayName} cho ${workOrder.documentNo}.`;
}

function assignCustomerCollectionOwner(
  state: OperationsState,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  assertCollectionAdministrator(actor);
  const customer = state.customers.find((item) => item.id === targetId && item.status === "active");
  const employee = state.employees.find((item) => item.id === options?.employeeId && item.status === "active");
  if (!customer || !employee) throw new Error("Khách hàng hoặc người phụ trách thu hồi không hợp lệ.");
  customer.collectionOwnerEmployeeId = employee.id;
  return `Đã giao ${employee.displayName} phụ trách thu hồi công nợ của ${customer.displayName}.`;
}

function recordCustomerCollectionFollowUp(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  const customer = state.customers.find((item) => item.id === targetId && item.status === "active");
  if (!customer) throw new Error("Không tìm thấy khách hàng để ghi nhận thu hồi công nợ.");
  if (!isCollectionActorForCustomer(state, customer.collectionOwnerEmployeeId, actor)) {
    throw new Error("Bạn không được ghi nhận thu hồi cho khách hàng này.");
  }
  const note = requireReason(options?.reason, "Ghi nhận thu hồi công nợ");
  customer.collectionFollowUps ??= [];
  customer.collectionFollowUps.push({
    id: `${customer.id}-follow-up-${customer.collectionFollowUps.length + 1}`,
    status: options?.followUpStatus ?? "contacted",
    note,
    recordedBy: actor.id,
    recordedByName: actor.displayName,
    recordedAt: now
  });
  return `Đã lưu nhật ký thu hồi công nợ cho ${customer.displayName}.`;
}

function requestDeliveryQuantityChange(
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
    throw new Error("Thợ không được báo chênh lệch cho chuyến giao không được phân công.");
  }
  if (candidate.job.quantityChangeRequest?.status === "pending") throw new Error("Chuyến giao đang có yêu cầu chênh lệch chờ duyệt.");
  const reason = requireReason(options?.reason, "Báo chênh lệch số lượng giao");
  const warehouseLines = candidate.order.lines.filter(hasOpenWarehouseAllocation);
  const requestedLineQuantities: Record<string, number> = {};
  let hasDifference = false;
  for (const line of warehouseLines) {
    const remaining = warehouseOpenQuantityForJob(line, candidate.job);
    const requested = options?.lineQuantities?.[line.id] ?? remaining;
    if (!Number.isFinite(requested) || requested < 0 || requested > remaining) {
      throw new Error(`Số lượng đề nghị của dòng ${line.id} phải từ 0 đến ${remaining}.`);
    }
    requestedLineQuantities[line.id] = requested;
    hasDifference ||= requested !== remaining;
  }
  if (!hasDifference) throw new Error("Chỉ tạo báo chênh lệch khi số lượng đề nghị khác số còn phải giao.");
  const attachments = options?.attachments ?? [];
  if (attachments.length > 0) validateDeliveryCompletionAttachments(attachments, actor);
  candidate.job.quantityChangeRequest = {
    status: "pending",
    requestedLineQuantities,
    reason,
    attachments,
    submittedBy: actor.id,
    submittedByName: actor.displayName,
    submittedAt: now
  };
  return `Đã báo chênh lệch chuyến ${candidate.job.documentNo}; chờ Chủ cửa hàng/Kế toán duyệt số thực giao.`;
}

function approveDeliveryQuantityChange(state: OperationsState, now: string, targetId: string | undefined, actor: OperationsActor) {
  assertApprovalActor(actor);
  const job = state.deliveryJobs.find((item) => item.id === targetId);
  const request = job?.quantityChangeRequest;
  if (!job || job.status !== "in_transit" || !request || request.status !== "pending") {
    throw new Error("Không tìm thấy báo chênh lệch giao hàng đang chờ duyệt.");
  }
  request.status = "approved";
  request.approvedBy = actor.id;
  request.approvedByName = actor.displayName;
  request.approvedAt = now;
  return `Đã duyệt số lượng giao một phần cho chuyến ${job.documentNo}; người giao không thể tự sửa số lượng.`;
}

function rejectDeliveryQuantityChange(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  assertApprovalActor(actor);
  const job = state.deliveryJobs.find((item) => item.id === targetId);
  const request = job?.quantityChangeRequest;
  if (!job || !request || request.status !== "pending") throw new Error("Không tìm thấy báo chênh lệch giao hàng đang chờ duyệt.");
  request.status = "rejected";
  request.rejectionReason = requireReason(options?.reason, "Từ chối báo chênh lệch giao hàng");
  request.approvedBy = actor.id;
  request.approvedByName = actor.displayName;
  request.approvedAt = now;
  return `Đã từ chối báo chênh lệch của chuyến ${job.documentNo}; giữ nguyên số lượng còn phải giao.`;
}

function confirmCustomerDeliveryReceipt(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  const job = state.deliveryJobs.find((item) => item.id === targetId);
  const order = job ? state.salesOrders.find((item) => item.id === job.salesOrderId) : undefined;
  if (!job || !order || actor.role !== "customer" || !actor.customerId || actor.customerId !== order.customerId) {
    throw new Error("Bạn chỉ có thể xác nhận chuyến giao thuộc tài khoản khách hàng của mình.");
  }
  if (job.status !== "in_transit") throw new Error("Chỉ xác nhận ảnh khi chuyến đang giao.");
  if (job.customerConfirmation) throw new Error("Khách hàng đã xác nhận hoặc được miễn xác nhận ảnh cho chuyến này.");
  const attachments = options?.attachments ?? [];
  validateDeliveryCompletionAttachments(attachments, actor);
  job.customerConfirmation = {
    status: "confirmed",
    attachments,
    confirmedBy: actor.id,
    confirmedByName: actor.displayName,
    confirmedAt: now
  };
  return `Khách hàng đã gửi ảnh xác nhận nhận hàng cho chuyến ${job.documentNo}.`;
}

function waiveCustomerDeliveryReceipt(
  state: OperationsState,
  now: string,
  targetId: string | undefined,
  options: OperationOptions | undefined,
  actor: OperationsActor
) {
  if (actor.role !== "owner") throw new Error("Chỉ Chủ cửa hàng được miễn ảnh xác nhận nhận hàng của khách.");
  const job = state.deliveryJobs.find((item) => item.id === targetId);
  if (!job || job.status !== "in_transit" || job.customerConfirmation) throw new Error("Chuyến giao không đủ điều kiện miễn ảnh xác nhận.");
  job.customerConfirmation = {
    status: "waived",
    attachments: [],
    waivedBy: actor.id,
    waivedByName: actor.displayName,
    waivedAt: now,
    waiverReason: requireReason(options?.reason, "Miễn ảnh xác nhận của khách")
  };
  return `Chủ cửa hàng đã miễn ảnh xác nhận của khách cho chuyến ${job.documentNo}.`;
}

function assertCollectionAdministrator(actor: OperationsActor) {
  if (!["owner", "administrator", "accountant"].includes(actor.role)) {
    throw new Error("Chỉ Chủ cửa hàng, Quản trị hoặc Kế toán được giao người phụ trách thu hồi.");
  }
}

function isCollectionActorForCustomer(state: OperationsState, collectionOwnerEmployeeId: string | undefined, actor: OperationsActor) {
  if (["owner", "administrator", "accountant"].includes(actor.role)) return true;
  const employee = actor.employeeId
    ? state.employees.find((item) => item.id === actor.employeeId && item.status === "active")
    : undefined;
  return Boolean(collectionOwnerEmployeeId && employee?.id === collectionOwnerEmployeeId);
}

function deliveryDueDate(order: SalesOrder, fulfilledAt: string) {
  const paymentTermDays = order.commercialTerms?.paymentTermDays ?? 0;
  const fulfilledDate = new Date(fulfilledAt);
  fulfilledDate.setUTCDate(fulfilledDate.getUTCDate() + paymentTermDays);
  return fulfilledDate.toISOString().slice(0, 10);
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
    throw new Error("Thợ không được gửi xác nhận cho chuyến giao không được phân công.");
  }
  if (findPendingApprovalRequest(state, "delivery_completion", candidate.job.id)) {
    throw new Error("Chuyến giao này đang chờ Chủ cửa hàng hoặc Kế toán duyệt.");
  }

  const recipientName = options?.recipientName?.trim();
  const evidence = options?.evidence?.trim();
  if (!recipientName || !evidence) {
    throw new Error("Gửi xác nhận giao cần tên người nhận và bằng chứng giao nhận.");
  }
  const attachments = options?.attachments ?? [];
  validateDeliveryCompletionAttachments(attachments, actor);

  if (candidate.job.quantityChangeRequest?.status === "pending") {
    throw new Error("Cần chờ Chủ cửa hàng/Kế toán duyệt báo chênh lệch trước khi gửi xác nhận giao.");
  }
  const approvedLineQuantities = candidate.job.quantityChangeRequest?.status === "approved"
    ? candidate.job.quantityChangeRequest.requestedLineQuantities
    : undefined;
  const lineQuantities: Record<string, number> = {};
  for (const line of candidate.order.lines.filter(hasOpenWarehouseAllocation)) {
    const remainingQuantity = warehouseOpenQuantityForJob(line, candidate.job);
    const quantity = approvedLineQuantities?.[line.id] ?? remainingQuantity;
    if (quantity <= 0) {
      continue;
    }
    if (!Number.isFinite(quantity) || quantity > remainingQuantity) {
      throw new Error(`Số lượng giao của dòng ${line.id} không hợp lệ.`);
    }
    lineQuantities[line.id] = quantity;
  }
  if (Object.keys(lineQuantities).length === 0) {
    throw new Error("Nhập ít nhất một số lượng thực giao lớn hơn 0.");
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
  return `Đã gửi xác nhận giao ${candidate.job.documentNo}; chờ Chủ cửa hàng hoặc Kế toán duyệt.`;
}

function warehouseOpenQuantityForJob(line: SalesOrderLine, job: DeliveryJob) {
  const allocationIds = job.allocationIds ? new Set(job.allocationIds) : undefined;
  return salesSourceAllocations(line).reduce((sum, allocation) =>
    allocation.sourceType === "warehouse" &&
    allocation.status !== "cancelled" &&
    (!allocationIds || allocationIds.has(allocation.id))
      ? sum + openAllocationQuantity(allocation)
      : sum, 0);
}

function approveDeliveryCompletion(state: OperationsState, now: string, targetId: string | undefined, actor: OperationsActor) {
  assertApprovalActor(actor);
  const request = findApprovalRequest(state, "delivery_completion", targetId);
  if (!request || request.status !== "pending" || !request.lineQuantities || !request.recipientName || !request.evidence || !request.attachments?.length) {
    throw new Error("Không tìm thấy xác nhận giao đang chờ duyệt.");
  }
  const job = state.deliveryJobs.find((item) => item.id === request.targetId);
  if (!job?.customerConfirmation || !["confirmed", "waived"].includes(job.customerConfirmation.status)) {
    throw new Error("Cần ảnh xác nhận nhận hàng của khách hoặc miễn ảnh có lý do trước khi duyệt giao.");
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
  return `Đã duyệt và ghi nhận giao hàng ${request.documentNo}.`;
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
    throw new Error("Không tìm thấy xác nhận giao đang chờ duyệt.");
  }
  request.status = "rejected";
  request.rejectionReason = reason;
  request.approvedBy = actor.id;
  request.approvedByName = actor.displayName;
  request.approvedAt = now;
  return `Đã từ chối xác nhận giao ${request.documentNo}; lý do: ${reason}.`;
}

function completeDelivery(
  state: OperationsState,
  now: string,
  targetId?: string,
  options?: OperationOptions,
  bypassApproval = false,
  directActor?: OperationsActor
) {
  const candidate = findNextDeliveryCompletion(state, targetId);
  const order = candidate?.order;
  const job = candidate?.job;
  if (!bypassApproval && job && findPendingApprovalRequest(state, "delivery_completion", job.id)) {
    throw new Error("Chuyến giao này đang chờ Chủ cửa hàng hoặc Kế toán duyệt.");
  }
  if (!order || !job) {
    throw new Error("Cần xuất bến chuyến giao trước khi hoàn tất giao hàng.");
  }
  if (order.status !== "allocated" && order.status !== "partially_delivered") {
    throw new Error("Chỉ hoàn tất giao sau khi đơn đã phân bổ nguồn.");
  }
  if (job.status !== "in_transit") {
    throw new Error("Chỉ hoàn tất giao sau khi chuyến đã xuất bến.");
  }
  if (!bypassApproval && !job.customerConfirmation) {
    if (directActor?.role !== "owner") {
      throw new Error("Chỉ Chủ cửa hàng được miễn ảnh xác nhận của khách khi hoàn tất giao trực tiếp.");
    }
    const waiverReason = options?.reason?.trim() || options?.evidence?.trim();
    if (!waiverReason) throw new Error("Cần nêu lý do khi Chủ cửa hàng miễn ảnh xác nhận của khách.");
    job.customerConfirmation = {
      status: "waived",
      attachments: [],
      waivedBy: directActor.id,
      waivedByName: directActor.displayName,
      waivedAt: now,
      waiverReason
    };
  }
  const recipientName = options?.recipientName?.trim();
  const evidence = options?.evidence?.trim();
  if (!recipientName || !evidence) {
    throw new Error("Hoàn tất giao cần tên người nhận và bằng chứng giao nhận.");
  }

  const jobAllocationIds = new Set(job.allocationIds ?? order.lines.flatMap((line) =>
    salesSourceAllocations(line).filter((allocation) => allocation.sourceType === "warehouse").map((allocation) => allocation.id)
  ));
  const deliveryAllocations: Array<{ line: SalesOrderLine; allocation: SalesSourceAllocation; quantity: number }> = [];
  for (const line of order.lines) {
    const eligible = salesSourceAllocations(line).filter((allocation) =>
      allocation.sourceType === "warehouse" &&
      allocation.status !== "cancelled" &&
      jobAllocationIds.has(allocation.id) &&
      openAllocationQuantity(allocation) > 0
    );
    if (eligible.length === 0) continue;
    const eligibleOpen = eligible.reduce((sum, allocation) => sum + openAllocationQuantity(allocation), 0);
    let requestedLineQuantity = options?.lineQuantities
      ? (options.lineQuantities[line.id] ?? 0)
      : eligibleOpen;
    if (!Number.isFinite(requestedLineQuantity) || requestedLineQuantity < 0 || requestedLineQuantity > eligibleOpen) {
      throw new Error(`Số lượng giao của dòng ${line.id} phải từ 0 đến ${eligibleOpen}.`);
    }
    for (const allocation of eligible) {
      const requestedAllocationQuantity = options?.allocationQuantities?.[allocation.id];
      const quantity = requestedAllocationQuantity === undefined
        ? Math.min(requestedLineQuantity, openAllocationQuantity(allocation))
        : requestedAllocationQuantity;
      if (!Number.isFinite(quantity) || quantity < 0 || quantity > openAllocationQuantity(allocation)) {
        throw new Error(`Số lượng giao của nguồn ${allocation.id} không hợp lệ.`);
      }
      if (quantity > 0) deliveryAllocations.push({ line, allocation, quantity });
      requestedLineQuantity -= quantity;
    }
    if (requestedLineQuantity > 0.000001) throw new Error(`Số lượng giao của dòng ${line.id} chưa được phân bổ hết vào nguồn.`);
  }
  if (deliveryAllocations.length === 0) {
    throw new Error("Nhập ít nhất một số lượng thực giao lớn hơn 0.");
  }
  const projectedStock = new Map<string, number>();
  for (const { line, allocation, quantity } of deliveryAllocations) {
    if (!allocation.warehouseId) {
      throw new Error("Dòng xuất kho thiếu kho nguồn.");
    }
    const remainingQuantity = line.quantity - line.deliveredQuantity;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > remainingQuantity) {
      throw new Error(`Số lượng giao của dòng ${line.id} phải lớn hơn 0 và không vượt ${remainingQuantity}.`);
    }
    const stockKey = `${allocation.warehouseId}:${line.productUnitId}`;
    const available = projectedStock.get(stockKey) ?? stockBalance(state, allocation.warehouseId, line.productUnitId);
    const override = allocation.negativeStockOverrideRequestId
      ? state.approvalRequests.find((request) =>
          request.id === allocation.negativeStockOverrideRequestId &&
          request.type === "negative_stock_override" &&
          request.status === "approved" &&
          request.negativeStockLines?.some((approved) =>
            approved.salesOrderLineId === line.id &&
            approved.productUnitId === line.productUnitId &&
            approved.warehouseId === allocation.warehouseId &&
            approved.quantity >= allocation.allocatedQuantity
          )
        )
      : undefined;
    if (available < quantity && !override) {
      throw new Error("Không đủ tồn khả dụng để giao hàng.");
    }
    projectedStock.set(stockKey, available - quantity);
  }

  for (const { line, allocation, quantity } of deliveryAllocations) {
    const allocationCount = salesSourceAllocations(line).filter((item) => item.sourceType === "warehouse").length;
    const postingBase = allocationCount === 1
      ? `issue-${order.documentNo}-${line.id}`
      : `issue-${order.documentNo}-${line.id}-${allocation.id}`;
    const postingKey = nextPostingKey(state, postingBase);
    assertNoInventoryPosting(state, postingKey);
    const warehouseId = allocation.warehouseId ?? "wh-main";
    state.inventoryMovements.push({
      id: nextId("im", state.inventoryMovements.length),
      movementType: "issue",
      sourceDocument: order.documentNo,
      postingKey,
      sourceLineId: line.id,
      sourceAllocationId: allocation.id,
      negativeStockOverrideRequestId: allocation.negativeStockOverrideRequestId,
      warehouseId,
      productUnitId: line.productUnitId,
      quantity: -quantity,
      unitCost: inventoryIssueCost(state, warehouseId, line.productUnitId, Boolean(allocation.negativeStockOverrideRequestId)),
      postedAt: now
    });
    line.deliveredQuantity += quantity;
    allocation.deliveredQuantity += quantity;
    syncAllocationStatus(allocation);
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
        postingDate: now,
        dueDate: deliveryDueDate(order, now),
        collectionOwnerEmployeeId: state.customers.find((customer) => customer.id === order.customerId)?.collectionOwnerEmployeeId
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

  return `Hoàn tất chuyến ${job.documentNo}; xuất kho append-only và ghi phải thu phần giao từ kho.`;
}

function failDelivery(state: OperationsState, targetId?: string, options?: OperationOptions) {
  const candidate = findNextDeliveryByStatus(state, ["assigned", "loading", "in_transit"], targetId);
  if (!candidate) {
    throw new Error(targetId ? "Chuyến giao này không thể báo thất bại." : "Không còn chuyến giao nào có thể báo thất bại.");
  }

  const reason = requireReason(options?.reason, "Báo giao thất bại");
  candidate.job.status = "failed";
  candidate.job.failureReason = reason;
  candidate.job.evidence = reason;

  return `Báo thất bại chuyến ${candidate.job.documentNo}; không ghi xuất kho, không ghi công nợ.`;
}


function confirmCustomerPayment(state: OperationsState, now: string, targetId?: string) {
  const payment = targetId ? state.customerPayments.find((item) => item.id === targetId) : findNextCustomerPaymentConfirmation(state);
  if (!payment) {
    throw new Error(targetId ? "Không tìm thấy phiếu thu cần xác nhận." : "Không tìm thấy phiếu thu.");
  }
  if (payment.status !== "draft") {
    throw new Error("Phiếu thu đã được xác nhận.");
  }

  payment.status = "confirmed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiền mặt cửa hàng",
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

  return `Xác nhận phiếu thu ${payment.documentNo}; ghi tăng quỹ và giảm công nợ phải thu.`;
}

function allocateCustomerPayment(state: OperationsState, targetId?: string, options?: OperationOptions) {
  const payment = targetId
    ? state.customerPayments.find((item) => item.id === targetId)
    : state.customerPayments.find((item) => ["confirmed", "partially_allocated"].includes(item.status) && paymentAllocatedAmount(item) < item.amount);
  if (!payment) {
    throw new Error(targetId ? "Không tìm thấy phiếu thu cần phân bổ." : "Không tìm thấy phiếu thu.");
  }
  if (payment.status === "draft") {
    throw new Error("Phải xác nhận phiếu thu trước khi phân bổ.");
  }
  if (payment.status === "reversed") {
    throw new Error("Phiếu thu đã đảo, không được phân bổ tiếp.");
  }
  if (payment.status === "allocated") {
    throw new Error("Phiếu thu đã được phân bổ hết.");
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
  return `Phân bổ thêm ${formatAmount(totalAllocated - beforeAllocated)} từ ${payment.documentNo} vào ${plan.length} nghĩa vụ; còn ${formatAmount(payment.amount - totalAllocated)} chưa phân bổ.`;
}

function reverseCustomerPayment(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  if (!targetId) {
    throw new Error("Chọn phiếu thu cụ thể để đảo.");
  }
  requireReason(options?.reason, "Đảo phiếu thu");
  const payment = state.customerPayments.find((item) => item.id === targetId);
  if (!payment) {
    throw new Error("Không tìm thấy phiếu thu cần đảo.");
  }
  if (!["confirmed", "partially_allocated", "allocated"].includes(payment.status)) {
    throw new Error("Chỉ phiếu thu đã xác nhận hoặc đã phân bổ mới được đảo.");
  }

  const sourceDocument = reversalDocumentNo(payment.documentNo);
  payment.status = "reversed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiền mặt cửa hàng",
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

  return `Đảo phiếu thu ${payment.documentNo}; ghi giảm quỹ và mở lại công nợ bằng bút toán ngược.`;
}

function confirmSupplierPayment(state: OperationsState, now: string, targetId?: string) {
  const payment = targetId ? state.supplierPayments.find((item) => item.id === targetId) : findNextSupplierPaymentConfirmation(state);
  if (!payment) {
    throw new Error(targetId ? "Không tìm thấy phiếu chi nhà cung cấp cần xác nhận." : "Không tìm thấy phiếu chi nhà cung cấp.");
  }
  if (payment.status !== "draft") {
    throw new Error("Phiếu chi nhà cung cấp đã xác nhận.");
  }
  if (supplierBalance(state.supplierLedgerEntries, payment.supplierId) < payment.amount) {
    throw new Error("Số tiền chi vượt phải trả nhà cung cấp hiện tại.");
  }
  if (cashBalance(state) < payment.amount) {
    throw new Error("Quỹ tiền mặt không đủ để thanh toán nhà cung cấp.");
  }

  payment.status = "confirmed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiền mặt cửa hàng",
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

  return `Xác nhận phiếu chi ${payment.documentNo}; giảm phải trả nhà cung cấp.`;
}

function allocateSupplierPayment(state: OperationsState, targetId?: string, options?: OperationOptions) {
  const payment = targetId
    ? state.supplierPayments.find((item) => item.id === targetId)
    : state.supplierPayments.find((item) => ["confirmed", "partially_allocated"].includes(item.status) && paymentAllocatedAmount(item) < item.amount);
  if (!payment) {
    throw new Error(targetId ? "Không tìm thấy phiếu chi nhà cung cấp cần phân bổ." : "Không tìm thấy phiếu chi nhà cung cấp.");
  }
  if (payment.status === "draft") {
    throw new Error("Phải xác nhận phiếu chi trước khi phân bổ.");
  }
  if (payment.status === "reversed") {
    throw new Error("Phiếu chi đã đảo, không được phân bổ tiếp.");
  }
  if (payment.status === "allocated") {
    throw new Error("Phiếu chi đã được phân bổ hết.");
  }

  const beforeAllocated = paymentAllocatedAmount(payment);
  const plan = createAllocationPlan({
    remainingPayment: payment.amount - beforeAllocated,
    obligations: getOpenSupplierDebtObligations(state, payment.supplierId),
    requested: options?.allocations,
    invalidTargetMessage: "Dòng phân bổ phải là nghĩa vụ phải trả còn mở của đúng nhà cung cấp."
  });
  payment.allocations.push(...plan);

  const totalAllocated = paymentAllocatedAmount(payment);
  payment.status = amountsEqual(totalAllocated, payment.amount) ? "allocated" : "partially_allocated";
  return `Phân bổ thêm ${formatAmount(totalAllocated - beforeAllocated)} từ ${payment.documentNo} vào ${plan.length} nghĩa vụ; còn ${formatAmount(payment.amount - totalAllocated)} chưa phân bổ.`;
}

function reverseSupplierPayment(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  if (!targetId) {
    throw new Error("Chọn phiếu chi nhà cung cấp cụ thể để đảo.");
  }
  requireReason(options?.reason, "Đảo phiếu chi nhà cung cấp");
  const payment = state.supplierPayments.find((item) => item.id === targetId);
  if (!payment) {
    throw new Error("Không tìm thấy phiếu chi nhà cung cấp cần đảo.");
  }
  if (!["confirmed", "partially_allocated", "allocated"].includes(payment.status)) {
    throw new Error("Chỉ phiếu chi nhà cung cấp đã xác nhận hoặc đã phân bổ mới được đảo.");
  }

  const sourceDocument = reversalDocumentNo(payment.documentNo);
  payment.status = "reversed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiền mặt cửa hàng",
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

  return `Đảo phiếu chi ${payment.documentNo}; ghi tăng lại quỹ và phải trả nhà cung cấp.`;
}

function confirmCashVoucher(state: OperationsState, now: string, targetId?: string) {
  const voucher = targetId
    ? state.cashVouchers.find((item) => item.id === targetId)
    : state.cashVouchers.find((item) => item.status === "draft");
  if (!voucher) {
    throw new Error(targetId ? "Không tìm thấy phiếu quỹ cần xác nhận." : "Không còn phiếu quỹ nháp.");
  }
  if (voucher.status !== "draft") {
    throw new Error("Chỉ phiếu quỹ nháp mới được xác nhận.");
  }
  if (voucher.direction === "out" && cashBalance(state) < voucher.amount) {
    throw new Error("Tồn quỹ không đủ để xác nhận phiếu chi này.");
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

  return `Xác nhận ${voucher.documentNo}; đã ghi ${voucher.direction === "in" ? "tăng" : "giảm"} sổ quỹ.`;
}

function reverseCashVoucher(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  if (!targetId) {
    throw new Error("Chọn phiếu quỹ cụ thể để đảo.");
  }
  const voucher = state.cashVouchers.find((item) => item.id === targetId);
  if (!voucher) {
    throw new Error("Không tìm thấy phiếu quỹ cần đảo.");
  }
  if (voucher.status !== "confirmed") {
    throw new Error("Chỉ phiếu quỹ đã xác nhận mới được đảo.");
  }
  const reason = requireReason(options?.reason, "Đảo phiếu quỹ");
  if (voucher.direction === "in" && cashBalance(state) < voucher.amount) {
    throw new Error("Tồn quỹ không đủ để đảo phiếu thu này.");
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

  return `Đảo ${voucher.documentNo}; đã ghi bút toán quỹ ngược chiều với lý do: ${reason}.`;
}

function approveWorkOutput(state: OperationsState, targetId?: string, options?: OperationOptions) {
  const workOrder = targetId ? state.workOrders.find((item) => item.id === targetId) : state.workOrders.find((item) => item.status === "submitted");
  if (!workOrder) {
    throw new Error(targetId ? "Không tìm thấy phiếu công cần duyệt." : "Không tìm thấy phiếu công việc.");
  }
  assertExpectedWorkOrderVersion(workOrder, options?.expectedVersion);
  if (workOrder.status !== "submitted") {
    throw new Error("Chỉ duyệt sản lượng đang chờ duyệt.");
  }

  for (const output of workOrder.outputs) {
    output.approvedQuantity = output.actualQuantity;
    output.status = "approved";
  }
  workOrder.status = "approved";
  workOrder.version = (workOrder.version ?? 1) + 1;

  return `Duyệt sản lượng ${workOrder.documentNo}; output được khóa trước khi tính công.`;
}

function postCompensation(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  const workOrder = targetId
    ? state.workOrders.find((item) => item.id === targetId)
    : state.workOrders.find((item) => item.status === "approved") ?? state.workOrders.find((item) => item.status === "submitted");
  const batch = workOrder
    ? state.compensationBatches.find((item) => item.workOrderId === workOrder.id && item.status === "draft" && item.lines.length === 0)
    : undefined;
  if (!workOrder || !batch) {
    throw new Error("Không tìm thấy phiếu công hoặc bảng công.");
  }
  assertExpectedWorkOrderVersion(workOrder, options?.expectedVersion);
  if (workOrder.status !== "approved") {
    throw new Error("Chỉ tính công sau khi sản lượng được duyệt.");
  }
  if (batch.status !== "draft" || batch.lines.length > 0) {
    throw new Error("Bảng công đã được ghi nhận.");
  }

  const output = workOrder.outputs[0];
  if (!output || output.status !== "approved") {
    throw new Error("Output chưa được duyệt.");
  }
  const totalShare = workOrder.participants.reduce((sum, participant) => sum + participant.shareFactor, 0);
  if (totalShare <= 0) {
    throw new Error("Tổng hệ số chia công phải lớn hơn 0.");
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
    throw new Error("Tổng tiền chia cho thành viên phải bằng tổng tiền công của phiếu.");
  }

  output.status = "compensated";
  workOrder.status = "compensated";
  workOrder.version = (workOrder.version ?? 1) + 1;
  batch.status = "posted";

  return `Ghi nhận bảng công ${batch.documentNo}; ${batch.lines.length} nhân sự được ghi vào sổ tiền công.`;
}

function assertExpectedWorkOrderVersion(workOrder: WorkOrder, expectedVersion: number | undefined) {
  if (expectedVersion === undefined) return;
  const currentVersion = workOrder.version ?? 1;
  if (currentVersion !== expectedVersion) {
    throw new Error("VERSION_CONFLICT: Phiếu công đã được cập nhật bởi thao tác khác.");
  }
}

function payEmployee(state: OperationsState, now: string, targetId?: string) {
  const payment = targetId ? state.employeePayments.find((item) => item.id === targetId) : findNextEmployeePaymentConfirmation(state);
  if (!payment) {
    throw new Error(targetId ? "Không tìm thấy phiếu thanh toán nhân viên cần xác nhận." : "Không tìm thấy phiếu thanh toán nhân viên.");
  }
  if (payment.status !== "draft") {
    throw new Error("Phiếu thanh toán nhân viên đã xác nhận.");
  }
  const employeeBalance = employeePayableBalance(state, payment.employeeId);
  if (employeeBalance < payment.amount) {
    throw new Error("Số tiền thanh toán vượt công còn phải trả nhân viên.");
  }
  if (cashBalance(state) < payment.amount) {
    throw new Error("Quỹ tiền mặt không đủ để thanh toán nhân viên.");
  }

  payment.status = "confirmed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiền mặt cửa hàng",
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

  return `Thanh toán nhân viên ${payment.documentNo}; ghi giảm quỹ và giảm công nợ nhân viên.`;
}

function reverseEmployeePayment(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  if (!targetId) {
    throw new Error("Chọn phiếu thanh toán nhân viên cụ thể để đảo.");
  }
  requireReason(options?.reason, "Đảo thanh toán nhân viên");
  const payment = state.employeePayments.find((item) => item.id === targetId);
  if (!payment) {
    throw new Error("Không tìm thấy phiếu thanh toán nhân viên cần đảo.");
  }
  if (payment.status !== "confirmed") {
    throw new Error("Chỉ phiếu thanh toán nhân viên đã xác nhận mới được đảo.");
  }

  const sourceDocument = reversalDocumentNo(payment.documentNo);
  payment.status = "reversed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiền mặt cửa hàng",
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

  return `Đảo phiếu thanh toán ${payment.documentNo}; ghi tăng lại quỹ và công còn phải trả nhân viên.`;
}

function confirmEmployeeAdvance(state: OperationsState, now: string, targetId?: string) {
  const advance = targetId
    ? state.employeeAdvances.find((item) => item.id === targetId)
    : state.employeeAdvances.find((item) => item.status === "draft");
  if (!advance) {
    throw new Error(targetId ? "Không tìm thấy phiếu tạm ứng cần xác nhận." : "Không còn phiếu tạm ứng nháp.");
  }
  if (advance.status !== "draft") {
    throw new Error("Chỉ phiếu tạm ứng nháp mới được xác nhận.");
  }
  if (cashBalance(state) < advance.amount) {
    throw new Error("Quỹ tiền mặt không đủ để tạm ứng nhân viên.");
  }

  advance.status = "confirmed";
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiền mặt cửa hàng",
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

  return `Xác nhận ${advance.documentNo}; giảm quỹ và ghi tạm ứng vào sổ nhân viên.`;
}

function reverseEmployeeAdvance(state: OperationsState, now: string, targetId?: string, options?: OperationOptions) {
  if (!targetId) {
    throw new Error("Chọn phiếu tạm ứng cụ thể để đảo.");
  }
  const reason = requireReason(options?.reason, "Đảo tạm ứng nhân viên");
  const advance = state.employeeAdvances.find((item) => item.id === targetId);
  if (!advance) {
    throw new Error("Không tìm thấy phiếu tạm ứng cần đảo.");
  }
  if (advance.status !== "confirmed") {
    throw new Error("Chỉ phiếu tạm ứng đã xác nhận mới được đảo.");
  }

  advance.status = "reversed";
  const sourceDocument = reversalDocumentNo(advance.documentNo);
  state.cashTransactions.push({
    id: nextId("cash", state.cashTransactions.length),
    accountName: "Tiền mặt cửa hàng",
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

  return `Đảo ${advance.documentNo}; hoàn lại quỹ và sổ nhân viên với lý do: ${reason}.`;
}

function resolveImportIssue(state: OperationsState, targetId?: string) {
  const issue = targetId ? state.importIssues.find((item) => item.id === targetId) : state.importIssues.find((item) => item.status === "open");
  if (!issue) {
    throw new Error(targetId ? "Không tìm thấy vấn đề import cần xử lý." : "Không còn vấn đề import đang mở.");
  }
  if (issue.status !== "open") {
    throw new Error("Vấn đề import này đã được xử lý trước đó.");
  }
  issue.status = "resolved";
  syncImportJobReviewStatus(state, issue.importJobId);

  return `Đánh dấu đã xử lý vấn đề import dòng ${issue.rowNumber} trang tính ${issue.sourceSheet}.`;
}

function ignoreImportIssue(state: OperationsState, targetId?: string) {
  const issue = targetId
    ? state.importIssues.find((item) => item.id === targetId)
    : state.importIssues.find((item) => item.status === "open" && item.severity === "warning");
  if (!issue) {
    throw new Error(targetId ? "Không tìm thấy cảnh báo import cần bỏ qua." : "Không còn cảnh báo import đang mở.");
  }
  if (issue.status !== "open") {
    throw new Error("Vấn đề import này đã được xử lý trước đó.");
  }
  if (issue.severity !== "warning") {
    throw new Error("Lỗi import bắt buộc phải xử lý, không được bỏ qua.");
  }

  issue.status = "ignored";
  syncImportJobReviewStatus(state, issue.importJobId);

  return `Bỏ qua cảnh báo import dòng ${issue.rowNumber} trang tính ${issue.sourceSheet}; lỗi nghiêm trọng vẫn phải xử lý.`;
}

function syncImportJobReviewStatus(state: OperationsState, importJobId?: string) {
  if (!importJobId) {
    return;
  }
  const job = state.importJobs.find((item) => item.id === importJobId);
  if (!job) {
    throw new Error("Không tìm thấy batch import liên kết với vấn đề này.");
  }
  job.status = state.importIssues.some((issue) => issue.importJobId === job.id && issue.status === "open")
    ? "dry_run"
    : "reviewed";
}

function reverseReceiptFinancials(state: OperationsState, movement: InventoryMovement, sourceDocument: string, now: string) {
  const receiptLineId = movement.sourceLineId ?? (movement.postingKey.startsWith("receipt-") ? movement.postingKey.slice("receipt-".length) : "");
  const candidate = receiptLineId ? findPurchaseLine(state, (_purchaseOrder, line) => line.id === receiptLineId) : undefined;
  if (!candidate) {
    throw new Error("Không tìm thấy dòng mua nguồn của phát sinh nhập kho.");
  }
  const { purchaseOrder, line } = candidate;
  if (line.destinationType !== "warehouse" || line.productUnitId !== movement.productUnitId || line.warehouseId !== movement.warehouseId) {
    throw new Error("Phát sinh nhập kho không khớp với dòng mua nguồn.");
  }
  if (line.receivedQuantity < movement.quantity) {
    throw new Error("Số lượng đã nhận của đơn mua không đủ để đảo phát sinh nhập kho.");
  }

  const amount = purchaseLineGross(movement.quantity, line.unitCost, line.taxRate);
  const payable = findReceiptPayableEntry(state, movement, purchaseOrder.supplierId, amount);
  if (!payable) {
    throw new Error("Không tìm thấy đúng bút toán phải trả của lần nhập kho này để đảo.");
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
    throw new Error("Không tìm thấy đơn bán nguồn của phát sinh xuất kho.");
  }
  const sourceAllocation = movement.sourceAllocationId
    ? salesLine.allocations?.find((allocation) => allocation.id === movement.sourceAllocationId)
    : undefined;
  const sourceWarehouseId = sourceAllocation?.warehouseId ?? salesLine.warehouseId;
  if (salesLine.productUnitId !== movement.productUnitId || sourceWarehouseId !== movement.warehouseId) {
    throw new Error("Phát sinh xuất kho không khớp với dòng bán nguồn.");
  }

  const reversedQuantity = Math.abs(movement.quantity);
  if (salesLine.deliveredQuantity < reversedQuantity) {
    throw new Error("Số lượng đã giao của đơn bán không đủ để đảo phát sinh xuất kho.");
  }

  const amount = lineTotals({
    quantity: reversedQuantity,
    unitPrice: salesLine.unitPrice,
    taxRate: salesLine.taxRate
  }).gross;
  const receivable = findIssueReceivableEntry(state, movement, salesOrder.customerId, amount);
  if (!receivable) {
    throw new Error("Không tìm thấy đúng bút toán phải thu của lần xuất kho này để đảo.");
  }
  if (customerAllocatedAmountForLedgerEntry(state, receivable.id) > 0) {
    throw new Error("Cần đảo hoặc bỏ phân bổ phiếu thu khách hàng trước khi đảo xuất kho này.");
  }

  salesLine.deliveredQuantity -= reversedQuantity;
  if (sourceAllocation) {
    if (sourceAllocation.deliveredQuantity < reversedQuantity) throw new Error("Số lượng đã giao của allocation không đủ để đảo.");
    sourceAllocation.deliveredQuantity -= reversedQuantity;
    syncAllocationStatus(sourceAllocation);
  }
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

type SalesAllocationShortage = {
  salesOrderLineId: string;
  productUnitId: string;
  warehouseId: string;
  quantity: number;
};

type SalesAllocationPlan = {
  allocationsByLine: Map<string, SalesSourceAllocation[]>;
  shortages: SalesAllocationShortage[];
};

function buildSalesSourceAllocationPlan(state: OperationsState, order: SalesOrder): SalesAllocationPlan {
  const allocationsByLine = new Map<string, SalesSourceAllocation[]>();
  const shortages: SalesAllocationShortage[] = [];
  const localWarehouseReservations = new Map<string, number>();
  const localPurchaseReservations = new Map<string, number>();
  const primaryWarehouseId = state.warehouses.find((warehouse) => warehouse.status === "active")?.id;
  if (!primaryWarehouseId) throw new Error("Không có kho hoạt động để lập kế hoạch nguồn bán.");

  for (const line of order.lines) {
    let remaining = line.quantity;
    const allocations: SalesSourceAllocation[] = [];
    const addAllocation = (allocation: Omit<SalesSourceAllocation, "id" | "version" | "status" | "deliveredQuantity">) => {
      allocations.push({
        ...allocation,
        id: `${line.id}-allocation-${allocations.length + 1}`,
        deliveredQuantity: 0,
        version: 1,
        status: "allocated"
      });
    };

    for (const warehouse of state.warehouses.filter((item) => item.status === "active")) {
      if (remaining <= 0) break;
      const key = `${warehouse.id}:${line.productUnitId}`;
      const locallyReserved = localWarehouseReservations.get(key) ?? 0;
      const available = Math.max(availableWarehouseStockForAllocation(state, warehouse.id, line.productUnitId) - locallyReserved, 0);
      const quantity = Math.min(remaining, available);
      if (quantity <= 0) continue;
      addAllocation({ sourceType: "warehouse", warehouseId: warehouse.id, allocatedQuantity: quantity });
      localWarehouseReservations.set(key, locallyReserved + quantity);
      remaining -= quantity;
    }

    for (const purchaseOrder of state.purchaseOrders) {
      if (remaining <= 0) break;
      if (purchaseOrder.status === "draft" || purchaseOrder.status === "fully_received") continue;
      for (const purchaseLine of purchaseOrder.lines) {
        if (remaining <= 0) break;
        if (purchaseLine.destinationType !== "warehouse" || purchaseLine.productUnitId !== line.productUnitId || !purchaseLine.warehouseId) continue;
        const locallyReserved = localPurchaseReservations.get(purchaseLine.id) ?? 0;
        const available = Math.max(purchaseLineAvailableQuantity(state, purchaseLine) - locallyReserved, 0);
        const quantity = Math.min(remaining, available);
        if (quantity <= 0) continue;
        addAllocation({
          sourceType: "warehouse",
          warehouseId: purchaseLine.warehouseId,
          purchaseOrderLineId: purchaseLine.id,
          allocatedQuantity: quantity
        });
        localPurchaseReservations.set(purchaseLine.id, locallyReserved + quantity);
        remaining -= quantity;
      }
    }

    for (const purchaseOrder of state.purchaseOrders) {
      if (remaining <= 0) break;
      if (purchaseOrder.status === "draft" || purchaseOrder.status === "fully_received") continue;
      for (const purchaseLine of purchaseOrder.lines) {
        if (remaining <= 0) break;
        if (
          purchaseLine.destinationType !== "customer_direct" ||
          purchaseLine.productUnitId !== line.productUnitId ||
          (purchaseLine.salesOrderLineId && purchaseLine.salesOrderLineId !== line.id) ||
          (purchaseLine.customerId && purchaseLine.customerId !== order.customerId)
        ) continue;
        const locallyReserved = localPurchaseReservations.get(purchaseLine.id) ?? 0;
        const available = Math.max(purchaseLineAvailableQuantity(state, purchaseLine) - locallyReserved, 0);
        const quantity = Math.min(remaining, available);
        if (quantity <= 0) continue;
        addAllocation({ sourceType: "direct_supplier", purchaseOrderLineId: purchaseLine.id, allocatedQuantity: quantity });
        localPurchaseReservations.set(purchaseLine.id, locallyReserved + quantity);
        remaining -= quantity;
      }
    }

    allocationsByLine.set(line.id, allocations);
    if (remaining > 0) shortages.push({
      salesOrderLineId: line.id,
      productUnitId: line.productUnitId,
      warehouseId: primaryWarehouseId,
      quantity: remaining
    });
  }
  return { allocationsByLine, shortages };
}

function applySalesSourceAllocationPlan(
  state: OperationsState,
  order: SalesOrder,
  allocationsByLine: Map<string, SalesSourceAllocation[]>
) {
  for (const line of order.lines) {
    const allocations = allocationsByLine.get(line.id) ?? [];
    if (allocations.reduce((sum, allocation) => sum + allocation.allocatedQuantity, 0) !== line.quantity) {
      throw new Error(`Kế hoạch nguồn của dòng ${line.id} không khớp số lượng bán.`);
    }
    for (const allocation of allocations) {
      if (allocation.sourceType !== "direct_supplier" || !allocation.purchaseOrderLineId) continue;
      const purchase = findPurchaseLine(state, (_purchaseOrder, purchaseLine) => purchaseLine.id === allocation.purchaseOrderLineId);
      if (!purchase || (purchase.line.salesOrderLineId && purchase.line.salesOrderLineId !== line.id)) {
        throw new Error("Nguồn giao thẳng đã được liên kết bởi thao tác khác; vui lòng tải lại.");
      }
      purchase.line.salesOrderLineId = line.id;
      purchase.line.customerId = order.customerId;
    }
    setSalesSourceAllocations(line, allocations);
  }
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
        if (line.productUnitId !== productUnitId) return lineSum;
        return lineSum + salesSourceAllocations(line).reduce((allocationSum, allocation) => {
          if (allocation.sourceType !== "warehouse" || allocation.purchaseOrderLineId || allocation.warehouseId !== warehouseId || allocation.status === "cancelled") return allocationSum;
          return allocationSum + openAllocationQuantity(allocation);
        }, 0);
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
        if (!isReservationStatus(order.status)) return lineSum;
        return lineSum + salesSourceAllocations(line).reduce((allocationSum, allocation) =>
          allocation.purchaseOrderLineId === purchaseOrderLineId && allocation.status !== "cancelled"
            ? allocationSum + openAllocationQuantity(allocation)
            : allocationSum, 0);
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
    if (order.lines.some(hasOpenWarehouseAllocation)) {
      return { order, job };
    }
  }
  return undefined;
}

function findNextDeliveryCompletion(state: OperationsState, targetId?: string): { order: SalesOrder; job: DeliveryJob } | undefined {
  return findNextDeliveryByStatus(state, ["in_transit"], targetId);
}

function assertWorkerSubmissionActor(actor: OperationsActor) {
  if (actor.role !== "worker" && actor.role !== "driver") {
    throw new Error("Chỉ tài khoản Thợ hoặc Tài xế mới được gửi xác nhận nhập kho hoặc giao hàng.");
  }
}

function assertWorkerClaimActor(actor: OperationsActor) {
  if (actor.role !== "worker") {
    throw new Error("Chỉ tài khoản Thợ mới được nhận đơn mới.");
  }
}

function validateReceiptAttachments(attachments: OperationsAttachment[], actor: OperationsActor) {
  if (attachments.length === 0 || attachments.length > 3) {
    throw new Error("Phiếu nhập của Thợ bắt buộc đính kèm ít nhất một ảnh và tối đa 3 ảnh.");
  }
  for (const attachment of attachments) {
    if (attachment.uploadedBy !== actor.id || !attachment.id.trim() || !attachment.fileName.trim() || attachment.size <= 0 || attachment.size > 8 * 1024 * 1024 || !/^[a-f0-9]{64}$/i.test(attachment.sha256)) {
      throw new Error("Ảnh đính kèm phiếu nhập không hợp lệ hoặc không thuộc tài khoản gửi.");
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(attachment.contentType)) {
      throw new Error("Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP cho phiếu nhập.");
    }
  }
}

function validateDeliveryCompletionAttachments(attachments: OperationsAttachment[], actor: OperationsActor) {
  if (attachments.length === 0 || attachments.length > 3) {
    throw new Error("Xác nhận đã giao của Thợ bắt buộc đính kèm ít nhất một ảnh và tối đa 3 ảnh.");
  }
  for (const attachment of attachments) {
    if (attachment.uploadedBy !== actor.id || !attachment.id.trim() || !attachment.fileName.trim() || attachment.size <= 0 || attachment.size > 8 * 1024 * 1024 || !/^[a-f0-9]{64}$/i.test(attachment.sha256)) {
    throw new Error("Ảnh xác nhận giao không hợp lệ hoặc không thuộc tài khoản gửi.");
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(attachment.contentType)) {
      throw new Error("Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP để xác nhận đã giao.");
    }
  }
}

function assertApprovalActor(actor: OperationsActor) {
  if (actor.role !== "owner" && actor.role !== "accountant") {
    throw new Error("Chỉ tài khoản Chủ cửa hàng hoặc Kế toán mới được phê duyệt.");
  }
}

function assertOwnerActor(actor: OperationsActor, message: string) {
  if (actor.role !== "owner") throw new Error(message);
}

function findWorkerEmployee(state: OperationsState, actor: OperationsActor) {
  if (!actor.employeeId) return undefined;
  return state.employees.find((employee) =>
    employee.id === actor.employeeId &&
    employee.status === "active" &&
    employee.roleType === (actor.role === "driver" ? "driver" : "worker")
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
        salesSourceAllocations(line).some((allocation) =>
          allocation.sourceType === "direct_supplier" && allocation.purchaseOrderLineId === purchaseLine.id && openAllocationQuantity(allocation) > 0
        )
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
    throw new Error("Phiếu đã hết số tiền có thể phân bổ.");
  }

  const plan = input.requested
    ? input.requested.map((allocation) => ({ ...allocation }))
    : createFifoAllocationPlan(input.obligations, input.remainingPayment);
  if (plan.length === 0) {
    throw new Error("Không còn nghĩa vụ công nợ phù hợp để phân bổ.");
  }

  const seenTargets = new Set<string>();
  for (const allocation of plan) {
    if (seenTargets.has(allocation.ledgerEntryId)) {
      throw new Error("Một lệnh phân bổ không được lặp lại cùng dòng công nợ.");
    }
    seenTargets.add(allocation.ledgerEntryId);
    if (!Number.isFinite(allocation.amount) || allocation.amount <= 0) {
      throw new Error("Số tiền phân bổ phải lớn hơn 0.");
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
    throw new Error("Tổng phân bổ vượt số tiền còn lại của phiếu.");
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
    throw new Error("Không tìm thấy đơn bán mẫu.");
  }
  return order;
}

function assertNoInventoryPosting(state: OperationsState, postingKey: string) {
  if (state.inventoryMovements.some((movement) => movement.postingKey === postingKey)) {
    throw new Error("Mã ghi sổ kho đã tồn tại, không được ghi kho trùng.");
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
    throw new Error("Giá trị tồn kho không hợp lệ; cần đối chiếu phát sinh kho trước khi tiếp tục.");
  }
  return cost;
}

function inventoryIssueCost(state: OperationsState, warehouseId: string, productUnitId: string, allowApprovedNegative: boolean) {
  const average = movingAverageCost(state, warehouseId, productUnitId);
  if (average > 0 || !allowApprovedNegative) return average;
  const lastKnown = [...state.inventoryMovements].reverse().find((movement) =>
    movement.warehouseId === warehouseId &&
    movement.productUnitId === productUnitId &&
    movement.quantity > 0 &&
    movement.unitCost > 0 &&
    !movement.reversedById
  )?.unitCost;
  if (!lastKnown) throw new Error("Không có giá vốn lịch sử để xuất âm; cần đối chiếu giá vốn trước khi giao.");
  return lastKnown;
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
    throw new Error(`${action} cần lý do ít nhất 5 ký tự để lưu audit.`);
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
