import { describe, expect, it } from "vitest";
import { createAuditIntegrityReport } from "@/modules/operations/audit-integrity";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import { reconcileOperationsState, reconciliationDiff } from "@/modules/operations/reconciliation";
import { createOwnerActor, runOperation } from "@/modules/operations/commands";
import type { OperationsState } from "@/modules/operations/types";

const now = "2026-08-20T08:00:00.000Z";

function run(state: OperationsState, operation: Parameters<typeof runOperation>[0]["operation"], key: string, targetId?: string, options?: Parameters<typeof runOperation>[0]["options"]) {
  return runOperation({ state, operation, actor: createOwnerActor(), now, idempotencyKey: `reconcile-${key}`, targetId, options }).state;
}

describe("R-019 financial and inventory reconciliation", () => {
  it("derives AR, AP, cash, inventory, employee payable, and payment allocation values", () => {
    const state = createInitialOperationsState();
    state.customerLedgerEntries = [{ id: "cl-ar", customerId: "cus-minh-anh", sourceDocument: "SO-AR", direction: "debit", amount: 1_000, postingDate: now }];
    state.supplierLedgerEntries = [{ id: "sl-ap", supplierId: "sup-hoang-thach", sourceDocument: "PO-AP", direction: "credit", amount: 2_000, postingDate: now }];
    state.employeeLedgerEntries = [{ id: "el-payable", employeeId: "emp-worker-nam", sourceDocument: "WO-PAY", direction: "credit", amount: 300, postingDate: now }];
    state.cashTransactions = [{ id: "cash-opening", accountName: "Tien mat", sourceDocument: "OPEN", direction: "in", amount: 5_000, postedAt: now }];
    state.customerPayments = [{ id: "cp-reconcile", documentNo: "PT-R", customerId: "cus-minh-anh", amount: 600, status: "confirmed", allocations: [{ ledgerEntryId: "cl-ar", amount: 250 }] }];
    state.supplierPayments = [{ id: "sp-reconcile", documentNo: "PC-R", supplierId: "sup-hoang-thach", amount: 700, status: "partially_allocated", allocations: [{ ledgerEntryId: "sl-ap", amount: 400 }] }];

    const report = reconcileOperationsState(state);
    expect(report.customerAr["cus-minh-anh"]).toBe(1_000);
    expect(report.supplierAp["sup-hoang-thach"]).toBe(2_000);
    expect(report.employeePayables["emp-worker-nam"]).toBe(300);
    expect(report.cashBalance).toBe(5_000);
    expect(report.inventoryQuantities["wh-main::pu-brick-vien"]).toBe(10_000);
    expect(report.customerPayments["cp-reconcile"]).toMatchObject({ amount: 600, allocatedAmount: 250, unallocatedAmount: 350 });
    expect(report.supplierPayments["sp-reconcile"]).toMatchObject({ amount: 700, allocatedAmount: 400, unallocatedAmount: 300 });
    expect(report.paymentTotals).toEqual({ customerAllocated: 250, customerUnallocated: 350, supplierAllocated: 400, supplierUnallocated: 300 });
  });

  it("proves portal policy and unit configuration changes do not alter ledgers, cash, or movement-derived stock", () => {
    const state = createInitialOperationsState();
    const before = reconcileOperationsState(state);
    const afterState = run(state, "updateProductCommercialPolicy", "portal-policy", "pu-cement-bag", {
      visibleOnCustomerPortal: false,
      orderableOnline: false,
      reason: "Tam thoi an san pham tren portal"
    });
    const after = reconcileOperationsState(afterState);

    expect(reconciliationDiff(before, after)).toEqual([]);
    expect(afterState.productUnits.find((product) => product.id === "pu-cement-bag")).toMatchObject({ visibleOnCustomerPortal: false, orderableOnline: false });
    expect(createAuditIntegrityReport(afterState).status).toBe("healthy");
  });

  it("keeps payment confirmation separate from allocation and reversal restores the ledger/cash pair", () => {
    const state = createInitialOperationsState();
    state.customerLedgerEntries = [{ id: "cl-payment", customerId: "cus-minh-anh", sourceDocument: "SO-PAY", direction: "debit", amount: 1_000, postingDate: now }];
    state.customerPayments = [{ id: "cp-payment", documentNo: "PT-PAY", customerId: "cus-minh-anh", amount: 600, status: "draft", allocations: [] }];

    const before = reconcileOperationsState(state);
    const confirmed = run(state, "confirmCustomerPayment", "confirm", "cp-payment");
    const confirmedReport = reconcileOperationsState(confirmed);
    expect(confirmed.customerPayments[0]?.status).toBe("confirmed");
    expect(confirmedReport.cashBalance - before.cashBalance).toBe(600);
    expect(confirmedReport.customerPayments["cp-payment"]).toMatchObject({ allocatedAmount: 0, unallocatedAmount: 600 });

    const allocated = run(confirmed, "allocateCustomerPayment", "allocate", "cp-payment", { allocations: [{ ledgerEntryId: "cl-payment", amount: 200 }] });
    const allocatedReport = reconcileOperationsState(allocated);
    expect(allocated.customerPayments[0]?.status).toBe("partially_allocated");
    expect(allocatedReport.customerPayments["cp-payment"]).toMatchObject({ allocatedAmount: 200, unallocatedAmount: 400 });
    expect(allocatedReport.cashBalance).toBe(confirmedReport.cashBalance);

    const reversed = run(allocated, "reverseCustomerPayment", "reverse", "cp-payment", { reason: "Chuyen nham tai khoan" });
    const reversedReport = reconcileOperationsState(reversed);
    expect(reversed.customerPayments[0]?.allocations).toEqual([{ ledgerEntryId: "cl-payment", amount: 200 }]);
    expect(reversedReport.cashBalance).toBe(before.cashBalance);
    expect(reversedReport.customerAr["cus-minh-anh"]).toBe(1_000);
    expect(reversedReport.customerPayments["cp-payment"]).toMatchObject({ status: "reversed", allocatedAmount: 200, unallocatedAmount: 400 });
    expect(createAuditIntegrityReport(reversed).status).toBe("healthy");
  });
});
