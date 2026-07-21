import { describe, expect, it } from "vitest";
import { createAuditIntegrityReport, createAuditLogCsv } from "../src/modules/operations/audit-integrity";
import {
  createDebtStatementCsv,
  getCustomerDebtSummaries,
  getOpenCustomerDebtObligations,
  getOpenSupplierDebtObligations,
  getSupplierDebtSummaries
} from "../src/modules/operations/debt-reconciliation";
import { assertOperationsInvariants } from "../src/modules/operations/invariants";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { createOwnerActor, createRoleActor, runOperation } from "../src/modules/operations/service";
import type { OperationName, OperationOptions, OperationsState } from "../src/modules/operations/types";

const now = "2026-07-18T09:00:00.000+07:00";

function run(state: OperationsState, operation: OperationName, key: string, targetId?: string, options?: OperationOptions) {
  return runOperation({
    state,
    operation,
    actor: createOwnerActor(),
    now,
    idempotencyKey: `debt-audit-${key}`,
    targetId,
    options
  }).state;
}

describe("debt reconciliation and audit workflow", () => {
  it("allocates a supplier payment incrementally to selected payable documents", () => {
    let state = createInitialOperationsState();
    state.supplierLedgerEntries = [
      { id: "sl-a", supplierId: "sup-hoang-thach", sourceDocument: "PO-A", direction: "credit", amount: 1000, postingDate: now },
      { id: "sl-b", supplierId: "sup-hoang-thach", sourceDocument: "PO-B", direction: "credit", amount: 2000, postingDate: now }
    ];
    state.supplierPayments = [
      { id: "sp-a", documentNo: "PC-A", supplierId: "sup-hoang-thach", amount: 2500, status: "draft", allocations: [] }
    ];
    state.cashTransactions = [
      { id: "cash-open", accountName: "Tiền mặt cửa hàng", sourceDocument: "OPEN", direction: "in", amount: 5000, postedAt: now }
    ];

    state = run(state, "confirmSupplierPayment", "supplier-confirm", "sp-a");
    state = run(state, "allocateSupplierPayment", "supplier-allocate-1", "sp-a", {
      allocations: [
        { ledgerEntryId: "sl-a", amount: 800 },
        { ledgerEntryId: "sl-b", amount: 1000 }
      ]
    });

    expect(state.supplierPayments[0]?.status).toBe("partially_allocated");
    expect(getOpenSupplierDebtObligations(state).map((item) => [item.ledgerEntryId, item.openAmount])).toEqual([
      ["sl-a", 200],
      ["sl-b", 1000]
    ]);

    state = run(state, "allocateSupplierPayment", "supplier-allocate-2", "sp-a", {
      allocations: [
        { ledgerEntryId: "sl-a", amount: 200 },
        { ledgerEntryId: "sl-b", amount: 500 }
      ]
    });

    expect(state.supplierPayments[0]?.status).toBe("allocated");
    expect(getSupplierDebtSummaries(state)[0]).toMatchObject({
      balance: 500,
      openObligationAmount: 500,
      unappliedPaymentAmount: 0,
      openObligationCount: 1
    });
    expect(() => assertOperationsInvariants(state)).not.toThrow();
  });

  it("rejects allocations to the wrong party or above the open obligation", () => {
    let state = createInitialOperationsState();
    state.customerLedgerEntries = [
      { id: "cl-a", customerId: "cus-minh-anh", sourceDocument: "SO-A", direction: "debit", amount: 1000, postingDate: now },
      { id: "cl-b", customerId: "cus-tuan-lai", sourceDocument: "SO-B", direction: "debit", amount: 1000, postingDate: now }
    ];
    state.customerPayments = [
      { id: "cp-a", documentNo: "PT-A", customerId: "cus-minh-anh", amount: 1000, status: "draft", allocations: [] }
    ];
    state = run(state, "confirmCustomerPayment", "customer-confirm", "cp-a");

    expect(() => run(state, "allocateCustomerPayment", "wrong-customer", "cp-a", {
      allocations: [{ ledgerEntryId: "cl-b", amount: 500 }]
    })).toThrow("đúng khách hàng");
    expect(() => run(state, "allocateCustomerPayment", "over-open", "cp-a", {
      allocations: [{ ledgerEntryId: "cl-a", amount: 1001 }]
    })).toThrow("vượt phần còn mở");
    expect(state.customerPayments[0]?.allocations).toEqual([]);
  });

  it("keeps reversed allocations as history but removes them from active reconciliation", () => {
    let state = createInitialOperationsState();
    state.customerLedgerEntries = [
      { id: "cl-a", customerId: "cus-minh-anh", sourceDocument: "SO-A", direction: "debit", amount: 1000, postingDate: now }
    ];
    state.customerPayments = [
      { id: "cp-a", documentNo: "PT-A", customerId: "cus-minh-anh", amount: 1000, status: "draft", allocations: [] }
    ];
    state = run(state, "confirmCustomerPayment", "reverse-confirm", "cp-a");
    state = run(state, "allocateCustomerPayment", "reverse-allocate", "cp-a", {
      allocations: [{ ledgerEntryId: "cl-a", amount: 1000 }]
    });
    state = run(state, "reverseCustomerPayment", "reverse-payment", "cp-a", { reason: "Khách chuyển nhầm tài khoản" });

    expect(state.customerPayments[0]?.allocations).toEqual([{ ledgerEntryId: "cl-a", amount: 1000 }]);
    expect(getOpenCustomerDebtObligations(state)[0]?.openAmount).toBe(1000);
    expect(getCustomerDebtSummaries(state)[0]).toMatchObject({ balance: 1000, openObligationAmount: 1000, unappliedPaymentAmount: 0 });
  });

  it("allows accountants to allocate both debt directions and rejects sales users", () => {
    const state = createInitialOperationsState();
    state.supplierLedgerEntries = [
      { id: "sl-auth", supplierId: "sup-hoang-thach", sourceDocument: "PO-AUTH", direction: "credit", amount: 1000, postingDate: now }
    ];
    state.supplierPayments = [
      { id: "sp-auth", documentNo: "PC-AUTH", supplierId: "sup-hoang-thach", amount: 1000, status: "confirmed", allocations: [] }
    ];

    const accountantResult = runOperation({
      state,
      operation: "allocateSupplierPayment",
      actor: createRoleActor("accountant"),
      now,
      idempotencyKey: "debt-audit-accountant-allocation",
      targetId: "sp-auth",
      options: { allocations: [{ ledgerEntryId: "sl-auth", amount: 1000 }] }
    });
    expect(accountantResult.state.supplierPayments[0]?.status).toBe("allocated");

    expect(() => runOperation({
      state,
      operation: "allocateSupplierPayment",
      actor: createRoleActor("sales"),
      now,
      idempotencyKey: "debt-audit-sales-allocation",
      targetId: "sp-auth",
      options: { allocations: [{ ledgerEntryId: "sl-auth", amount: 1000 }] }
    })).toThrow("không có quyền");
  });

  it("detects broken audit correlation and exports usable UTF-8 CSV evidence", () => {
    let state = createInitialOperationsState();
    state.customerLedgerEntries = [
      { id: "cl-a", customerId: "cus-minh-anh", sourceDocument: "SO-A", direction: "debit", amount: 1000, postingDate: now }
    ];
    state.customerPayments = [
      { id: "cp-a", documentNo: "PT-A", customerId: "cus-minh-anh", amount: 1000, status: "draft", allocations: [] }
    ];
    state = run(state, "confirmCustomerPayment", "audit-confirm", "cp-a");

    expect(createAuditIntegrityReport(state)).toMatchObject({ status: "healthy", auditCount: 2, correlatedCount: 1 });
    expect(createAuditLogCsv(state.auditLogs)).toContain("Mã liên kết");
    expect(createDebtStatementCsv(state, "customer").startsWith("\uFEFF")).toBe(true);

    state.auditLogs[0]!.correlationId = "missing-command";
    const broken = createAuditIntegrityReport(state);
    expect(broken.status).toBe("error");
    expect(broken.issues.map((item) => item.code)).toContain("processed_command_without_audit");
  });
});
