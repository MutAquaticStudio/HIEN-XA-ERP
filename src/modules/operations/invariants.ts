import { cashBalance, stockBalance } from "./selectors";
import { normalizeUnitName } from "./unit-settings";
import type {
  CompensationBatch,
  CustomerLedgerEntry,
  CustomerPayment,
  DocumentUnitSnapshot,
  EmployeeLedgerEntry,
  InventoryMovement,
  OperationsState,
  PurchaseOrder,
  SupplierLedgerEntry,
  SupplierPayment
} from "./types";

export type OperationsInvariantContext =
  | "catalog"
  | "sales"
  | "procurement"
  | "inventory"
  | "delivery"
  | "receivables"
  | "payables"
  | "cash"
  | "workforce"
  | "compensation"
  | "import";

export type OperationsInvariantViolation = {
  context: OperationsInvariantContext;
  code: string;
  message: string;
};

export function assertOperationsInvariants(state: OperationsState) {
  const violations = validateOperationsInvariants(state);
  if (violations.length > 0) {
    const details = violations.map((violation) => `${violation.context}.${violation.code}: ${violation.message}`).join("; ");
    throw new Error(`Vi phạm quy tắc ERP: ${details}`);
  }
}

export function validateOperationsInvariants(state: OperationsState): OperationsInvariantViolation[] {
  const violations: OperationsInvariantViolation[] = [];

  validateCatalog(state, violations);
  validateSales(state, violations);
  validateProcurementAndInventory(state, violations);
  validateDelivery(state, violations);
  validateApprovalRequests(state, violations);
  validateReceivables(state, violations);
  validatePayables(state, violations);
  validateCash(state, violations);
  validatePartnerPortal(state, violations);
  validateWorkforceAndCompensation(state, violations);
  validateImport(state, violations);

  return violations;
}

function validateCatalog(state: OperationsState, violations: OperationsInvariantViolation[]) {
  const unitNames = new Set<string>();
  for (const unit of state.unitDefinitions) {
    const normalized = normalizeUnitName(unit.name);
    if (!normalized || unitNames.has(normalized)) {
      violations.push({
        context: "catalog",
        code: "duplicate_or_empty_unit",
        message: `Đơn vị ${unit.name || unit.id} bị trống hoặc trùng tên.`
      });
    }
    unitNames.add(normalized);
  }

  for (const product of state.productUnits) {
    if (!state.unitDefinitions.some((unit) => normalizeUnitName(unit.name) === normalizeUnitName(product.unitName))) {
      violations.push({
        context: "catalog",
        code: "product_base_unit_missing",
        message: `${product.productCode} thiếu đơn vị tồn kho ${product.unitName} trong danh mục.`
      });
    }
  }

  const conversionPairs = new Set<string>();
  for (const conversion of state.purchaseUnitConversions) {
    const product = state.productUnits.find((item) => item.id === conversion.productUnitId);
    const unit = state.unitDefinitions.find((item) => item.id === conversion.unitId && item.status === "active");
    const pair = `${conversion.productUnitId}:${conversion.unitId}`;
    if (!product || !unit) {
      violations.push({
        context: "catalog",
        code: "purchase_unit_reference_missing",
        message: `${conversion.id} tham chiếu vật tư hoặc đơn vị không tồn tại.`
      });
    } else if (normalizeUnitName(product.unitName) === normalizeUnitName(unit.name)) {
      violations.push({
        context: "catalog",
        code: "purchase_unit_matches_base",
        message: `${conversion.id} trùng đơn vị tồn kho; không cần quy đổi riêng.`
      });
    }
    const hasValidFixedFactor = conversion.conversionMode === "fixed" &&
      Number.isFinite(conversion.factorToBase) &&
      Number(conversion.factorToBase) > 0;
    const hasValidVariableFactor = conversion.conversionMode === "variable" && conversion.factorToBase === null;
    if (!hasValidFixedFactor && !hasValidVariableFactor) {
      violations.push({
        context: "catalog",
        code: "invalid_purchase_unit_factor",
        message: `${conversion.id} có cách tính hoặc hệ số quy đổi không hợp lệ.`
      });
    }
    if (!Number.isInteger(conversion.version) || conversion.version < 1) {
      violations.push({
        context: "catalog",
        code: "invalid_purchase_unit_version",
        message: `${conversion.id} có phiên bản không hợp lệ.`
      });
    }
    if (conversionPairs.has(pair)) {
      violations.push({
        context: "catalog",
        code: "duplicate_purchase_unit_conversion",
        message: `${conversion.id} bị trùng quy đổi theo vật tư và đơn vị.`
      });
    }
    conversionPairs.add(pair);
  }
}

function validateDelivery(state: OperationsState, violations: OperationsInvariantViolation[]) {
  const activeStatuses = ["assigned", "loading", "in_transit"];

  for (const [index, job] of state.deliveryJobs.entries()) {
    const order = state.salesOrders.find((item) => item.id === job.salesOrderId);
    const driver = state.employees.find((item) => item.id === job.driverId && item.roleType === "driver");
    const vehicle = state.vehicles.find((item) => item.id === job.vehicleId);
    if (!order || !driver || !vehicle) {
      violations.push({
        context: "delivery",
        code: "delivery_master_data_missing",
        message: `${job.documentNo} thiếu đơn bán, tài xế hoặc xe hợp lệ.`
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(job.plannedDate)) {
      violations.push({ context: "delivery", code: "invalid_planned_date", message: `${job.documentNo} có ngày giao không hợp lệ.` });
    }
    if (job.status === "delivered" && (!job.recipientName?.trim() || !job.evidence?.trim() || !job.confirmedAt)) {
      violations.push({ context: "delivery", code: "missing_delivery_evidence", message: `${job.documentNo} đã giao nhưng thiếu người nhận hoặc bằng chứng.` });
    }
    if (job.status === "failed" && (job.failureReason?.trim().length ?? 0) < 5) {
      violations.push({ context: "delivery", code: "missing_delivery_failure_reason", message: `${job.documentNo} thất bại nhưng thiếu lý do.` });
    }
    const claimedWorkOrder = state.workOrders.find((workOrder) =>
      workOrder.salesOrderId === job.salesOrderId &&
      workOrder.status === "assigned" &&
      Boolean(workOrder.claimedByEmployeeId)
    );
    if (claimedWorkOrder?.claimedByEmployeeId && !job.helperIds.includes(claimedWorkOrder.claimedByEmployeeId)) {
      violations.push({
        context: "delivery",
        code: "claimed_worker_missing_from_delivery",
        message: `${job.documentNo} thiếu thợ đã nhận đơn trong phân công chuyến giao.`
      });
    }
    if (!activeStatuses.includes(job.status)) {
      continue;
    }
    const overlap = state.deliveryJobs.slice(index + 1).find((candidate) =>
      activeStatuses.includes(candidate.status) &&
      candidate.plannedDate === job.plannedDate &&
      (candidate.driverId === job.driverId || candidate.vehicleId === job.vehicleId)
    );
    if (overlap) {
      violations.push({
        context: "delivery",
        code: "delivery_schedule_overlap",
        message: `${job.documentNo} và ${overlap.documentNo} bị trùng tài xế hoặc xe trong cùng ngày.`
      });
    }
  }
}

function validateApprovalRequests(state: OperationsState, violations: OperationsInvariantViolation[]) {
  const pendingTargets = new Set<string>();
  for (const request of state.approvalRequests) {
    const targetKey = `${request.type}:${request.targetId}`;
    if (request.status === "pending" && pendingTargets.has(targetKey)) {
      violations.push({
        context: "delivery",
        code: "duplicate_pending_approval",
        message: `${request.documentNo} trùng yêu cầu đang chờ duyệt cho cùng chứng từ.`
      });
    }
    if (request.status === "pending") {
      pendingTargets.add(targetKey);
    }
    if (!request.submittedBy.trim() || !request.submittedByName.trim() || !request.submittedAt.trim()) {
      violations.push({
        context: "delivery",
        code: "approval_submitter_missing",
        message: `${request.documentNo} thiếu thông tin người gửi hoặc thời điểm gửi.`
      });
    }

    if (request.type === "goods_receipt") {
      const targetExists = state.purchaseOrders.some((order) =>
        order.lines.some((line) => line.id === request.targetId && line.destinationType === "warehouse")
      );
      if (!targetExists) {
        violations.push({
          context: "procurement",
          code: "approval_receipt_target_missing",
          message: `${request.documentNo} tham chiếu dòng nhập kho không tồn tại.`
        });
      }
      if (!Number.isFinite(request.quantity) || (request.quantity ?? 0) <= 0) {
        violations.push({
          context: "procurement",
          code: "approval_receipt_quantity_invalid",
          message: `${request.documentNo} có số lượng nhập chờ duyệt không hợp lệ.`
        });
      }
      if (!request.attachments || request.attachments.length === 0) {
        violations.push({
          context: "procurement",
          code: "approval_receipt_attachment_missing",
          message: `${request.documentNo} thiếu ảnh thực nhận bắt buộc.`
        });
      }
    } else {
      const targetExists = state.deliveryJobs.some((job) => job.id === request.targetId);
      if (!targetExists) {
        violations.push({
          context: "delivery",
          code: "approval_delivery_target_missing",
          message: `${request.documentNo} tham chiếu chuyến giao không tồn tại.`
        });
      }
      const hasQuantity = Object.values(request.lineQuantities ?? {}).some((quantity) => Number.isFinite(quantity) && quantity > 0);
      if (!hasQuantity || !request.recipientName?.trim() || !request.evidence?.trim()) {
        violations.push({
          context: "delivery",
          code: "approval_delivery_payload_invalid",
          message: `${request.documentNo} thiếu số lượng, người nhận hoặc bằng chứng giao.`
        });
      }
      if (!request.attachments || request.attachments.length === 0) {
        violations.push({
          context: "delivery",
          code: "approval_delivery_attachment_missing",
          message: `${request.documentNo} thiếu ảnh xác nhận giao bắt buộc.`
        });
      }
    }

    if (request.status === "approved" && (!request.approvedBy?.trim() || !request.approvedAt?.trim())) {
      violations.push({
        context: "delivery",
        code: "approval_approver_missing",
        message: `${request.documentNo} đã duyệt nhưng thiếu người hoặc thời điểm duyệt.`
      });
    }
    if (request.status === "rejected" && (!request.approvedBy?.trim() || !request.approvedAt?.trim() || (request.rejectionReason?.trim().length ?? 0) < 5)) {
      violations.push({
        context: "delivery",
        code: "approval_rejection_audit_missing",
        message: `${request.documentNo} bị từ chối nhưng thiếu lý do hoặc thông tin người từ chối.`
      });
    }
  }
}

function validateSales(state: OperationsState, violations: OperationsInvariantViolation[]) {
  for (const order of state.salesOrders) {
    for (const line of order.lines) {
      if (line.quantity <= 0) {
        violations.push({
          context: "sales",
          code: "invalid_quantity",
          message: `${order.documentNo} có dòng bán số lượng không hợp lệ.`
        });
      }

      if (line.deliveredQuantity < 0 || line.deliveredQuantity > line.quantity) {
        violations.push({
          context: "sales",
          code: "delivered_quantity_out_of_range",
          message: `${order.documentNo} có dòng giao vượt số lượng bán.`
        });
      }

      const product = state.productUnits.find((item) => item.id === line.productUnitId);
      validateDocumentUnit(line.documentUnit, product?.unitName, line.quantity, line.unitPrice, order.documentNo, "sales", violations);

      if (line.sourceType === "warehouse" && !line.warehouseId) {
        violations.push({
          context: "sales",
          code: "warehouse_source_missing_warehouse",
          message: `${order.documentNo} có dòng lấy kho nhưng thiếu kho nguồn.`
        });
      }

      if (line.sourceType === "direct_supplier" && !line.purchaseOrderLineId) {
        violations.push({
          context: "sales",
          code: "direct_source_missing_purchase_line",
          message: `${order.documentNo} có dòng giao thẳng nhưng thiếu dòng mua liên kết.`
        });
      }
    }
  }
}

function validatePartnerPortal(state: OperationsState, violations: OperationsInvariantViolation[]) {
  for (const proof of state.customerPaymentProofRequests ?? []) {
    const order = state.salesOrders.find((item) => item.id === proof.salesOrderId);
    if (!order || order.customerId !== proof.customerId || proof.amount <= 0 || proof.attachments.length === 0 || !proof.submittedBy.trim()) {
      violations.push({ context: "cash", code: "invalid_customer_payment_proof_request", message: `${proof.id} thiếu đơn, khách, chứng từ hoặc số tiền hợp lệ.` });
    }
  }
  for (const order of state.purchaseOrders) {
    for (const response of order.supplierAcknowledgements ?? []) {
      if (!response.submittedBy.trim() || response.version <= 0 || (response.proposedDeliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(response.proposedDeliveryDate))) {
        violations.push({ context: "procurement", code: "invalid_supplier_acknowledgement", message: `${order.documentNo} có phản hồi NCC không hợp lệ.` });
      }
    }
    for (const notice of order.supplierDeliveryNotices ?? []) {
      const valid = Object.entries(notice.lineQuantities).length > 0 && Object.entries(notice.lineQuantities).every(([lineId, quantity]) => {
        const line = order.lines.find((item) => item.id === lineId);
        return Boolean(line && quantity > 0 && quantity <= line.orderedQuantity - line.receivedQuantity);
      });
      if (!valid || !notice.submittedBy.trim() || notice.version <= 0) {
        violations.push({ context: "procurement", code: "invalid_supplier_delivery_notice", message: `${order.documentNo} có báo giao NCC không hợp lệ.` });
      }
    }
  }
}

function validateProcurementAndInventory(state: OperationsState, violations: OperationsInvariantViolation[]) {
  const postingKeys = new Set<string>();

  for (const movement of state.inventoryMovements) {
    validateInventoryMovement(movement, state, postingKeys, violations);
  }

  for (const warehouse of state.warehouses) {
    for (const product of state.productUnits) {
      if (stockBalance(state, warehouse.id, product.id) < 0) {
        violations.push({
          context: "inventory",
          code: "negative_stock",
          message: `${warehouse.code}/${product.productCode} bị âm tồn kho.`
        });
      }
    }
  }

  for (const purchaseOrder of state.purchaseOrders) {
    validatePurchaseOrder(purchaseOrder, state, violations);
  }
  validateDirectDeliveryPostings(state, violations);
}

function validateDirectDeliveryPostings(state: OperationsState, violations: OperationsInvariantViolation[]) {
  const directCredits = state.supplierLedgerEntries.filter((entry) => entry.entryType === "direct_delivery" && entry.direction === "credit");
  for (const entry of directCredits) {
    const receivable = entry.postingGroupId
      ? state.customerLedgerEntries.find((candidate) => candidate.postingGroupId === entry.postingGroupId && candidate.direction === "debit")
      : undefined;
    if (!entry.postingGroupId || !entry.sourceLineId || !entry.quantity || entry.quantity <= 0 || entry.netAmount === undefined || !receivable) {
      violations.push({
        context: "procurement",
        code: "invalid_direct_delivery_posting_pair",
        message: `${entry.sourceDocument} thiếu cặp bút toán giao thẳng hoặc metadata số lượng/giá vốn.`
      });
      continue;
    }
    if (receivable.quantity !== entry.quantity || receivable.entryType !== "sale_delivery") {
      violations.push({
        context: "procurement",
        code: "direct_delivery_quantity_mismatch",
        message: `${entry.postingGroupId} có số lượng phải thu và phải trả không khớp.`
      });
    }
  }

  for (const purchaseOrder of state.purchaseOrders) {
    for (const line of purchaseOrder.lines.filter((item) => item.destinationType === "customer_direct")) {
      const postedQuantity = state.supplierLedgerEntries.reduce((total, entry) => {
        if (entry.sourceLineId !== line.id || !entry.postingGroupId?.startsWith("direct-")) {
          return total;
        }
        if (entry.entryType === "direct_delivery" && entry.direction === "credit") {
          return total + (entry.quantity ?? 0);
        }
        if (entry.entryType === "reversal" && entry.direction === "debit") {
          return total - (entry.quantity ?? 0);
        }
        return total;
      }, 0);
      if (postedQuantity !== line.receivedQuantity) {
        violations.push({
          context: "procurement",
          code: "direct_delivery_received_quantity_mismatch",
          message: `${purchaseOrder.documentNo} có số lượng giao thẳng không khớp sổ phải trả.`
        });
      }
    }
  }
}

function validateInventoryMovement(
  movement: InventoryMovement,
  state: OperationsState,
  postingKeys: Set<string>,
  violations: OperationsInvariantViolation[]
) {
  if (postingKeys.has(movement.postingKey)) {
    violations.push({
      context: "inventory",
      code: "duplicate_posting_key",
      message: `Mã ghi sổ kho ${movement.postingKey} bị trùng.`
    });
  }
  postingKeys.add(movement.postingKey);

  if (movement.quantity === 0) {
    violations.push({
      context: "inventory",
      code: "zero_movement_quantity",
      message: `Phát sinh kho ${movement.postingKey} có số lượng bằng 0.`
    });
  }

  if (movement.unitCost < 0) {
    violations.push({
      context: "inventory",
      code: "negative_unit_cost",
      message: `Phát sinh kho ${movement.postingKey} có giá vốn âm.`
    });
  }
  if (["transfer_out", "transfer_in", "adjustment", "reverse"].includes(movement.movementType) && (movement.reason?.trim().length ?? 0) < 5) {
    violations.push({
      context: "inventory",
      code: "missing_inventory_reason",
      message: `Phát sinh kho ${movement.postingKey} thiếu lý do kiểm soát.`
    });
  }
  if (movement.movementType === "transfer_out" || movement.movementType === "transfer_in") {
    const related = movement.relatedMovementId ? state.inventoryMovements.find((item) => item.id === movement.relatedMovementId) : undefined;
    const expectedType = movement.movementType === "transfer_out" ? "transfer_in" : "transfer_out";
    if (
      !related ||
      related.movementType !== expectedType ||
      related.relatedMovementId !== movement.id ||
      related.sourceDocument !== movement.sourceDocument ||
      related.productUnitId !== movement.productUnitId ||
      related.warehouseId === movement.warehouseId ||
      related.quantity + movement.quantity !== 0
    ) {
      violations.push({
        context: "inventory",
        code: "invalid_inventory_transfer_pair",
        message: `Chuyển kho ${movement.sourceDocument} thiếu cặp xuất/nhập liên kết hợp lệ.`
      });
    }
    if ((movement.movementType === "transfer_out" && movement.quantity >= 0) || (movement.movementType === "transfer_in" && movement.quantity <= 0)) {
      violations.push({
        context: "inventory",
        code: "invalid_inventory_transfer_direction",
        message: `Chuyển kho ${movement.sourceDocument} sai chiều số lượng.`
      });
    }
  }
  if (movement.movementType === "reverse") {
    validateReverseInventoryMovement(movement, state, violations);
  } else if (movement.reversedById) {
    const reversal = state.inventoryMovements.find((item) => item.id === movement.reversedById);
    if (!reversal || reversal.postingKey !== `reverse-${movement.id}`) {
      violations.push({
        context: "inventory",
        code: "invalid_reverse_link",
        message: `Phát sinh kho ${movement.postingKey} liên kết dòng đảo không hợp lệ.`
      });
    }
  }
}

function validateReverseInventoryMovement(
  movement: InventoryMovement,
  state: OperationsState,
  violations: OperationsInvariantViolation[]
) {
  if (!movement.postingKey.startsWith("reverse-")) {
    violations.push({
      context: "inventory",
      code: "invalid_reverse_posting_key",
      message: `Dòng đảo kho ${movement.postingKey} thiếu liên kết posting key gốc.`
    });
    return;
  }

  const originalId = movement.postingKey.slice("reverse-".length);
  const original = state.inventoryMovements.find((item) => item.id === originalId);
  if (!original || original.movementType === "reverse") {
    violations.push({
      context: "inventory",
      code: "missing_reverse_source",
      message: `Dòng đảo kho ${movement.postingKey} không tìm thấy phát sinh gốc hợp lệ.`
    });
    return;
  }

  if (
    original.warehouseId !== movement.warehouseId ||
    original.productUnitId !== movement.productUnitId ||
    original.quantity + movement.quantity !== 0
  ) {
    violations.push({
      context: "inventory",
      code: "reverse_movement_mismatch",
      message: `Dòng đảo kho ${movement.postingKey} không ngược chiều đúng với phát sinh gốc.`
    });
  }

  if (original.reversedById !== movement.id) {
    violations.push({
      context: "inventory",
      code: "reverse_link_not_bidirectional",
      message: `Dòng đảo kho ${movement.postingKey} chưa được liên kết hai chiều với phát sinh gốc.`
    });
  }
}

function validatePurchaseOrder(
  purchaseOrder: PurchaseOrder,
  state: OperationsState,
  violations: OperationsInvariantViolation[]
) {
  for (const line of purchaseOrder.lines) {
    if (line.orderedQuantity <= 0 || line.receivedQuantity < 0 || line.receivedQuantity > line.orderedQuantity) {
      violations.push({
        context: "procurement",
        code: "received_quantity_out_of_range",
        message: `${purchaseOrder.documentNo} có dòng mua số lượng nhận không hợp lệ.`
      });
    }

    const product = state.productUnits.find((item) => item.id === line.productUnitId);
    validateDocumentUnit(line.documentUnit, product?.unitName, line.orderedQuantity, line.unitCost, purchaseOrder.documentNo, "procurement", violations);

    if (line.destinationType === "customer_direct") {
      if (!line.customerId || !line.salesOrderLineId) {
        violations.push({
          context: "procurement",
          code: "direct_delivery_missing_link",
          message: `${purchaseOrder.documentNo} giao thẳng nhưng thiếu khách hoặc dòng bán liên kết.`
        });
      }

      if (state.inventoryMovements.some((movement) => movement.postingKey === `receipt-${line.id}`)) {
        violations.push({
          context: "inventory",
          code: "direct_delivery_created_inventory_movement",
          message: `${purchaseOrder.documentNo} giao thẳng không được tạo nhập kho.`
        });
      }
    }

    if (line.destinationType === "warehouse" && !line.warehouseId) {
      violations.push({
        context: "procurement",
        code: "warehouse_destination_missing_warehouse",
        message: `${purchaseOrder.documentNo} nhập kho nhưng thiếu kho nhận.`
      });
    }
  }
}

function validateDocumentUnit(
  snapshot: DocumentUnitSnapshot | undefined,
  productBaseUnit: string | undefined,
  baseQuantity: number,
  baseUnitAmount: number,
  documentNo: string,
  context: "sales" | "procurement",
  violations: OperationsInvariantViolation[]
) {
  if (!snapshot) {
    return;
  }

  const valid = Boolean(snapshot.unitName.trim()) &&
    Boolean(snapshot.baseUnitName.trim()) &&
    (snapshot.conversionMode === undefined || snapshot.conversionMode === "fixed" || snapshot.conversionMode === "variable") &&
    snapshot.factorToBase > 0 &&
    snapshot.quantity > 0 &&
    snapshot.unitAmount >= 0 &&
    snapshot.baseUnitName === productBaseUnit &&
    approximatelyEqual(snapshot.quantity * snapshot.factorToBase, baseQuantity) &&
    approximatelyEqual(snapshot.unitAmount / snapshot.factorToBase, baseUnitAmount);

  if (!valid) {
    violations.push({
      context,
      code: "invalid_document_unit_conversion",
      message: `${documentNo} có snapshot đơn vị giao dịch không khớp đơn vị tồn kho.`
    });
  }
}

function approximatelyEqual(left: number, right: number) {
  return Math.abs(left - right) <= Math.max(1e-9, Math.abs(right) * 1e-9);
}

function validateReceivables(state: OperationsState, violations: OperationsInvariantViolation[]) {
  for (const entry of state.customerLedgerEntries) {
    validateLedgerEntry(entry, "receivables", violations);
  }

  for (const payment of state.customerPayments) {
    validateCustomerPayment(payment, state, violations);
    validatePostedPaymentPair({
      state,
      documentNo: payment.documentNo,
      status: payment.status,
      amount: payment.amount,
      cashDirection: "in",
      ledgerMatches: (entry) => entry.customerId === payment.customerId && entry.direction === "credit",
      reversalLedgerMatches: (entry) => entry.customerId === payment.customerId && entry.direction === "debit",
      ledgerEntries: state.customerLedgerEntries,
      context: "receivables",
      violations
    });
  }
}

function validateCustomerPayment(
  payment: CustomerPayment,
  state: OperationsState,
  violations: OperationsInvariantViolation[]
) {
  if (payment.amount <= 0) {
    violations.push({
      context: "receivables",
      code: "invalid_payment_amount",
      message: `${payment.documentNo} có số tiền thu không hợp lệ.`
    });
  }

  const allocatedAmount = payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (allocatedAmount > payment.amount) {
    violations.push({
      context: "receivables",
      code: "payment_over_allocated",
      message: `${payment.documentNo} phân bổ vượt số tiền phiếu thu.`
    });
  }

  for (const allocation of payment.allocations) {
    if (allocation.amount <= 0) {
      violations.push({
        context: "receivables",
        code: "invalid_allocation_amount",
        message: `${payment.documentNo} có dòng phân bổ không hợp lệ.`
      });
    }

    const ledgerEntry = state.customerLedgerEntries.find((entry) => entry.id === allocation.ledgerEntryId);
    if (!ledgerEntry || ledgerEntry.customerId !== payment.customerId || ledgerEntry.direction !== "debit" || ledgerEntry.reversedById || ledgerEntry.entryType === "reversal") {
      violations.push({
        context: "receivables",
        code: "allocation_target_invalid",
        message: `${payment.documentNo} phân bổ vào dòng công nợ không hợp lệ.`
      });
    }
  }

  const allocatedByLedger = new Map<string, number>();
  for (const existingPayment of state.customerPayments) {
    if (existingPayment.status === "reversed") {
      continue;
    }
    for (const allocation of existingPayment.allocations) {
      allocatedByLedger.set(allocation.ledgerEntryId, (allocatedByLedger.get(allocation.ledgerEntryId) ?? 0) + allocation.amount);
    }
  }

  for (const [ledgerEntryId, amount] of allocatedByLedger.entries()) {
    const ledgerEntry = state.customerLedgerEntries.find((entry) => entry.id === ledgerEntryId);
    if (ledgerEntry && amount > ledgerEntry.amount) {
      violations.push({
        context: "receivables",
        code: "ledger_entry_over_allocated",
        message: `Dòng phải thu ${ledgerEntry.sourceDocument} bị phân bổ vượt số tiền.`
      });
    }
  }

  validateAllocationStatus(payment, allocatedAmount, "receivables", violations);
}

function validatePayables(state: OperationsState, violations: OperationsInvariantViolation[]) {
  for (const entry of state.supplierLedgerEntries) {
    validateLedgerEntry(entry, "payables", violations);
  }

  for (const payment of state.supplierPayments) {
    validateSupplierPayment(payment, state, violations);
    validatePostedPaymentPair({
      state,
      documentNo: payment.documentNo,
      status: payment.status,
      amount: payment.amount,
      cashDirection: "out",
      ledgerMatches: (entry) => entry.supplierId === payment.supplierId && entry.direction === "debit",
      reversalLedgerMatches: (entry) => entry.supplierId === payment.supplierId && entry.direction === "credit",
      ledgerEntries: state.supplierLedgerEntries,
      context: "payables",
      violations
    });
  }
}

function validateSupplierPayment(
  payment: SupplierPayment,
  state: OperationsState,
  violations: OperationsInvariantViolation[]
) {
  if (payment.amount <= 0) {
    violations.push({
      context: "payables",
      code: "invalid_supplier_payment_amount",
      message: `${payment.documentNo} có số tiền chi không hợp lệ.`
    });
  }

  const allocatedAmount = payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (allocatedAmount > payment.amount) {
    violations.push({
      context: "payables",
      code: "supplier_payment_over_allocated",
      message: `${payment.documentNo} phân bổ vượt số tiền phiếu chi.`
    });
  }

  for (const allocation of payment.allocations) {
    if (!Number.isFinite(allocation.amount) || allocation.amount <= 0) {
      violations.push({
        context: "payables",
        code: "invalid_supplier_allocation_amount",
        message: `${payment.documentNo} có dòng phân bổ không hợp lệ.`
      });
    }
    const ledgerEntry = state.supplierLedgerEntries.find((entry) => entry.id === allocation.ledgerEntryId);
    if (!ledgerEntry || ledgerEntry.supplierId !== payment.supplierId || ledgerEntry.direction !== "credit" || ledgerEntry.reversedById || ledgerEntry.entryType === "reversal") {
      violations.push({
        context: "payables",
        code: "supplier_allocation_target_invalid",
        message: `${payment.documentNo} phân bổ vào dòng phải trả không hợp lệ.`
      });
    }
  }

  const allocatedByLedger = new Map<string, number>();
  for (const existingPayment of state.supplierPayments) {
    if (existingPayment.status === "reversed") {
      continue;
    }
    for (const allocation of existingPayment.allocations) {
      allocatedByLedger.set(allocation.ledgerEntryId, (allocatedByLedger.get(allocation.ledgerEntryId) ?? 0) + allocation.amount);
    }
  }
  for (const [ledgerEntryId, amount] of allocatedByLedger.entries()) {
    const ledgerEntry = state.supplierLedgerEntries.find((entry) => entry.id === ledgerEntryId);
    if (ledgerEntry && amount > ledgerEntry.amount) {
      violations.push({
        context: "payables",
        code: "supplier_ledger_entry_over_allocated",
        message: `Dòng phải trả ${ledgerEntry.sourceDocument} bị phân bổ vượt số tiền.`
      });
    }
  }

  validateAllocationStatus(payment, allocatedAmount, "payables", violations);
}

function validateAllocationStatus(
  payment: CustomerPayment | SupplierPayment,
  allocatedAmount: number,
  context: "receivables" | "payables",
  violations: OperationsInvariantViolation[]
) {
  const inconsistent =
    ((payment.status === "draft" || payment.status === "confirmed") && allocatedAmount > 0) ||
    (payment.status === "partially_allocated" && (allocatedAmount <= 0 || allocatedAmount >= payment.amount)) ||
    (payment.status === "allocated" && Math.abs(allocatedAmount - payment.amount) > 0.000001);
  if (inconsistent) {
    violations.push({
      context,
      code: "payment_allocation_status_mismatch",
      message: `${payment.documentNo} có trạng thái không khớp số tiền đã phân bổ.`
    });
  }
}

function validateCash(state: OperationsState, violations: OperationsInvariantViolation[]) {
  for (const voucher of state.cashVouchers) {
    if (voucher.amount <= 0 || !voucher.category.trim() || !voucher.description.trim()) {
      violations.push({
        context: "cash",
        code: "invalid_cash_voucher",
        message: `${voucher.documentNo} thiếu số tiền, nhóm thu chi hoặc diễn giải hợp lệ.`
      });
    }
    const originalTransactions = state.cashTransactions.filter((entry) => entry.sourceDocument === voucher.documentNo);
    const reversalTransactions = state.cashTransactions.filter((entry) => entry.sourceDocument === `REV-${voucher.documentNo}`);
    if (voucher.status === "draft" && (originalTransactions.length > 0 || reversalTransactions.length > 0)) {
      violations.push({ context: "cash", code: "draft_cash_posted", message: `${voucher.documentNo} còn nháp nhưng đã có giao dịch quỹ.` });
    }
    if (voucher.status !== "draft" && originalTransactions.length !== 1) {
      violations.push({ context: "cash", code: "missing_cash_posting", message: `${voucher.documentNo} đã xác nhận nhưng thiếu hoặc trùng giao dịch quỹ.` });
    }
    if (voucher.status === "reversed" && reversalTransactions.length !== 1) {
      violations.push({ context: "cash", code: "missing_cash_reversal", message: `${voucher.documentNo} đã đảo nhưng thiếu hoặc trùng bút toán đảo.` });
    }
  }

  for (const transaction of state.cashTransactions) {
    if (transaction.amount <= 0) {
      violations.push({
        context: "cash",
        code: "invalid_cash_amount",
        message: `${transaction.sourceDocument} có số tiền quỹ không hợp lệ.`
      });
    }

    if (!transaction.sourceDocument.trim()) {
      violations.push({
        context: "cash",
        code: "missing_source_document",
        message: "Giao dịch quỹ thiếu chứng từ nguồn."
      });
    }
  }

  if (cashBalance(state) < 0) {
    violations.push({ context: "cash", code: "negative_cash_balance", message: "Số dư quỹ tiền mặt bị âm sau giao dịch." });
  }

  for (const payment of state.employeePayments) {
    validatePostedPaymentPair({
      state,
      documentNo: payment.documentNo,
      status: payment.status,
      amount: payment.amount,
      cashDirection: "out",
      ledgerMatches: (entry) => entry.employeeId === payment.employeeId && entry.direction === "debit",
      reversalLedgerMatches: (entry) => entry.employeeId === payment.employeeId && entry.direction === "credit",
      ledgerEntries: state.employeeLedgerEntries,
      context: "cash",
      violations
    });
  }

  for (const advance of state.employeeAdvances) {
    if (advance.amount <= 0 || !advance.purpose.trim()) {
      violations.push({ context: "cash", code: "invalid_employee_advance", message: `${advance.documentNo} thiếu số tiền hoặc mục đích tạm ứng.` });
    }
    validatePostedPaymentPair({
      state,
      documentNo: advance.documentNo,
      status: advance.status,
      amount: advance.amount,
      cashDirection: "out",
      ledgerMatches: (entry) => entry.employeeId === advance.employeeId && entry.direction === "debit" && entry.entryType === "advance",
      reversalLedgerMatches: (entry) => entry.employeeId === advance.employeeId && entry.direction === "credit" && entry.entryType === "reversal",
      ledgerEntries: state.employeeLedgerEntries,
      context: "cash",
      violations
    });
  }
}

function validatePostedPaymentPair<T extends { sourceDocument: string; direction: "debit" | "credit"; amount: number }>(input: {
  state: OperationsState;
  documentNo: string;
  status: "draft" | "confirmed" | "partially_allocated" | "allocated" | "reversed";
  amount: number;
  cashDirection: "in" | "out";
  ledgerMatches: (entry: T) => boolean;
  reversalLedgerMatches: (entry: T) => boolean;
  ledgerEntries: T[];
  context: OperationsInvariantContext;
  violations: OperationsInvariantViolation[];
}) {
  const { state, documentNo, status, amount, cashDirection, ledgerMatches, reversalLedgerMatches, ledgerEntries, context, violations } = input;
  const reversalDocument = `REV-${documentNo}`;
  const originalCash = state.cashTransactions.filter((entry) =>
    entry.sourceDocument === documentNo && entry.direction === cashDirection && entry.amount === amount
  );
  const originalLedger = ledgerEntries.filter((entry) =>
    entry.sourceDocument === documentNo && entry.amount === amount && ledgerMatches(entry)
  );
  const reverseCash = state.cashTransactions.filter((entry) =>
    entry.sourceDocument === reversalDocument && entry.direction !== cashDirection && entry.amount === amount
  );
  const reverseLedger = ledgerEntries.filter((entry) =>
    entry.sourceDocument === reversalDocument && entry.amount === amount && reversalLedgerMatches(entry)
  );
  const originalCount = originalCash.length + originalLedger.length;
  const reverseCount = reverseCash.length + reverseLedger.length;

  if (status === "draft" && (originalCount > 0 || reverseCount > 0)) {
    violations.push({ context, code: "draft_payment_posted", message: `${documentNo} còn nháp nhưng đã có bút toán.` });
  }
  if (status !== "draft" && (originalCash.length !== 1 || originalLedger.length !== 1)) {
    violations.push({ context, code: "payment_posting_mismatch", message: `${documentNo} thiếu hoặc trùng bút toán quỹ/công nợ gốc.` });
  }
  if (status === "reversed" && (reverseCash.length !== 1 || reverseLedger.length !== 1)) {
    violations.push({ context, code: "payment_reversal_mismatch", message: `${documentNo} đã đảo nhưng thiếu hoặc trùng bút toán ngược.` });
  }
  if (status !== "reversed" && reverseCount > 0) {
    violations.push({ context, code: "unexpected_payment_reversal", message: `${documentNo} chưa đảo nhưng đã có bút toán ngược.` });
  }
}

function validateWorkforceAndCompensation(state: OperationsState, violations: OperationsInvariantViolation[]) {
  for (const workOrder of state.workOrders) {
    if (workOrder.status === "open") {
      const sourceOrder = workOrder.salesOrderId
        ? state.salesOrders.find((salesOrder) => salesOrder.id === workOrder.salesOrderId)
        : undefined;
      if (!sourceOrder) {
        violations.push({
          context: "workforce",
          code: "open_order_missing_source_sales_order",
          message: `${workOrder.documentNo} chờ nhận nhưng không liên kết đơn bán hợp lệ.`
        });
      }
      if (workOrder.participants.length !== 0 || workOrder.outputs.length !== 0 || workOrder.claimedByEmployeeId || workOrder.claimedAt) {
        violations.push({
          context: "workforce",
          code: "open_order_claim_data_invalid",
          message: `${workOrder.documentNo} đang chờ nhận nhưng đã có dữ liệu phân công.`
        });
      }
      continue;
    }

    if (workOrder.salesOrderId) {
      if (workOrder.status !== "assigned" || workOrder.participants.length !== 1 || !workOrder.claimedByEmployeeId || !workOrder.claimedAt) {
        violations.push({
          context: "workforce",
          code: "claimed_order_assignment_invalid",
          message: `${workOrder.documentNo} phải có đúng một thợ nhận và thời điểm nhận.`
        });
      } else if (workOrder.participants[0]?.employeeId !== workOrder.claimedByEmployeeId) {
        violations.push({
          context: "workforce",
          code: "claimed_order_worker_mismatch",
          message: `${workOrder.documentNo} có người nhận không khớp người được phân công.`
        });
      }
      continue;
    }

    if (workOrder.participants.length === 0) {
      violations.push({
        context: "workforce",
        code: "missing_participants",
        message: `${workOrder.documentNo} chưa có nhân sự tham gia.`
      });
    }

    for (const output of workOrder.outputs) {
      if (output.actualQuantity <= 0 || output.approvedQuantity < 0 || output.approvedQuantity > output.actualQuantity) {
        violations.push({
          context: "workforce",
          code: "output_quantity_out_of_range",
          message: `${workOrder.documentNo} có sản lượng không hợp lệ.`
        });
      }
    }
  }

  validateCompensationBatches(state.compensationBatches, state, violations);

  for (const entry of state.employeeLedgerEntries) {
    validateLedgerEntry(entry, "compensation", violations);
  }
}

function validateCompensationBatches(
  batches: CompensationBatch[],
  state: OperationsState,
  violations: OperationsInvariantViolation[]
) {
  const postedWorkOutputs = new Map<string, string>();

  for (const batch of batches) {
    if (!state.workOrders.some((workOrder) => workOrder.id === batch.workOrderId)) {
      violations.push({
        context: "compensation",
        code: "unknown_work_order",
        message: `${batch.documentNo} không liên kết phiếu công hợp lệ.`
      });
    }
    if (batch.totalAmount < 0) {
      violations.push({
        context: "compensation",
        code: "negative_batch_total",
        message: `${batch.documentNo} có tổng tiền công âm.`
      });
    }

    if (batch.status === "posted") {
      const lineSum = batch.lines.reduce((sum, line) => sum + line.amount, 0);
      if (lineSum !== batch.totalAmount) {
        violations.push({
          context: "compensation",
          code: "posted_batch_total_mismatch",
          message: `${batch.documentNo} tổng tiền chia không bằng tổng tiền công.`
        });
      }

      for (const line of batch.lines) {
        if (line.amount < 0) {
          violations.push({
            context: "compensation",
            code: "negative_compensation_line",
            message: `${batch.documentNo} có dòng tiền công âm.`
          });
        }

        const previousBatch = postedWorkOutputs.get(line.workOutputId);
        if (previousBatch && previousBatch !== batch.id) {
          violations.push({
            context: "compensation",
            code: "work_output_posted_twice",
            message: `Output ${line.workOutputId} đã được tính công ở nhiều bảng công.`
          });
        }
        postedWorkOutputs.set(line.workOutputId, batch.id);

        if (!state.employees.some((employee) => employee.id === line.employeeId)) {
          violations.push({
            context: "compensation",
            code: "unknown_employee",
            message: `${batch.documentNo} có dòng tiền công cho nhân sự không tồn tại.`
          });
        }
      }
    }
  }
}

function validateImport(state: OperationsState, violations: OperationsInvariantViolation[]) {
  const hashes = new Set<string>();
  for (const job of state.importJobs) {
    if (!job.fileName.trim() || !/^[a-f0-9]{64}$/.test(job.fileHash) || job.rowCount < 0 || job.issueCount < 0) {
      violations.push({ context: "import", code: "invalid_import_job", message: `Batch import ${job.id} thiếu metadata hợp lệ.` });
    }
    if (hashes.has(job.fileHash)) {
      violations.push({ context: "import", code: "duplicate_import_file", message: `${job.fileName} bị tạo batch trùng fingerprint.` });
    }
    hashes.add(job.fileHash);
    const linkedIssues = state.importIssues.filter((issue) => issue.importJobId === job.id);
    const hasOpenIssues = linkedIssues.some((issue) => issue.status === "open");
    if (linkedIssues.length !== job.issueCount) {
      violations.push({ context: "import", code: "import_issue_count_mismatch", message: `${job.fileName} có số vấn đề không khớp batch.` });
    }
    if ((job.status === "reviewed" && hasOpenIssues) || (job.status === "dry_run" && !hasOpenIssues)) {
      violations.push({ context: "import", code: "import_review_status_mismatch", message: `${job.fileName} có trạng thái rà soát không khớp vấn đề đang mở.` });
    }
  }
  for (const issue of state.importIssues) {
    if (issue.rowNumber <= 0 || !issue.sourceSheet.trim() || !issue.message.trim()) {
      violations.push({
        context: "import",
        code: "invalid_import_issue",
        message: `Vấn đề import ${issue.id} thiếu trang tính, dòng hoặc nội dung.`
      });
    }
    if (issue.importJobId && !state.importJobs.some((job) => job.id === issue.importJobId)) {
      violations.push({ context: "import", code: "missing_import_job", message: `Vấn đề ${issue.id} không còn batch import nguồn.` });
    }
  }
}

function validateLedgerEntry(
  entry: CustomerLedgerEntry | SupplierLedgerEntry | EmployeeLedgerEntry,
  context: "receivables" | "payables" | "compensation",
  violations: OperationsInvariantViolation[]
) {
  if (entry.amount <= 0) {
    violations.push({
      context,
      code: "invalid_ledger_amount",
      message: `${entry.sourceDocument} có số tiền sổ chi tiết không hợp lệ.`
    });
  }

  if (!entry.sourceDocument.trim()) {
    violations.push({
      context,
      code: "missing_source_document",
      message: "Ledger entry thiếu chứng từ nguồn."
    });
  }
}
