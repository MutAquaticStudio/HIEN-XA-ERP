import type { OperationsState } from "@/modules/operations/types";

export type CutoverMappingIssue = {
  code: string;
  message: string;
  path: string;
};

export type CutoverSourceEntityType =
  | "sales_order"
  | "purchase_order"
  | "delivery_job"
  | "inventory_posting"
  | "cash_voucher"
  | "cash_transaction"
  | "customer_payment"
  | "supplier_payment"
  | "employee_payment"
  | "employee_advance"
  | "customer_ledger_entry"
  | "supplier_ledger_entry"
  | "employee_ledger_entry"
  | "bank_transfer_proof"
  | "work_order"
  | "compensation_batch";

export type CutoverSourceDocumentOverride = {
  entityType: CutoverSourceEntityType;
  targetLegacyId: string;
};

export type CutoverPaymentMethod = "cash" | "bank_transfer" | "other";

export type CutoverPaymentOverride = {
  targetCashAccountId: string;
  method: CutoverPaymentMethod;
  postedAt: string;
  actorLegacyId: string;
};

export type CutoverCashVoucherOverride = {
  occurredAt: string;
  actorLegacyId: string;
};

export type CutoverAttachmentOverride = {
  bucket: string;
  objectPath: string;
  sha256: string;
};

export type CutoverMappingOverrides = {
  identityAliases?: Record<string, string>;
  sourceDocuments?: Record<string, CutoverSourceDocumentOverride>;
  cashAccounts?: Record<string, string>;
  paymentMetadata?: Record<string, CutoverPaymentOverride>;
  cashVoucherMetadata?: Record<string, CutoverCashVoucherOverride>;
  reversalTargets?: Record<string, string>;
  attachments?: Record<string, CutoverAttachmentOverride>;
  productBaseUnits?: Record<string, string>;
  deliveryLineAllocations?: Record<string, Record<string, number>>;
  locationPointIds?: Record<string, string>;
};

export type CutoverMappingValidation = {
  ready: boolean;
  issues: CutoverMappingIssue[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const PAYMENT_METHODS = new Set<CutoverPaymentMethod>(["cash", "bank_transfer", "other"]);

export function inspectOperationsCutoverMappings(
  state: OperationsState,
  overrides: CutoverMappingOverrides = {}
): CutoverMappingValidation {
  const issues: CutoverMappingIssue[] = [];
  collectIdentityAliasIssues(state, overrides, issues);
  collectSourceDocumentIssues(state, overrides, issues);
  collectCashAccountIssues(state, overrides, issues);
  collectPaymentMetadataIssues(state, overrides, issues);
  collectCashVoucherMetadataIssues(state, overrides, issues);
  collectAttachmentIssues(state, overrides, issues);
  collectProductBaseUnitIssues(state, overrides, issues);
  collectDeliveryAllocationIssues(state, overrides, issues);
  collectLocationPointIssues(state, overrides, issues);
  collectVehicleIssues(state, issues);

  return { ready: issues.length === 0, issues };
}

export function assertOperationsCutoverMappings(
  state: OperationsState,
  overrides: CutoverMappingOverrides = {}
): CutoverMappingValidation {
  const result = inspectOperationsCutoverMappings(state, overrides);
  if (!result.ready) {
    throw new Error(`CUTOVER_MAPPING_BLOCKED: ${result.issues.map((issue) => issue.code).join(", ")}`);
  }
  return result;
}

function collectIdentityAliasIssues(
  state: OperationsState,
  overrides: CutoverMappingOverrides,
  issues: CutoverMappingIssue[]
) {
  const actorReferences = [
    ...state.auditLogs.map((entry, index) => ({ actorLegacyId: entry.actorId, path: `auditLogs[${index}].actorId` })),
    ...state.bankTransferProofs.map((entry, index) => ({ actorLegacyId: entry.archivedBy, path: `bankTransferProofs[${index}].archivedBy` })),
    ...state.approvalRequests.flatMap((request, index) => [
      { actorLegacyId: request.submittedBy, path: `approvalRequests[${index}].submittedBy` },
      ...(request.approvedBy ? [{ actorLegacyId: request.approvedBy, path: `approvalRequests[${index}].approvedBy` }] : [])
    ]),
    ...(state.customerPaymentProofRequests ?? []).map((proof, index) => ({ actorLegacyId: proof.submittedBy, path: `customerPaymentProofRequests[${index}].submittedBy` })),
    ...state.purchaseOrders.flatMap((order, orderIndex) => [
      ...(order.supplierAcknowledgements ?? []).map((acknowledgement, index) => ({
        actorLegacyId: acknowledgement.submittedBy,
        path: `purchaseOrders[${orderIndex}].supplierAcknowledgements[${index}].submittedBy`
      })),
      ...(order.supplierDeliveryNotices ?? []).map((notice, index) => ({
        actorLegacyId: notice.submittedBy,
        path: `purchaseOrders[${orderIndex}].supplierDeliveryNotices[${index}].submittedBy`
      }))
    ]),
    ...collectAttachmentReferences(state).map((reference) => ({
      actorLegacyId: reference.uploadedBy,
      path: `${reference.path}.uploadedBy`
    }))
  ].map((entry) => ({
    ...entry,
    // Legacy attachment metadata can be incomplete. Preserve the reference so
    // rehearsal reports a fail-closed mapping issue instead of throwing here.
    actorLegacyId:
      typeof entry.actorLegacyId === "string" ? entry.actorLegacyId.trim() : ""
  }));

  for (const reference of actorReferences) {
    const targetUserId = overrides.identityAliases?.[reference.actorLegacyId];
    if (!targetUserId?.trim()) {
      issues.push({
        code: "CUTOVER_IDENTITY_ALIAS_REQUIRED",
        message: `Actor ${reference.actorLegacyId || "(missing)"} must be mapped to a Supabase Auth user before importing audit history.`,
        path: reference.path
      });
    } else if (!UUID_PATTERN.test(targetUserId)) {
      issues.push({
        code: "CUTOVER_IDENTITY_ALIAS_INVALID",
        message: `Actor ${reference.actorLegacyId} has an invalid target Auth user id.`,
        path: reference.path
      });
    }
  }
}

function collectSourceDocumentIssues(
  state: OperationsState,
  overrides: CutoverMappingOverrides,
  issues: CutoverMappingIssue[]
) {
  const targetIds = knownSourceEntityIds(state);
  const references = [
    ...state.customerLedgerEntries.map((entry, index) => ({ value: entry.sourceDocument, path: `customerLedgerEntries[${index}].sourceDocument` })),
    ...state.supplierLedgerEntries.map((entry, index) => ({ value: entry.sourceDocument, path: `supplierLedgerEntries[${index}].sourceDocument` })),
    ...state.employeeLedgerEntries.map((entry, index) => ({ value: entry.sourceDocument, path: `employeeLedgerEntries[${index}].sourceDocument` })),
    ...state.inventoryMovements.map((entry, index) => ({ value: entry.sourceDocument, path: `inventoryMovements[${index}].sourceDocument` })),
    ...state.cashTransactions.map((entry, index) => ({ value: entry.sourceDocument, path: `cashTransactions[${index}].sourceDocument` })),
    ...state.workOrders.map((entry, index) => ({ value: entry.sourceDocument, path: `workOrders[${index}].sourceDocument` }))
  ];

  for (const reference of references) {
    const sourceDocument = reference.value.trim();
    if (!sourceDocument) {
      issues.push({
        code: "CUTOVER_SOURCE_DOCUMENT_REQUIRED",
        message: "A posted record is missing its legacy source document reference.",
        path: reference.path
      });
      continue;
    }
    const mapping = overrides.sourceDocuments?.[sourceDocument];
    if (!mapping) {
      issues.push({
        code: "CUTOVER_SOURCE_DOCUMENT_MAPPING_REQUIRED",
        message: `Legacy source document ${sourceDocument} needs an explicit typed target mapping.`,
        path: reference.path
      });
      continue;
    }
    const targetIdsForEntity = targetIds[mapping.entityType];
    if (!targetIdsForEntity?.has(mapping.targetLegacyId)) {
      issues.push({
        code: "CUTOVER_SOURCE_DOCUMENT_TARGET_UNKNOWN",
        message: `Legacy source document ${sourceDocument} maps to an unknown ${mapping.entityType} id.`,
        path: reference.path
      });
    }
  }
}

function collectCashAccountIssues(
  state: OperationsState,
  overrides: CutoverMappingOverrides,
  issues: CutoverMappingIssue[]
) {
  const accounts = new Set([
    ...state.cashTransactions.map((entry) => entry.accountName),
    ...state.cashVouchers.map((entry) => entry.accountName)
  ]);
  for (const accountName of accounts) {
    const targetCashAccountId = overrides.cashAccounts?.[accountName];
    if (!targetCashAccountId?.trim()) {
      issues.push({
        code: "CUTOVER_CASH_ACCOUNT_MAPPING_REQUIRED",
        message: `Runtime cash account ${accountName} must be mapped to a normalized cash account.`,
        path: `cashAccounts.${accountName}`
      });
    } else if (!UUID_PATTERN.test(targetCashAccountId)) {
      issues.push({
        code: "CUTOVER_CASH_ACCOUNT_MAPPING_INVALID",
        message: `Runtime cash account ${accountName} has an invalid normalized account id.`,
        path: `cashAccounts.${accountName}`
      });
    }
  }
}

function collectPaymentMetadataIssues(
  state: OperationsState,
  overrides: CutoverMappingOverrides,
  issues: CutoverMappingIssue[]
) {
  const paymentDocuments = [
    ...state.customerPayments.map((payment) => ({ key: `customer_payment:${payment.id}`, id: payment.id, reversed: payment.status === "reversed", candidates: state.customerPayments.map((candidate) => candidate.id), path: `customerPayments.${payment.id}` })),
    ...state.supplierPayments.map((payment) => ({ key: `supplier_payment:${payment.id}`, id: payment.id, reversed: payment.status === "reversed", candidates: state.supplierPayments.map((candidate) => candidate.id), path: `supplierPayments.${payment.id}` })),
    ...state.employeePayments.map((payment) => ({ key: `employee_payment:${payment.id}`, id: payment.id, reversed: payment.status === "reversed", candidates: state.employeePayments.map((candidate) => candidate.id), path: `employeePayments.${payment.id}` })),
    ...state.employeeAdvances.map((advance) => ({ key: `employee_advance:${advance.id}`, id: advance.id, reversed: advance.status === "reversed", candidates: state.employeeAdvances.map((candidate) => candidate.id), path: `employeeAdvances.${advance.id}` }))
  ];

  for (const payment of paymentDocuments) {
    const metadata = overrides.paymentMetadata?.[payment.key];
    if (!metadata) {
      issues.push({
        code: "CUTOVER_PAYMENT_METADATA_REQUIRED",
        message: `Payment document ${payment.key} needs account, method, effective time, and actor metadata.`,
        path: payment.path
      });
      if (payment.reversed) {
        collectReversalTargetIssue(payment.key, payment.id, payment.candidates, payment.path, overrides, issues);
      }
      continue;
    }
    if (!UUID_PATTERN.test(metadata.targetCashAccountId)) {
      issues.push({
        code: "CUTOVER_PAYMENT_ACCOUNT_INVALID",
        message: `Payment document ${payment.key} has an invalid target cash account id.`,
        path: payment.path
      });
    }
    if (!PAYMENT_METHODS.has(metadata.method)) {
      issues.push({
        code: "CUTOVER_PAYMENT_METHOD_INVALID",
        message: `Payment document ${payment.key} has an unsupported payment method.`,
        path: payment.path
      });
    }
    if (!metadata.postedAt.trim() || Number.isNaN(Date.parse(metadata.postedAt))) {
      issues.push({
        code: "CUTOVER_PAYMENT_POSTED_AT_INVALID",
        message: `Payment document ${payment.key} needs a valid effective timestamp.`,
        path: payment.path
      });
    }
    const actorTargetUserId = overrides.identityAliases?.[metadata.actorLegacyId];
    if (!metadata.actorLegacyId.trim() || !actorTargetUserId || !UUID_PATTERN.test(actorTargetUserId)) {
      issues.push({
        code: "CUTOVER_PAYMENT_ACTOR_ALIAS_REQUIRED",
        message: `Payment document ${payment.key} must be attributed through a valid identity alias.`,
        path: payment.path
      });
    }
    if (payment.reversed) {
      collectReversalTargetIssue(payment.key, payment.id, payment.candidates, payment.path, overrides, issues);
    }
  }
}

function collectCashVoucherMetadataIssues(
  state: OperationsState,
  overrides: CutoverMappingOverrides,
  issues: CutoverMappingIssue[]
) {
  for (const voucher of state.cashVouchers) {
    const key = `cash_voucher:${voucher.id}`;
    const metadata = overrides.cashVoucherMetadata?.[key];
    if (!metadata) {
      issues.push({
        code: "CUTOVER_CASH_VOUCHER_METADATA_REQUIRED",
        message: `Cash voucher ${key} needs an effective time and actor metadata.`,
        path: `cashVouchers.${voucher.id}`
      });
      if (voucher.status === "reversed") {
        collectReversalTargetIssue(key, voucher.id, state.cashVouchers.map((candidate) => candidate.id), `cashVouchers.${voucher.id}`, overrides, issues);
      }
      continue;
    }
    if (!metadata.occurredAt.trim() || Number.isNaN(Date.parse(metadata.occurredAt))) {
      issues.push({
        code: "CUTOVER_CASH_VOUCHER_OCCURRED_AT_INVALID",
        message: `Cash voucher ${key} needs a valid effective timestamp.`,
        path: `cashVouchers.${voucher.id}`
      });
    }
    const actorTargetUserId = overrides.identityAliases?.[metadata.actorLegacyId];
    if (!metadata.actorLegacyId.trim() || !actorTargetUserId || !UUID_PATTERN.test(actorTargetUserId)) {
      issues.push({
        code: "CUTOVER_CASH_VOUCHER_ACTOR_ALIAS_REQUIRED",
        message: `Cash voucher ${key} must be attributed through a valid identity alias.`,
        path: `cashVouchers.${voucher.id}`
      });
    }
    if (voucher.status === "reversed") {
      collectReversalTargetIssue(key, voucher.id, state.cashVouchers.map((candidate) => candidate.id), `cashVouchers.${voucher.id}`, overrides, issues);
    }
  }
}

function collectReversalTargetIssue(
  key: string,
  sourceId: string,
  candidates: string[],
  path: string,
  overrides: CutoverMappingOverrides,
  issues: CutoverMappingIssue[]
) {
  const targetId = overrides.reversalTargets?.[key];
  if (!targetId) {
    issues.push({
      code: "CUTOVER_REVERSAL_TARGET_REQUIRED",
      message: `Reversed document ${key} needs an explicit reversal target before import.`,
      path
    });
  } else if (targetId === sourceId || !candidates.includes(targetId)) {
    issues.push({
      code: "CUTOVER_REVERSAL_TARGET_INVALID",
      message: `Reversed document ${key} has an invalid reversal target.`,
      path
    });
  }
}

function collectAttachmentIssues(
  state: OperationsState,
  overrides: CutoverMappingOverrides,
  issues: CutoverMappingIssue[]
) {
  for (const attachmentId of new Set(collectAttachmentReferences(state).map((reference) => reference.id))) {
    const attachment = overrides.attachments?.[attachmentId];
    if (!attachment) {
      issues.push({
        code: "CUTOVER_ATTACHMENT_MAPPING_REQUIRED",
        message: `Attachment ${attachmentId} needs a verified Storage bucket, object path, and SHA-256 hash.`,
        path: `attachments.${attachmentId}`
      });
      continue;
    }
    if (!attachment.bucket.trim() || !attachment.objectPath.trim() || attachment.objectPath.startsWith("/") || attachment.objectPath.includes("..") || !SHA256_PATTERN.test(attachment.sha256)) {
      issues.push({
        code: "CUTOVER_ATTACHMENT_MAPPING_INVALID",
        message: `Attachment ${attachmentId} has invalid Storage provenance metadata.`,
        path: `attachments.${attachmentId}`
      });
    }
  }
}

type AttachmentReference = {
  id: string;
  uploadedBy: string;
  path: string;
};

function collectAttachmentReferences(state: OperationsState): AttachmentReference[] {
  return [
    ...state.salesOrders.flatMap((order, orderIndex) => (order.attachments ?? []).map((attachment, index) => ({
      id: attachment.id,
      uploadedBy: attachment.uploadedBy,
      path: `salesOrders[${orderIndex}].attachments[${index}]`
    }))),
    ...state.purchaseOrders.flatMap((order, orderIndex) => [
      ...(order.attachments ?? []).map((attachment, index) => ({
        id: attachment.id,
        uploadedBy: attachment.uploadedBy,
        path: `purchaseOrders[${orderIndex}].attachments[${index}]`
      })),
      ...(order.supplierDeliveryNotices ?? []).flatMap((notice, noticeIndex) => notice.attachments.map((attachment, attachmentIndex) => ({
        id: attachment.id,
        uploadedBy: attachment.uploadedBy,
        path: `purchaseOrders[${orderIndex}].supplierDeliveryNotices[${noticeIndex}].attachments[${attachmentIndex}]`
      })))
    ]),
    ...state.deliveryJobs.flatMap((job, jobIndex) => (job.completionAttachments ?? []).map((attachment, index) => ({
      id: attachment.id,
      uploadedBy: attachment.uploadedBy,
      path: `deliveryJobs[${jobIndex}].completionAttachments[${index}]`
    }))),
    ...state.approvalRequests.flatMap((request, requestIndex) => (request.attachments ?? []).map((attachment, index) => ({
      id: attachment.id,
      uploadedBy: attachment.uploadedBy,
      path: `approvalRequests[${requestIndex}].attachments[${index}]`
    }))),
    ...(state.customerPaymentProofRequests ?? []).flatMap((proof, proofIndex) => proof.attachments.map((attachment, index) => ({
      id: attachment.id,
      uploadedBy: attachment.uploadedBy,
      path: `customerPaymentProofRequests[${proofIndex}].attachments[${index}]`
    }))),
    ...state.bankTransferProofs.flatMap((proof, proofIndex) => proof.attachments.map((attachment, index) => ({
      id: attachment.id,
      uploadedBy: attachment.uploadedBy,
      path: `bankTransferProofs[${proofIndex}].attachments[${index}]`
    })))
  ];
}

function collectProductBaseUnitIssues(
  state: OperationsState,
  overrides: CutoverMappingOverrides,
  issues: CutoverMappingIssue[]
) {
  const productUnits = new Map<string, Set<string>>();
  for (const unit of state.productUnits) {
    const values = productUnits.get(unit.productCode) ?? new Set<string>();
    values.add(unit.id);
    productUnits.set(unit.productCode, values);
  }
  for (const [productCode, unitIds] of productUnits) {
    if (unitIds.size < 2) continue;
    const baseUnitId = overrides.productBaseUnits?.[productCode];
    if (!baseUnitId) {
      issues.push({
        code: "CUTOVER_PRODUCT_BASE_UNIT_REQUIRED",
        message: `Product ${productCode} has multiple runtime units and needs an explicit base unit.`,
        path: `productUnits.${productCode}`
      });
    } else if (!unitIds.has(baseUnitId)) {
      issues.push({
        code: "CUTOVER_PRODUCT_BASE_UNIT_UNKNOWN",
        message: `Product ${productCode} base unit is not one of its runtime product units.`,
        path: `productUnits.${productCode}`
      });
    }
  }
}

function collectDeliveryAllocationIssues(
  state: OperationsState,
  overrides: CutoverMappingOverrides,
  issues: CutoverMappingIssue[]
) {
  const jobsBySalesOrder = new Map<string, typeof state.deliveryJobs>();
  for (const job of state.deliveryJobs) {
    const jobs = jobsBySalesOrder.get(job.salesOrderId) ?? [];
    jobs.push(job);
    jobsBySalesOrder.set(job.salesOrderId, jobs);
  }
  for (const [salesOrderId, jobs] of jobsBySalesOrder) {
    if (jobs.length < 2) continue;
    const order = state.salesOrders.find((candidate) => candidate.id === salesOrderId);
    if (!order) continue;
    const allocatedByLine = new Map<string, number>();
    for (const job of jobs) {
      const allocation = overrides.deliveryLineAllocations?.[job.id];
      if (!allocation || Object.keys(allocation).length === 0) {
        issues.push({
          code: "CUTOVER_DELIVERY_ALLOCATION_REQUIRED",
          message: `Delivery job ${job.id} needs an explicit line allocation because order ${salesOrderId} has multiple jobs.`,
          path: `deliveryJobs.${job.id}`
        });
        continue;
      }
      for (const [lineId, quantity] of Object.entries(allocation)) {
        if (!order.lines.some((line) => line.id === lineId)) {
          issues.push({
            code: "CUTOVER_DELIVERY_ALLOCATION_LINE_UNKNOWN",
            message: `Delivery job ${job.id} allocates an unknown sales line ${lineId}.`,
            path: `deliveryJobs.${job.id}`
          });
          continue;
        }
        if (!Number.isFinite(quantity) || quantity < 0) {
          issues.push({
            code: "CUTOVER_DELIVERY_ALLOCATION_INVALID",
            message: `Delivery job ${job.id} has an invalid allocation quantity for line ${lineId}.`,
            path: `deliveryJobs.${job.id}`
          });
          continue;
        }
        allocatedByLine.set(lineId, (allocatedByLine.get(lineId) ?? 0) + quantity);
      }
    }
    for (const line of order.lines) {
      const allocatedQuantity = allocatedByLine.get(line.id) ?? 0;
      if (allocatedQuantity !== line.deliveredQuantity) {
        issues.push({
          code: "CUTOVER_DELIVERY_ALLOCATION_MISMATCH",
          message: `Delivery allocations for sales line ${line.id} total ${allocatedQuantity}, expected ${line.deliveredQuantity}.`,
          path: `salesOrders.${salesOrderId}.lines.${line.id}`
        });
      }
    }
  }
}

function collectLocationPointIssues(
  state: OperationsState,
  overrides: CutoverMappingOverrides,
  issues: CutoverMappingIssue[]
) {
  for (const workOrder of state.workOrders) {
    (workOrder.locationHistory ?? []).forEach((_, index) => {
      const key = `${workOrder.id}:${index}`;
      if (!overrides.locationPointIds?.[key]?.trim()) {
        issues.push({
          code: "CUTOVER_LOCATION_POINT_ID_REQUIRED",
          message: `Location point ${key} needs its original tracking-event identifier before import.`,
          path: `workOrders.${workOrder.id}.locationHistory.${index}`
        });
      }
    });
  }
}

function collectVehicleIssues(state: OperationsState, issues: CutoverMappingIssue[]) {
  for (const vehicle of state.vehicles) {
    if (!Number.isFinite(vehicle.capacityTons) || vehicle.capacityTons <= 0) {
      issues.push({
        code: "CUTOVER_VEHICLE_CAPACITY_INVALID",
        message: `Vehicle ${vehicle.id} needs a positive capacity in tons before import.`,
        path: `vehicles.${vehicle.id}.capacityTons`
      });
    }
  }
}

function knownSourceEntityIds(state: OperationsState): Record<CutoverSourceEntityType, Set<string>> {
  return {
    sales_order: new Set(state.salesOrders.map((entry) => entry.id)),
    purchase_order: new Set(state.purchaseOrders.map((entry) => entry.id)),
    delivery_job: new Set(state.deliveryJobs.map((entry) => entry.id)),
    inventory_posting: new Set(state.inventoryMovements.map((entry) => entry.id)),
    cash_voucher: new Set(state.cashVouchers.map((entry) => entry.id)),
    cash_transaction: new Set(state.cashTransactions.map((entry) => entry.id)),
    customer_payment: new Set(state.customerPayments.map((entry) => entry.id)),
    supplier_payment: new Set(state.supplierPayments.map((entry) => entry.id)),
    employee_payment: new Set(state.employeePayments.map((entry) => entry.id)),
    employee_advance: new Set(state.employeeAdvances.map((entry) => entry.id)),
    customer_ledger_entry: new Set(state.customerLedgerEntries.map((entry) => entry.id)),
    supplier_ledger_entry: new Set(state.supplierLedgerEntries.map((entry) => entry.id)),
    employee_ledger_entry: new Set(state.employeeLedgerEntries.map((entry) => entry.id)),
    bank_transfer_proof: new Set(state.bankTransferProofs.map((entry) => entry.id)),
    work_order: new Set(state.workOrders.map((entry) => entry.id)),
    compensation_batch: new Set(state.compensationBatches.map((entry) => entry.id))
  };
}

export function cutoverSourceEntityLegacyMapEntityType(entityType: CutoverSourceEntityType) {
  return entityType === "inventory_posting" ? "inventory_movement" : entityType;
}
