import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import {
  createMonthlyReport,
  getAvailableReportMonths,
  getDefaultReportMonth,
  serializeMonthlyReportDashboardHtml,
  serializeMonthlyReportCsv
} from "../src/modules/operations/monthly-report";
import { createMonthlyReportExportPackage } from "../src/modules/operations/report-package";
import { createOwnerActor, runOperation } from "../src/modules/operations/service";
import type { OperationName, OperationsState } from "../src/modules/operations/types";

const now = "2026-07-16T10:00:00.000+07:00";

function run(state: OperationsState, operation: OperationName, key: string = operation) {
  return runOperation({
    state,
    operation,
    actor: createOwnerActor(),
    now,
    idempotencyKey: `monthly-report-${key}`,
    options: operation === "completeDelivery"
      ? { recipientName: "Nguyễn Văn Nhận", evidence: "Biên bản giao nhận TEST-REPORT" }
      : undefined
  }).state;
}

function runPostedDemoFlow() {
  let state = createInitialOperationsState();
  for (const operation of [
    "confirmSalesOrder",
    "allocateSalesSources",
    "postGoodsReceipt",
    "confirmDirectDelivery",
    "startDeliveryLoading",
    "dispatchDelivery",
    "completeDelivery",
    "confirmCustomerPayment",
    "allocateCustomerPayment",
    "confirmSupplierPayment",
    "approveWorkOutput",
    "postCompensation",
    "payEmployee"
  ] satisfies OperationName[]) {
    state = run(state, operation);
  }
  return state;
}

describe("monthly operations report", () => {
  it("does not recognize revenue from draft or merely confirmed sales orders", () => {
    const state = createInitialOperationsState();
    const report = createMonthlyReport(state, "2026-07", "2026-07-16T12:00:00.000+07:00");

    expect(report.summary.salesOrderCount).toBe(0);
    expect(report.summary.salesNet).toBe(0);
    expect(report.summary.salesTax).toBe(0);
    expect(report.summary.salesGross).toBe(0);
  });

  it("removes direct-delivery revenue and cost from the month after a valid reversal", () => {
    let state = createInitialOperationsState();
    state = run(state, "confirmSalesOrder", "direct-report-confirm");
    state = run(state, "allocateSalesSources", "direct-report-allocate");
    state = run(state, "confirmDirectDelivery", "direct-report-post");
    state = runOperation({
      state,
      operation: "reverseDirectDelivery",
      actor: createOwnerActor(),
      now,
      idempotencyKey: "monthly-report-direct-reversal",
      targetId: "po-002-line-sand",
      options: { reason: "Đảo giao thẳng để kiểm tra báo cáo" }
    }).state;

    const report = createMonthlyReport(state, "2026-07", "2026-07-16T12:00:00.000+07:00");
    expect(report.summary.salesNet).toBe(0);
    expect(report.summary.costOfGoodsSold).toBe(0);
    expect(report.summary.grossProfit).toBe(0);
  });

  it("summarizes only documents and ledger entries in the selected month", () => {
    const state = runPostedDemoFlow();
    state.salesOrders.push({
      id: "so-june",
      documentNo: "SO-JUNE",
      customerId: "cus-minh-anh",
      orderDate: "2026-06-30",
      status: "delivered",
      version: 1,
      currency: "VND",
      lines: [
        {
          id: "so-june-line",
          productUnitId: "pu-brick-vien",
          quantity: 1,
          deliveredQuantity: 1,
          unitPrice: 999999,
          taxRate: 0
        }
      ]
    });
    state.cashTransactions.push({
      id: "cash-june",
      accountName: "Tiền mặt cửa hàng",
      sourceDocument: "PT-JUNE",
      direction: "in",
      amount: 999999,
      postedAt: "2026-06-30T12:00:00.000+07:00"
    });

    const report = createMonthlyReport(state, "2026-07", "2026-07-16T12:00:00.000+07:00");

    expect(report.monthLabel).toBe("07/2026");
    expect(report.summary.salesOrderCount).toBe(1);
    expect(report.summary.salesGross).toBe(16297200);
    expect(report.summary.costOfGoodsSold).toBe(12540000);
    expect(report.summary.grossProfit).toBe(2550000);
    expect(report.summary.grossMarginRate).toBeCloseTo(2550000 / 15090000);
    expect(report.summary.cashIn).toBe(10000000);
    expect(report.summary.cashOut).toBe(8150000);
    expect(report.dashboard.map((metric) => metric.label)).toContain("Dòng tiền ròng");
    expect(report.sections.find((section) => section.title === "Đơn bán lập trong tháng")?.rows).toHaveLength(1);
    expect(report.sections.find((section) => section.title === "Nhật ký kiểm toán")?.rows.length).toBeGreaterThan(0);
  });

  it("exports an Excel-friendly UTF-8 CSV with Vietnamese section names", () => {
    const report = createMonthlyReport(runPostedDemoFlow(), "2026-07", "2026-07-16T12:00:00.000+07:00");
    const csv = serializeMonthlyReportCsv(report);

    expect(csv.startsWith("\uFEFFsep=,")).toBe(true);
    expect(csv).toContain("BÁO CÁO THÁNG 07/2026");
    expect(csv).toContain("Dashboard tháng");
    expect(csv).toContain("Lãi gộp");
    expect(csv).toContain("Sổ công nợ khách hàng");
    expect(csv).toContain("Phát sinh kho");
  });

  it("exports an attached self-contained dashboard HTML report", () => {
    const report = createMonthlyReport(runPostedDemoFlow(), "2026-07", "2026-07-16T12:00:00.000+07:00");
    const html = serializeMonthlyReportDashboardHtml(report);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Báo cáo tháng 07/2026");
    expect(html).toContain("Doanh thu sau VAT");
    expect(html).toContain("Sổ công nợ khách hàng");
  });

  it("exports one ZIP package containing the CSV report, dashboard attachment, and manifest", () => {
    const report = createMonthlyReport(runPostedDemoFlow(), "2026-07", "2026-07-16T12:00:00.000+07:00");
    const reportPackage = createMonthlyReportExportPackage(report);
    const zipText = new TextDecoder().decode(reportPackage.bytes);

    expect(reportPackage.fileName).toBe("bao-cao-thang-2026-07.zip");
    expect(reportPackage.mediaType).toBe("application/zip");
    expect(Array.from(reportPackage.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(reportPackage.files.map((file) => file.fileName)).toEqual([
      "bao-cao-thang-2026-07.csv",
      "dashboard-thang-2026-07.html",
      "manifest.json"
    ]);
    expect(zipText).toContain("bao-cao-thang-2026-07.csv");
    expect(zipText).toContain("dashboard-thang-2026-07.html");
    expect(zipText).toContain("vlxd.monthly_report_package");
  });

  it("derives available report months from operating data", () => {
    const state = createInitialOperationsState();
    state.cashTransactions.push({
      id: "cash-june",
      accountName: "Tiền mặt cửa hàng",
      sourceDocument: "PT-JUNE",
      direction: "in",
      amount: 1000,
      postedAt: "2026-06-01T09:00:00.000+07:00"
    });

    expect(getAvailableReportMonths(state)).toEqual(["2026-07", "2026-06"]);
    expect(getDefaultReportMonth(state)).toBe("2026-07");
  });
});
