import { createHash } from "node:crypto";
import type {
  CustomerPayment,
  EmployeeAdvance,
  EmployeePayment,
  OperationsState,
  SupplierPayment
} from "@/modules/operations/types";
import {
  createDeterministicLegacyUuid,
  createLegacyIdMap,
  inspectOperationsStateForCutover,
  type CutoverLegacyIdMap,
  type CutoverSource
} from "./operations-cutover";
import {
  assertOperationsCutoverMappings,
  cutoverSourceEntityLegacyMapEntityType,
  type CutoverMappingOverrides,
  type CutoverPaymentOverride,
  type CutoverSourceDocumentOverride
} from "./operations-cutover-overrides";

export type PaymentCashCutoverRow = {
  id: string;
  legacyId: string;
  values: Record<string, unknown>;
};

export type PaymentCashCutoverBatch = {
  name: string;
  table: string;
  operation: "insert" | "update";
  rows: PaymentCashCutoverRow[];
};

export type PaymentCashCutoverPlan = {
  planVersion: 1;
  scope: "payments_and_cash";
  isComplete: false;
  source: CutoverSource;
  sourceChecksum: string;
  generatedAt: string;
  requiredCashAccountIds: string[];
  idMap: CutoverLegacyIdMap[];
  batches: PaymentCashCutoverBatch[];
  deferredCollections: string[];
  planChecksum: string;
};

export type CreatePaymentCashCutoverPlanInput = {
  namespace: string;
  sourceRevision: number;
  stateSchemaVersion: number;
  generatedAt: string;
  mappingOverrides: CutoverMappingOverrides;
};

export type UnsignedPaymentCashCutoverPlan = Omit<PaymentCashCutoverPlan, "planChecksum">;

type IdResolver = {
  legacy(entityType: string, legacyId: string): string;
  derived(entityType: string, legacyId: string): string;
};

type ResolvedSourceDocument = {
  sourceType: string;
  sourceId: string;
};

const DEFERRED_COLLECTIONS = [
  "bankTransferProofAttachments",
  "documentAttachmentLinks",
  "approvalRequests",
  "customerPaymentProofRequests",
  "workOrders",
  "compensationBatches",
  "importJobs",
  "importIssues",
  "auditLogs",
  "processedOperations"
] as const;

export function createPaymentCashCutoverPlan(
  state: OperationsState,
  input: CreatePaymentCashCutoverPlanInput
): PaymentCashCutoverPlan {
  assertTimestamp(input.generatedAt, "generatedAt");
  const manifest = inspectOperationsStateForCutover(state, {
    namespace: input.namespace,
    revision: input.sourceRevision,
    stateSchemaVersion: input.stateSchemaVersion,
    now: input.generatedAt
  });
  if (!manifest.ready) {
    throw new Error(`CUTOVER_STATE_BLOCKED: ${manifest.issues.map((issue) => issue.code).join(", ")}`);
  }
  assertOperationsCutoverMappings(state, input.mappingOverrides);

  const idMap = createLegacyIdMap(state, input.namespace);
  const ids = createIdResolver(idMap, input.namespace);
  const source = (documentNo: string) => resolveSourceDocument(documentNo, input.mappingOverrides, ids);
  const batches = buildPaymentCashBatches(state, ids, source, input);
  const requiredCashAccountIds = collectRequiredCashAccountIds(state, input.mappingOverrides);
  const unsignedPlan: UnsignedPaymentCashCutoverPlan = {
    planVersion: 1,
    scope: "payments_and_cash",
    isComplete: false,
    source: manifest.source,
    sourceChecksum: manifest.sourceChecksum,
    generatedAt: input.generatedAt,
    requiredCashAccountIds,
    idMap,
    batches,
    deferredCollections: [...DEFERRED_COLLECTIONS]
  };
  return {
    ...unsignedPlan,
    planChecksum: calculatePaymentCashCutoverPlanChecksum(unsignedPlan)
  };
}

export function calculatePaymentCashCutoverPlanChecksum(
  plan: PaymentCashCutoverPlan | UnsignedPaymentCashCutoverPlan
) {
  const { planChecksum: _planChecksum, ...unsignedPlan } = plan as PaymentCashCutoverPlan;
  return checksum(unsignedPlan);
}

function buildPaymentCashBatches(
  state: OperationsState,
  ids: IdResolver,
  source: (documentNo: string) => ResolvedSourceDocument,
  input: CreatePaymentCashCutoverPlanInput
): PaymentCashCutoverBatch[] {
  const customerPaymentRows = state.customerPayments.slice().sort(compareId).map((payment) => customerPaymentRow(payment, ids, input.mappingOverrides));
  const supplierPaymentRows = state.supplierPayments.slice().sort(compareId).map((payment) => supplierPaymentRow(payment, ids, input.mappingOverrides));
  const employeePaymentRows = state.employeePayments.slice().sort(compareId).map((payment) => employeePaymentRow(payment, ids, input.mappingOverrides));
  const employeeAdvanceRows = state.employeeAdvances.slice().sort(compareId).map((advance) => employeeAdvanceRow(advance, ids, input.mappingOverrides));
  const cashVoucherRows = state.cashVouchers.slice().sort(compareId).map((voucher) => {
    const metadata = cashVoucherMetadata(input.mappingOverrides, voucher.id);
    const actorId = identityAlias(input.mappingOverrides, metadata.actorLegacyId);
    return row(ids.legacy("cash_voucher", voucher.id), voucher.id, {
      document_no: voucher.documentNo,
      cash_account_id: cashAccountId(input.mappingOverrides, voucher.accountName),
      direction: voucher.direction,
      category: voucher.category,
      description: voucher.description,
      amount: voucher.amount,
      status: voucher.status,
      version: 1,
      idempotency_key: idempotencyKey("cash_voucher", voucher.id),
      created_at: metadata.occurredAt,
      created_by: actorId,
      confirmed_at: voucher.status === "draft" ? null : metadata.occurredAt,
      confirmed_by: voucher.status === "draft" ? null : actorId,
      reversed_by_id: reversalTargetId(input.mappingOverrides, "cash_voucher", voucher.id, voucher.status, ids),
      reversal_reason: null,
      legacy_runtime_id: voucher.id
    });
  });
  const customerAllocationRows = state.customerPayments.flatMap((payment) => payment.allocations.map((allocation) => {
    const metadata = paymentMetadata(input.mappingOverrides, "customer_payment", payment.id);
    return row(ids.derived("customer_payment_allocation", `${payment.id}:${allocation.ledgerEntryId}`), `${payment.id}:${allocation.ledgerEntryId}`, {
      payment_id: ids.legacy("customer_payment", payment.id),
      ledger_entry_id: ids.legacy("customer_ledger_entry", allocation.ledgerEntryId),
      amount: allocation.amount,
      created_at: metadata.postedAt,
      created_by: identityAlias(input.mappingOverrides, metadata.actorLegacyId),
      legacy_runtime_id: `${payment.id}:${allocation.ledgerEntryId}`
    });
  }));
  const supplierAllocationRows = state.supplierPayments.flatMap((payment) => payment.allocations.map((allocation) => {
    const metadata = paymentMetadata(input.mappingOverrides, "supplier_payment", payment.id);
    return row(ids.derived("supplier_payment_allocation", `${payment.id}:${allocation.ledgerEntryId}`), `${payment.id}:${allocation.ledgerEntryId}`, {
      payment_id: ids.legacy("supplier_payment", payment.id),
      ledger_entry_id: ids.legacy("supplier_ledger_entry", allocation.ledgerEntryId),
      amount: allocation.amount,
      created_at: metadata.postedAt,
      created_by: identityAlias(input.mappingOverrides, metadata.actorLegacyId),
      legacy_runtime_id: `${payment.id}:${allocation.ledgerEntryId}`
    });
  }));
  const cashTransactionRows = state.cashTransactions.slice().sort(compareId).map((transaction) => {
    const resolved = source(transaction.sourceDocument);
    return row(ids.legacy("cash_transaction", transaction.id), transaction.id, {
      cash_account_id: cashAccountId(input.mappingOverrides, transaction.accountName),
      source_type: resolved.sourceType,
      source_id: resolved.sourceId,
      direction: transaction.direction,
      amount: transaction.amount,
      posted_at: transaction.postedAt,
      posted_by: null,
      reversed_by_id: null,
      legacy_runtime_id: transaction.id
    });
  });
  const proofRows = state.bankTransferProofs.slice().sort(compareId).map((proof) => row(ids.legacy("bank_transfer_proof", proof.id), proof.id, {
    document_no: proof.documentNo,
    direction: proof.direction,
    amount: proof.amount,
    counterparty_name: proof.counterpartyName,
    transaction_reference: proof.transactionReference,
    transferred_at: proof.transferredAt,
    related_document_no: proof.relatedDocumentNo ?? null,
    note: proof.note ?? null,
    idempotency_key: idempotencyKey("bank_transfer_proof", proof.id),
    archived_by: identityAlias(input.mappingOverrides, proof.archivedBy),
    archived_at: proof.archivedAt,
    created_at: proof.archivedAt,
    legacy_runtime_id: proof.id
  }));

  return [
    batch("cash.vouchers", "cash_vouchers", "insert", cashVoucherRows),
    batch("receivables.payments", "customer_payments", "insert", customerPaymentRows),
    batch("payables.payments", "supplier_payments", "insert", supplierPaymentRows),
    batch("workforce.employee-payments", "employee_payments", "insert", employeePaymentRows),
    batch("workforce.employee-advances", "employee_advances", "insert", employeeAdvanceRows),
    batch("receivables.payment-allocations", "customer_payment_allocations", "insert", customerAllocationRows),
    batch("payables.payment-allocations", "supplier_payment_allocations", "insert", supplierAllocationRows),
    batch("cash.transactions", "cash_transactions", "insert", cashTransactionRows),
    batch("cash.transfer-proofs", "bank_transfer_proofs", "insert", proofRows)
  ];
}

function customerPaymentRow(payment: CustomerPayment, ids: IdResolver, overrides: CutoverMappingOverrides) {
  const metadata = paymentMetadata(overrides, "customer_payment", payment.id);
  const actorId = identityAlias(overrides, metadata.actorLegacyId);
  return row(ids.legacy("customer_payment", payment.id), payment.id, {
    document_no: payment.documentNo,
    customer_id: ids.legacy("customer", payment.customerId),
    cash_account_id: metadata.targetCashAccountId,
    amount: payment.amount,
    method: metadata.method,
    status: payment.status,
    version: 1,
    idempotency_key: idempotencyKey("customer_payment", payment.id),
    created_at: metadata.postedAt,
    created_by: actorId,
    confirmed_at: payment.status === "draft" ? null : metadata.postedAt,
    confirmed_by: payment.status === "draft" ? null : actorId,
    reversed_by_id: reversalTargetId(overrides, "customer_payment", payment.id, payment.status, ids),
    legacy_runtime_id: payment.id
  });
}

function supplierPaymentRow(payment: SupplierPayment, ids: IdResolver, overrides: CutoverMappingOverrides) {
  const metadata = paymentMetadata(overrides, "supplier_payment", payment.id);
  const actorId = identityAlias(overrides, metadata.actorLegacyId);
  return row(ids.legacy("supplier_payment", payment.id), payment.id, {
    document_no: payment.documentNo,
    supplier_id: ids.legacy("supplier", payment.supplierId),
    cash_account_id: metadata.targetCashAccountId,
    amount: payment.amount,
    method: metadata.method,
    status: payment.status,
    version: 1,
    idempotency_key: idempotencyKey("supplier_payment", payment.id),
    created_at: metadata.postedAt,
    created_by: actorId,
    confirmed_at: payment.status === "draft" ? null : metadata.postedAt,
    confirmed_by: payment.status === "draft" ? null : actorId,
    reversed_by_id: reversalTargetId(overrides, "supplier_payment", payment.id, payment.status, ids),
    legacy_runtime_id: payment.id
  });
}

function employeePaymentRow(payment: EmployeePayment, ids: IdResolver, overrides: CutoverMappingOverrides) {
  const metadata = paymentMetadata(overrides, "employee_payment", payment.id);
  const actorId = identityAlias(overrides, metadata.actorLegacyId);
  return row(ids.legacy("employee_payment", payment.id), payment.id, {
    document_no: payment.documentNo,
    employee_id: ids.legacy("employee", payment.employeeId),
    cash_account_id: metadata.targetCashAccountId,
    amount: payment.amount,
    status: payment.status,
    version: 1,
    idempotency_key: idempotencyKey("employee_payment", payment.id),
    created_at: metadata.postedAt,
    created_by: actorId,
    confirmed_at: payment.status === "draft" ? null : metadata.postedAt,
    confirmed_by: payment.status === "draft" ? null : actorId,
    reversed_by_id: reversalTargetId(overrides, "employee_payment", payment.id, payment.status, ids),
    reversal_reason: null,
    legacy_runtime_id: payment.id
  });
}

function employeeAdvanceRow(advance: EmployeeAdvance, ids: IdResolver, overrides: CutoverMappingOverrides) {
  const metadata = paymentMetadata(overrides, "employee_advance", advance.id);
  const actorId = identityAlias(overrides, metadata.actorLegacyId);
  return row(ids.legacy("employee_advance", advance.id), advance.id, {
    document_no: advance.documentNo,
    employee_id: ids.legacy("employee", advance.employeeId),
    cash_account_id: metadata.targetCashAccountId,
    purpose: advance.purpose,
    amount: advance.amount,
    status: advance.status,
    version: 1,
    idempotency_key: idempotencyKey("employee_advance", advance.id),
    created_at: metadata.postedAt,
    created_by: actorId,
    confirmed_at: advance.status === "draft" ? null : metadata.postedAt,
    confirmed_by: advance.status === "draft" ? null : actorId,
    reversed_by_id: reversalTargetId(overrides, "employee_advance", advance.id, advance.status, ids),
    reversal_reason: null,
    legacy_runtime_id: advance.id
  });
}

function collectRequiredCashAccountIds(state: OperationsState, overrides: CutoverMappingOverrides) {
  const accountIds = new Set<string>();
  for (const accountName of [
    ...state.cashTransactions.map((transaction) => transaction.accountName),
    ...state.cashVouchers.map((voucher) => voucher.accountName)
  ]) {
    accountIds.add(cashAccountId(overrides, accountName));
  }
  for (const [kind, id] of [
    ...state.customerPayments.map((payment) => ["customer_payment", payment.id] as const),
    ...state.supplierPayments.map((payment) => ["supplier_payment", payment.id] as const),
    ...state.employeePayments.map((payment) => ["employee_payment", payment.id] as const),
    ...state.employeeAdvances.map((advance) => ["employee_advance", advance.id] as const)
  ]) {
    accountIds.add(paymentMetadata(overrides, kind, id).targetCashAccountId);
  }
  return [...accountIds].sort();
}

function paymentMetadata(overrides: CutoverMappingOverrides, type: string, id: string): CutoverPaymentOverride {
  const metadata = overrides.paymentMetadata?.[`${type}:${id}`];
  if (!metadata) throw new Error(`CUTOVER_PAYMENT_METADATA_REQUIRED: ${type}:${id} has no metadata.`);
  return metadata;
}

function cashVoucherMetadata(overrides: CutoverMappingOverrides, id: string) {
  const metadata = overrides.cashVoucherMetadata?.[`cash_voucher:${id}`];
  if (!metadata) throw new Error(`CUTOVER_CASH_VOUCHER_METADATA_REQUIRED: cash_voucher:${id} has no metadata.`);
  return metadata;
}

function cashAccountId(overrides: CutoverMappingOverrides, accountName: string) {
  const id = overrides.cashAccounts?.[accountName];
  if (!id) throw new Error(`CUTOVER_CASH_ACCOUNT_MAPPING_REQUIRED: ${accountName} has no normalized cash account id.`);
  return id;
}

function identityAlias(overrides: CutoverMappingOverrides, legacyActorId: string) {
  const id = overrides.identityAliases?.[legacyActorId];
  if (!id) throw new Error(`CUTOVER_IDENTITY_ALIAS_REQUIRED: ${legacyActorId} has no Auth user mapping.`);
  return id;
}

function reversalTargetId(
  overrides: CutoverMappingOverrides,
  type: string,
  id: string,
  status: string,
  ids: IdResolver
) {
  if (status !== "reversed") return null;
  const targetLegacyId = overrides.reversalTargets?.[`${type}:${id}`];
  if (!targetLegacyId) throw new Error(`CUTOVER_REVERSAL_TARGET_REQUIRED: ${type}:${id} needs a target.`);
  return ids.legacy(type, targetLegacyId);
}

function resolveSourceDocument(documentNo: string, overrides: CutoverMappingOverrides, ids: IdResolver): ResolvedSourceDocument {
  const mapping = overrides.sourceDocuments?.[documentNo] as CutoverSourceDocumentOverride | undefined;
  if (!mapping) throw new Error(`CUTOVER_SOURCE_DOCUMENT_MAPPING_REQUIRED: ${documentNo} has no typed source target.`);
  return {
    sourceType: mapping.entityType,
    sourceId: ids.legacy(cutoverSourceEntityLegacyMapEntityType(mapping.entityType), mapping.targetLegacyId)
  };
}

function idempotencyKey(type: string, id: string) {
  return `cutover:${type}:${id}`;
}

function createIdResolver(map: CutoverLegacyIdMap[], namespace: string): IdResolver {
  const values = new Map(map.map((entry) => [`${entry.entityType}:${entry.legacyId}`, entry.targetId]));
  return {
    legacy(entityType, legacyId) {
      const id = values.get(`${entityType}:${legacyId}`);
      if (!id) throw new Error(`CUTOVER_LEGACY_ID_MAPPING_REQUIRED: ${entityType} ${legacyId} has no deterministic target id.`);
      return id;
    },
    derived(entityType, legacyId) {
      return createDeterministicLegacyUuid(namespace, entityType, legacyId);
    }
  };
}

function batch(name: string, table: string, operation: "insert" | "update", rows: PaymentCashCutoverRow[]): PaymentCashCutoverBatch {
  return { name, table, operation, rows: rows.slice().sort((left, right) => left.id.localeCompare(right.id)) };
}

function row(id: string, legacyId: string, values: Record<string, unknown>): PaymentCashCutoverRow {
  return { id, legacyId, values };
}

function compareId<T extends { id: string }>(left: T, right: T) {
  return left.id.localeCompare(right.id);
}

function assertTimestamp(value: string, path: string) {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(`CUTOVER_TIMESTAMP_INVALID: ${path} must be an ISO timestamp.`);
  }
}

function checksum(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
