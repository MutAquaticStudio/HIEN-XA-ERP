import { describe, expect, it } from "vitest";
import { createDashboardReadModel, normalizeRange } from "@/server/erp-v2/dashboard-read-model";
import { createInitialOperationsState } from "@/modules/operations/sample-data";

describe("ERP V2 dashboard read model", () => {
  it("normalizes reversed and invalid date filters without fabricating values", () => {
    expect(normalizeRange("2026-08-20", "2026-08-01")).toEqual({ from: "2026-08-01", to: "2026-08-20" });
    expect(normalizeRange("bad", "bad").from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reconciles chart revenue and cash totals with the source rows", () => {
    const state = createInitialOperationsState();
    state.customerLedgerEntries.push({ id: "ledger-sale-1", customerId: "customer-1", sourceDocument: "SO-1", direction: "debit", amount: 120000, netAmount: 110000, taxAmount: 10000, entryType: "sale_delivery", postingDate: "2026-08-20" });
    state.cashTransactions.push({ id: "cash-in-1", accountName: "Quỹ", sourceDocument: "PT-1", direction: "in", amount: 80000, postedAt: "2026-08-20" });
    state.cashTransactions.push({ id: "cash-out-1", accountName: "Quỹ", sourceDocument: "PC-1", direction: "out", amount: 20000, postedAt: "2026-08-20" });
    const model = createDashboardReadModel(state, "2026-08-20", "2026-08-20");
    expect(model.revenue.reduce((sum, point) => sum + point.revenue, 0)).toBe(120000);
    expect(model.cash).toEqual({ in: 80000, out: 20000, net: 60000 });
    expect(model.kpis.find((metric) => metric.id === "revenue")?.value).toBe(120000);
  });

  it("returns explicit zero/empty chart rows for a supported empty period", () => {
    const model = createDashboardReadModel(createInitialOperationsState(), "2026-08-20", "2026-08-22");
    expect(model.revenue).toHaveLength(3);
    expect(model.revenue.every((point) => point.revenue === 0 && point.cashIn === 0 && point.cashOut === 0)).toBe(true);
    expect(model.topProducts).toEqual([]);
  });
});
