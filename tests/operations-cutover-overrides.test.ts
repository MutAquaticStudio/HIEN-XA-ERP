import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import type { OperationsAttachment } from "../src/modules/operations/types";
import {
  assertOperationsCutoverMappings,
  inspectOperationsCutoverMappings,
  type CutoverMappingOverrides
} from "../src/server/infrastructure/operations-cutover-overrides";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CASH_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";

function createCompleteOverrides(): CutoverMappingOverrides {
  const state = createInitialOperationsState();
  const sourceDocuments = new Set([
    ...state.customerLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.supplierLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.employeeLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.inventoryMovements.map((entry) => entry.sourceDocument),
    ...state.cashTransactions.map((entry) => entry.sourceDocument),
    ...state.workOrders.map((entry) => entry.sourceDocument)
  ]);
  const identityAliases = {
    ...Object.fromEntries(state.auditLogs.map((entry) => [entry.actorId, USER_ID])),
    "owner-1": USER_ID
  };
  const cashAccounts = Object.fromEntries([...new Set([
    ...state.cashTransactions.map((entry) => entry.accountName),
    ...state.cashVouchers.map((entry) => entry.accountName)
  ])].map((accountName) => [accountName, CASH_ACCOUNT_ID]));
  const sourceDocumentOverrides = Object.fromEntries([...sourceDocuments].map((sourceDocument) => [sourceDocument, {
    entityType: "sales_order" as const,
    targetLegacyId: state.salesOrders[0].id
  }]));
  const paymentMetadata = Object.fromEntries([
    ...state.customerPayments.map((payment) => [`customer_payment:${payment.id}`, paymentOverride()]),
    ...state.supplierPayments.map((payment) => [`supplier_payment:${payment.id}`, paymentOverride()]),
    ...state.employeePayments.map((payment) => [`employee_payment:${payment.id}`, paymentOverride()]),
    ...state.employeeAdvances.map((advance) => [`employee_advance:${advance.id}`, paymentOverride()])
  ]);

  return {
    identityAliases,
    sourceDocuments: sourceDocumentOverrides,
    cashAccounts,
    paymentMetadata,
    cashVoucherMetadata: Object.fromEntries(state.cashVouchers.map((voucher) => [`cash_voucher:${voucher.id}`, {
      occurredAt: "2026-07-28T00:00:00.000Z",
      actorLegacyId: "owner-1"
    }]))
  };
}

function paymentOverride() {
  return {
    targetCashAccountId: CASH_ACCOUNT_ID,
    method: "bank_transfer" as const,
    postedAt: "2026-07-28T00:00:00.000Z",
    actorLegacyId: "owner-1"
  };
}

function supportAttachment(id: string, uploadedBy: string): OperationsAttachment {
  return {
    id,
    fileName: `${id}.pdf`,
    contentType: "application/pdf",
    size: 128,
    sha256: "a".repeat(64),
    uploadedBy,
    uploadedAt: "2026-07-28T00:00:00.000Z"
  };
}

describe("operations cutover mapping overrides", () => {
  it("is ready only when historical mappings are explicit and valid", () => {
    const state = createInitialOperationsState();
    const result = inspectOperationsCutoverMappings(state, createCompleteOverrides());

    expect(result).toEqual({ ready: true, issues: [] });
    expect(assertOperationsCutoverMappings(state, createCompleteOverrides()).ready).toBe(true);
  });

  it("fails closed when audit actor, source document, cash account, and posted payment metadata are absent", () => {
    const state = createInitialOperationsState();
    state.customerPayments[0].status = "confirmed";
    state.cashTransactions.push({
      id: "cutover-test-cash-transaction",
      accountName: "Test bank account",
      sourceDocument: state.salesOrders[0].documentNo,
      direction: "in",
      amount: 1,
      postedAt: "2026-07-28T00:00:00.000Z"
    });

    const result = inspectOperationsCutoverMappings(state);
    const codes = result.issues.map((issue) => issue.code);

    expect(result.ready).toBe(false);
    expect(codes).toContain("CUTOVER_IDENTITY_ALIAS_REQUIRED");
    expect(codes).toContain("CUTOVER_SOURCE_DOCUMENT_MAPPING_REQUIRED");
    expect(codes).toContain("CUTOVER_CASH_ACCOUNT_MAPPING_REQUIRED");
    expect(codes).toContain("CUTOVER_PAYMENT_METADATA_REQUIRED");
    expect(() => assertOperationsCutoverMappings(state)).toThrow("CUTOVER_MAPPING_BLOCKED");
  });

  it("rejects invalid override identifiers instead of accepting guessed relationships", () => {
    const state = createInitialOperationsState();
    state.cashTransactions.push({
      id: "cutover-test-cash-transaction",
      accountName: "Test bank account",
      sourceDocument: state.salesOrders[0].documentNo,
      direction: "in",
      amount: 1,
      postedAt: "2026-07-28T00:00:00.000Z"
    });
    const overrides = createCompleteOverrides();
    const firstActor = state.auditLogs[0].actorId;
    const firstSourceDocument = state.workOrders[0].sourceDocument;
    overrides.identityAliases![firstActor] = "not-a-uuid";
    overrides.cashAccounts![state.cashTransactions[0].accountName] = "not-a-uuid";
    overrides.sourceDocuments![firstSourceDocument] = {
      entityType: "sales_order",
      targetLegacyId: "missing-order"
    };

    const codes = inspectOperationsCutoverMappings(state, overrides).issues.map((issue) => issue.code);
    expect(codes).toContain("CUTOVER_IDENTITY_ALIAS_INVALID");
    expect(codes).toContain("CUTOVER_CASH_ACCOUNT_MAPPING_INVALID");
    expect(codes).toContain("CUTOVER_SOURCE_DOCUMENT_TARGET_UNKNOWN");
  });

  it("requires operator-provided base units, delivery allocations, stable location ids, and valid vehicle capacity", () => {
    const state = createInitialOperationsState();
    const overrides = createCompleteOverrides();
    const duplicateUnit = structuredClone(state.productUnits[0]);
    duplicateUnit.id = "second-unit-for-product";
    state.productUnits.push(duplicateUnit);
    const secondJob = structuredClone(state.deliveryJobs[0]);
    secondJob.id = "second-job-for-order";
    state.deliveryJobs.push(secondJob);
    state.workOrders[0].locationHistory = [{
      employeeId: "emp-worker-nam",
      recordedAt: "2026-07-28T00:00:00.000Z",
      latitude: 20.9,
      longitude: 106.7,
      source: "gps"
    }];
    state.vehicles[0].capacityTons = 0;

    const initialCodes = inspectOperationsCutoverMappings(state, overrides).issues.map((issue) => issue.code);
    expect(initialCodes).toContain("CUTOVER_PRODUCT_BASE_UNIT_REQUIRED");
    expect(initialCodes).toContain("CUTOVER_DELIVERY_ALLOCATION_REQUIRED");
    expect(initialCodes).toContain("CUTOVER_LOCATION_POINT_ID_REQUIRED");
    expect(initialCodes).toContain("CUTOVER_VEHICLE_CAPACITY_INVALID");

    overrides.productBaseUnits = { [state.productUnits[0].productCode]: state.productUnits[0].id };
    overrides.locationPointIds = { [`${state.workOrders[0].id}:0`]: "tracking-event-0001" };
    overrides.deliveryLineAllocations = {
      [state.deliveryJobs[0].id]: Object.fromEntries(state.salesOrders[0].lines.map((line) => [line.id, line.deliveredQuantity])),
      [secondJob.id]: Object.fromEntries(state.salesOrders[0].lines.map((line) => [line.id, 0]))
    };
    state.vehicles[0].capacityTons = 2;

    expect(inspectOperationsCutoverMappings(state, overrides).issues).toEqual([]);
  });

  it("requires verified object storage provenance for every attachment", () => {
    const state = createInitialOperationsState();
    state.salesOrders[0].attachments = [supportAttachment("attachment-001", "owner-1")];
    const overrides = createCompleteOverrides();

    expect(inspectOperationsCutoverMappings(state, overrides).issues.map((issue) => issue.code)).toContain("CUTOVER_ATTACHMENT_MAPPING_REQUIRED");

    overrides.attachments = {
      "attachment-001": {
        bucket: "private-evidence",
        objectPath: "sales/attachment-001.jpg",
        sha256: "a".repeat(64)
      }
    };
    expect(inspectOperationsCutoverMappings(state, overrides).issues).toEqual([]);
  });

  it("reports a missing legacy attachment uploader as a mapping issue instead of throwing", () => {
    const state = createInitialOperationsState();
    state.salesOrders[0].attachments = [{ id: "attachment-without-uploader" }] as never;
    const overrides = createCompleteOverrides();
    overrides.attachments = {
      "attachment-without-uploader": {
        bucket: "private-evidence",
        objectPath: "sales/attachment-without-uploader.pdf",
        sha256: "a".repeat(64)
      }
    };

    expect(inspectOperationsCutoverMappings(state, overrides).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CUTOVER_IDENTITY_ALIAS_REQUIRED",
          path: "salesOrders[0].attachments[0].uploadedBy"
        })
      ])
    );
  });

  it("fails closed for support-record attachments and actors until every mapping is explicit", () => {
    const state = createInitialOperationsState();
    const order = state.purchaseOrders[0]!;
    const salesOrder = state.salesOrders[0]!;
    const approvalIndex = state.approvalRequests.length;
    const customerProofIndex = (state.customerPaymentProofRequests ?? []).length;
    const bankProofIndex = state.bankTransferProofs.length;
    const approvalAttachment = supportAttachment("approval-attachment", "approval-uploader");
    const customerProofAttachment = supportAttachment("customer-proof-attachment", "customer-proof-uploader");
    const supplierNoticeAttachment = supportAttachment("supplier-notice-attachment", "supplier-notice-uploader");
    const bankProofAttachment = supportAttachment("bank-proof-attachment", "bank-proof-uploader");

    state.approvalRequests.push({
      id: "support-approval",
      documentNo: "YC-DUYET-CUTOVER",
      type: "goods_receipt",
      targetId: order.lines[0]!.id,
      status: "approved",
      quantity: 1,
      attachments: [approvalAttachment],
      submittedBy: "approval-submitter",
      submittedByName: "Nguoi gui",
      submittedAt: "2026-07-28T00:00:00.000Z",
      approvedBy: "approval-reviewer",
      approvedByName: "Nguoi duyet",
      approvedAt: "2026-07-28T01:00:00.000Z"
    });
    state.customerPaymentProofRequests = [{
      id: "support-customer-proof",
      salesOrderId: salesOrder.id,
      customerId: salesOrder.customerId,
      amount: 100,
      attachments: [customerProofAttachment],
      status: "submitted",
      submittedBy: "customer-proof-submitter",
      submittedAt: "2026-07-28T00:00:00.000Z"
    }];
    order.supplierAcknowledgements = [{
      id: "support-supplier-acknowledgement",
      status: "available",
      submittedBy: "supplier-acknowledgement-submitter",
      submittedAt: "2026-07-28T00:00:00.000Z",
      version: 1
    }];
    order.supplierDeliveryNotices = [{
      id: "support-supplier-notice",
      lineQuantities: { [order.lines[0]!.id]: 1 },
      attachments: [supplierNoticeAttachment],
      submittedBy: "supplier-notice-submitter",
      submittedAt: "2026-07-28T00:00:00.000Z",
      version: 1
    }];
    state.bankTransferProofs.push({
      id: "support-bank-proof",
      documentNo: "CK-CUTOVER",
      direction: "in",
      amount: 100,
      counterpartyName: "Khach hang",
      transactionReference: "REF-CUTOVER",
      transferredAt: "2026-07-28T00:00:00.000Z",
      attachments: [bankProofAttachment],
      archivedBy: "bank-proof-archiver",
      archivedAt: "2026-07-28T00:00:00.000Z"
    });

    const overrides = createCompleteOverrides();
    const initialIssues = inspectOperationsCutoverMappings(state, overrides).issues;
    expect(initialIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CUTOVER_ATTACHMENT_MAPPING_REQUIRED", path: "attachments.approval-attachment" }),
      expect.objectContaining({ code: "CUTOVER_ATTACHMENT_MAPPING_REQUIRED", path: "attachments.customer-proof-attachment" }),
      expect.objectContaining({ code: "CUTOVER_ATTACHMENT_MAPPING_REQUIRED", path: "attachments.supplier-notice-attachment" }),
      expect.objectContaining({ code: "CUTOVER_ATTACHMENT_MAPPING_REQUIRED", path: "attachments.bank-proof-attachment" }),
      expect.objectContaining({ code: "CUTOVER_IDENTITY_ALIAS_REQUIRED", path: `approvalRequests[${approvalIndex}].submittedBy` }),
      expect.objectContaining({ code: "CUTOVER_IDENTITY_ALIAS_REQUIRED", path: `approvalRequests[${approvalIndex}].approvedBy` }),
      expect.objectContaining({ code: "CUTOVER_IDENTITY_ALIAS_REQUIRED", path: `customerPaymentProofRequests[${customerProofIndex}].submittedBy` }),
      expect.objectContaining({ code: "CUTOVER_IDENTITY_ALIAS_REQUIRED", path: "purchaseOrders[0].supplierAcknowledgements[0].submittedBy" }),
      expect.objectContaining({ code: "CUTOVER_IDENTITY_ALIAS_REQUIRED", path: "purchaseOrders[0].supplierDeliveryNotices[0].submittedBy" }),
      expect.objectContaining({ code: "CUTOVER_IDENTITY_ALIAS_REQUIRED", path: `bankTransferProofs[${bankProofIndex}].archivedBy` }),
      expect.objectContaining({ code: "CUTOVER_IDENTITY_ALIAS_REQUIRED", path: `approvalRequests[${approvalIndex}].attachments[0].uploadedBy` }),
      expect.objectContaining({ code: "CUTOVER_IDENTITY_ALIAS_REQUIRED", path: `customerPaymentProofRequests[${customerProofIndex}].attachments[0].uploadedBy` }),
      expect.objectContaining({ code: "CUTOVER_IDENTITY_ALIAS_REQUIRED", path: "purchaseOrders[0].supplierDeliveryNotices[0].attachments[0].uploadedBy" }),
      expect.objectContaining({ code: "CUTOVER_IDENTITY_ALIAS_REQUIRED", path: `bankTransferProofs[${bankProofIndex}].attachments[0].uploadedBy` })
    ]));

    overrides.identityAliases = {
      ...overrides.identityAliases,
      "approval-submitter": USER_ID,
      "approval-reviewer": USER_ID,
      "approval-uploader": USER_ID,
      "customer-proof-submitter": USER_ID,
      "customer-proof-uploader": USER_ID,
      "supplier-acknowledgement-submitter": USER_ID,
      "supplier-notice-submitter": USER_ID,
      "supplier-notice-uploader": USER_ID,
      "bank-proof-archiver": USER_ID,
      "bank-proof-uploader": USER_ID
    };
    overrides.attachments = Object.fromEntries([
      approvalAttachment,
      customerProofAttachment,
      supplierNoticeAttachment,
      bankProofAttachment
    ].map((attachment) => [attachment.id, {
      bucket: "erp-attachments",
      objectPath: `legacy/${attachment.id}.pdf`,
      sha256: attachment.sha256
    }]));

    expect(inspectOperationsCutoverMappings(state, overrides).issues).toEqual([]);
  });

  it("requires metadata for a draft payment and an explicit target for a reversed document", () => {
    const state = createInitialOperationsState();
    state.customerPayments.push({
      id: "cutover-draft-payment",
      documentNo: "PT-CUTOVER-DRAFT",
      customerId: state.customers[0].id,
      amount: 100,
      status: "draft",
      allocations: []
    });
    state.supplierPayments.push({
      id: "cutover-reversed-payment",
      documentNo: "PC-CUTOVER-REVERSED",
      supplierId: state.suppliers[0].id,
      amount: 100,
      status: "reversed",
      allocations: []
    });
    const overrides = createCompleteOverrides();

    const codes = inspectOperationsCutoverMappings(state, overrides).issues.map((issue) => issue.code);
    expect(codes).toContain("CUTOVER_PAYMENT_METADATA_REQUIRED");
    expect(codes).toContain("CUTOVER_REVERSAL_TARGET_REQUIRED");
  });
});
