import { partyName, productLabel, salesOrderTotals } from "./selectors";
import type { OperationsState } from "./types";

export type MonthlyReportSummary = {
  salesOrderCount: number;
  salesNet: number;
  salesTax: number;
  salesGross: number;
  costOfGoodsSold: number;
  grossProfit: number;
  grossMarginRate: number;
  customerDebit: number;
  customerCredit: number;
  supplierCredit: number;
  supplierDebit: number;
  cashIn: number;
  cashOut: number;
  inventoryReceiptQuantity: number;
  inventoryIssueQuantity: number;
  inventoryTransferQuantity: number;
  inventoryAdjustmentQuantity: number;
  employeeCompensation: number;
  employeePaid: number;
  employeeAdvanceNet: number;
  openImportIssues: number;
  auditEventCount: number;
};

export type MonthlyReportSection = {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
};

export type MonthlyReportDashboardMetric = {
  label: string;
  value: string | number;
  note: string;
};

export type MonthlyReport = {
  month: string;
  monthLabel: string;
  generatedAt: string;
  summary: MonthlyReportSummary;
  dashboard: MonthlyReportDashboardMetric[];
  sections: MonthlyReportSection[];
};

const csvSeparator = ",";

export function createMonthlyReport(
  state: OperationsState,
  month: string,
  generatedAt = new Date().toISOString()
): MonthlyReport {
  assertMonth(month);

  const salesOrders = state.salesOrders.filter((order) => isSameMonth(order.orderDate, month));
  const customerLedgerEntries = state.customerLedgerEntries.filter((entry) => isSameMonth(entry.postingDate, month));
  const supplierLedgerEntries = state.supplierLedgerEntries.filter((entry) => isSameMonth(entry.postingDate, month));
  const cashTransactions = state.cashTransactions.filter((transaction) => isSameMonth(transaction.postedAt, month));
  const inventoryMovements = state.inventoryMovements.filter((movement) => isSameMonth(movement.postedAt, month));
  const employeeLedgerEntries = state.employeeLedgerEntries.filter((entry) => isSameMonth(entry.postingDate, month));
  const auditLogs = state.auditLogs.filter((entry) => isSameMonth(entry.occurredAt, month));

  const revenueEntries = customerLedgerEntries.filter(
    (entry) => entry.netAmount !== undefined && entry.taxAmount !== undefined
  );
  const recognizedOrders = revenueEntries.filter((entry) => entry.direction === "debit");
  const salesSummary = {
    salesOrderCount: new Set(recognizedOrders.map((entry) => entry.sourceDocument.split(":")[0])).size,
    salesNet: sumBy(revenueEntries, (entry) => (entry.direction === "debit" ? 1 : -1) * (entry.netAmount ?? 0)),
    salesTax: sumBy(revenueEntries, (entry) => (entry.direction === "debit" ? 1 : -1) * (entry.taxAmount ?? 0)),
    salesGross: sumBy(revenueEntries, (entry) => (entry.direction === "debit" ? 1 : -1) * entry.amount)
  };
  const warehouseCost = sumBy(inventoryMovements, (movement) => {
    if (movement.movementType === "issue") {
      return Math.abs(movement.quantity) * movement.unitCost;
    }
    if (movement.movementType === "reverse" && movement.postingKey.startsWith("reverse-")) {
      const original = state.inventoryMovements.find((item) => item.id === movement.postingKey.slice("reverse-".length));
      return original?.movementType === "issue" ? -Math.abs(movement.quantity) * movement.unitCost : 0;
    }
    return 0;
  });
  const directDeliveryCost = sumBy(supplierLedgerEntries, (entry) => {
    if (entry.entryType === "direct_delivery" && entry.direction === "credit") {
      return entry.netAmount ?? 0;
    }
    if (entry.entryType === "reversal" && entry.postingGroupId?.startsWith("direct-") && entry.direction === "debit") {
      return -(entry.netAmount ?? 0);
    }
    return 0;
  });
  const costOfGoodsSold = warehouseCost + directDeliveryCost;
  const grossProfit = salesSummary.salesNet - costOfGoodsSold;

  const summary: MonthlyReportSummary = {
    ...salesSummary,
    costOfGoodsSold,
    grossProfit,
    grossMarginRate: salesSummary.salesNet > 0 ? grossProfit / salesSummary.salesNet : 0,
    customerDebit: sumBy(customerLedgerEntries.filter((entry) => entry.direction === "debit"), (entry) => entry.amount),
    customerCredit: sumBy(customerLedgerEntries.filter((entry) => entry.direction === "credit"), (entry) => entry.amount),
    supplierCredit: sumBy(supplierLedgerEntries.filter((entry) => entry.direction === "credit"), (entry) => entry.amount),
    supplierDebit: sumBy(supplierLedgerEntries.filter((entry) => entry.direction === "debit"), (entry) => entry.amount),
    cashIn: sumBy(cashTransactions.filter((transaction) => transaction.direction === "in"), (transaction) => transaction.amount),
    cashOut: sumBy(cashTransactions.filter((transaction) => transaction.direction === "out"), (transaction) => transaction.amount),
    inventoryReceiptQuantity: sumBy(
      inventoryMovements.filter((movement) => movement.movementType === "receipt"),
      (movement) => movement.quantity
    ),
    inventoryIssueQuantity: Math.abs(
      sumBy(
        inventoryMovements.filter((movement) => movement.movementType === "issue"),
        (movement) => movement.quantity
      )
    ),
    inventoryTransferQuantity: Math.abs(sumBy(
      inventoryMovements.filter((movement) => movement.movementType === "transfer_out"),
      (movement) => movement.quantity
    )),
    inventoryAdjustmentQuantity: sumBy(
      inventoryMovements.filter((movement) => movement.movementType === "adjustment"),
      (movement) => movement.quantity
    ),
    employeeCompensation: sumBy(
      employeeLedgerEntries.filter((entry) => entry.direction === "credit" && (entry.entryType === "compensation" || entry.entryType === undefined)),
      (entry) => entry.amount
    ),
    employeePaid: sumBy(
      employeeLedgerEntries.filter((entry) => entry.direction === "debit" && (entry.entryType === "payment" || entry.entryType === undefined)),
      (entry) => entry.amount
    ),
    employeeAdvanceNet:
      sumBy(employeeLedgerEntries.filter((entry) => entry.direction === "debit" && entry.entryType === "advance"), (entry) => entry.amount) -
      sumBy(employeeLedgerEntries.filter((entry) => entry.direction === "credit" && entry.entryType === "reversal" && entry.sourceDocument.startsWith("REV-TU-NV")), (entry) => entry.amount),
    openImportIssues: state.importIssues.filter((issue) => issue.status === "open").length,
    auditEventCount: auditLogs.length
  };

  const dashboard = createDashboardMetrics(summary);

  return {
    month,
    monthLabel: formatMonthLabel(month),
    generatedAt,
    summary,
    dashboard,
    sections: [
      createDashboardSection(dashboard),
      createSummarySection(summary),
      createSalesSection(state, salesOrders),
      createCustomerLedgerSection(state, customerLedgerEntries),
      createSupplierLedgerSection(state, supplierLedgerEntries),
      createCashSection(cashTransactions),
      createInventorySection(state, inventoryMovements),
      createEmployeeLedgerSection(state, employeeLedgerEntries),
      createImportIssueSection(state),
      createAuditSection(auditLogs)
    ]
  };
}

export function serializeMonthlyReportCsv(report: MonthlyReport) {
  const rows: Array<Array<string | number>> = [
    [`BÁO CÁO THÁNG ${report.monthLabel}`],
    ["Thời điểm xuất", report.generatedAt],
    []
  ];

  for (const section of report.sections) {
    rows.push([section.title], section.headers, ...section.rows, []);
  }

  return `\uFEFFsep=${csvSeparator}\r\n${rows.map((row) => row.map(csvCell).join(csvSeparator)).join("\r\n")}`;
}

export function serializeMonthlyReportDashboardHtml(report: MonthlyReport) {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Báo cáo tháng ${escapeHtml(report.monthLabel)}</title>
  <style>
    body { margin: 0; background: #f3f5f4; color: #17211d; font-family: Arial, sans-serif; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1, h2 { margin: 0; }
    h1 { font-size: 28px; }
    h2 { margin-top: 28px; font-size: 20px; }
    .subtitle { color: #5d6963; margin: 8px 0 0; }
    .dashboard { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 22px; }
    .card { background: #fff; border: 1px solid #d9e0dc; border-radius: 8px; padding: 16px; }
    .label { color: #5d6963; font-size: 13px; font-weight: 700; }
    .value { margin-top: 8px; font-size: 24px; font-weight: 900; }
    .note { margin-top: 8px; color: #5d6963; font-size: 13px; line-height: 1.4; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; background: #fff; border: 1px solid #d9e0dc; }
    th, td { border-bottom: 1px solid #d9e0dc; padding: 9px 10px; text-align: left; vertical-align: top; font-size: 13px; }
    th { background: #eaf2ef; color: #24342e; font-size: 12px; text-transform: uppercase; }
    tr:last-child td { border-bottom: 0; }
    @media (max-width: 860px) { main { padding: 16px; } .dashboard { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 560px) { .dashboard { grid-template-columns: 1fr; } table { display: block; overflow-x: auto; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Báo cáo tháng ${escapeHtml(report.monthLabel)}</h1>
      <p class="subtitle">Xuất lúc ${escapeHtml(report.generatedAt)}. Số liệu được lấy từ chứng từ và sổ chi tiết, không nhập tay số tổng.</p>
    </header>
    <section class="dashboard" aria-label="Tổng quan tháng">
      ${report.dashboard
        .map(
          (metric) => `<article class="card">
        <div class="label">${escapeHtml(metric.label)}</div>
        <div class="value">${escapeHtml(displayValue(metric.value))}</div>
        <div class="note">${escapeHtml(metric.note)}</div>
      </article>`
        )
        .join("\n")}
    </section>
    ${report.sections
      .filter((section) => section.title !== "Tổng quan tháng")
      .map(
        (section) => `<section>
      <h2>${escapeHtml(section.title)}</h2>
      ${htmlTable(section)}
    </section>`
      )
      .join("\n")}
  </main>
</body>
</html>`;
}

export function getAvailableReportMonths(state: OperationsState) {
  const months = new Set<string>();

  for (const date of collectReportDates(state)) {
    const month = date.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) {
      months.add(month);
    }
  }

  return Array.from(months).sort().reverse();
}

export function getDefaultReportMonth(state: OperationsState, fallback = new Date()) {
  return getAvailableReportMonths(state)[0] ?? fallback.toISOString().slice(0, 7);
}

function createSummarySection(summary: MonthlyReportSummary): MonthlyReportSection {
  return {
    title: "Tổng hợp",
    headers: ["Chỉ tiêu", "Giá trị"],
    rows: [
      ["Số đơn bán", summary.salesOrderCount],
      ["Doanh thu trước VAT", summary.salesNet],
      ["VAT bán ra", summary.salesTax],
      ["Doanh thu sau VAT", summary.salesGross],
      ["Giá vốn hàng bán", summary.costOfGoodsSold],
      ["Lãi gộp", summary.grossProfit],
      ["Tỷ suất lãi gộp", `${(summary.grossMarginRate * 100).toFixed(2)}%`],
      ["Phải thu phát sinh", summary.customerDebit],
      ["Tiền khách đã thu", summary.customerCredit],
      ["Phải trả nhà cung cấp phát sinh", summary.supplierCredit],
      ["Đã chi nhà cung cấp", summary.supplierDebit],
      ["Quỹ thu vào", summary.cashIn],
      ["Quỹ chi ra", summary.cashOut],
      ["Số lượng nhập kho", summary.inventoryReceiptQuantity],
      ["Số lượng xuất kho", summary.inventoryIssueQuantity],
      ["Tiền công phát sinh", summary.employeeCompensation],
      ["Đã thanh toán nhân viên", summary.employeePaid],
      ["Tạm ứng nhân viên ròng", summary.employeeAdvanceNet],
      ["Vấn đề import còn mở", summary.openImportIssues],
      ["Sự kiện kiểm toán", summary.auditEventCount]
    ]
  };
}

function createDashboardMetrics(summary: MonthlyReportSummary): MonthlyReportDashboardMetric[] {
  return [
    {
      label: "Doanh thu sau VAT",
      value: summary.salesGross,
      note: "Doanh thu đã ghi nhận từ hàng thực tế giao trong tháng."
    },
    {
      label: "Giá vốn hàng bán",
      value: summary.costOfGoodsSold,
      note: "Giá vốn xuất kho theo bình quân di động cộng giá mua thực tế của hàng giao thẳng."
    },
    {
      label: "Lãi gộp",
      value: summary.grossProfit,
      note: "Doanh thu trước VAT trừ giá vốn hàng bán."
    },
    {
      label: "Tỷ suất lãi gộp",
      value: `${(summary.grossMarginRate * 100).toFixed(2)}%`,
      note: "Lãi gộp chia doanh thu trước VAT."
    },
    {
      label: "Đã thu khách",
      value: summary.customerCredit,
      note: "Từ các phiếu thu đã xác nhận trong sổ công nợ khách hàng."
    },
    {
      label: "Phải thu còn lại",
      value: summary.customerDebit - summary.customerCredit,
      note: "Phát sinh phải thu trừ tiền khách đã thu trong tháng."
    },
    {
      label: "Dòng tiền ròng",
      value: summary.cashIn - summary.cashOut,
      note: "Tổng thu quỹ trừ tổng chi quỹ trong tháng."
    },
    {
      label: "Phải trả NCC còn lại",
      value: summary.supplierCredit - summary.supplierDebit,
      note: "Phải trả nhà cung cấp phát sinh trừ phần đã chi."
    },
    {
      label: "Tiền công còn phải trả",
      value: summary.employeeCompensation - summary.employeePaid - summary.employeeAdvanceNet,
      note: "Tiền công phát sinh trừ thanh toán và tạm ứng nhân viên.",
    },
    {
      label: "Tạm ứng nhân viên",
      value: summary.employeeAdvanceNet,
      note: "Tạm ứng đã xác nhận trừ các phiếu tạm ứng đã đảo trong tháng."
    },
    {
      label: "Nhập kho",
      value: summary.inventoryReceiptQuantity,
      note: "Tổng số lượng nhập từ nhà cung cấp trong tháng, không gồm chuyển kho."
    },
    {
      label: "Xuất kho",
      value: summary.inventoryIssueQuantity,
      note: "Tổng số lượng xuất giao khách trong tháng, không gồm chuyển kho."
    },
    {
      label: "Chuyển kho",
      value: summary.inventoryTransferQuantity,
      note: "Số lượng điều chuyển nội bộ, không tính vào nhập mua hoặc xuất bán."
    },
    {
      label: "Chênh lệch kiểm kê",
      value: summary.inventoryAdjustmentQuantity,
      note: "Chênh lệch tăng/giảm tồn từ biên bản kiểm kê."
    }
  ];
}

function createDashboardSection(metrics: MonthlyReportDashboardMetric[]): MonthlyReportSection {
  return {
    title: "Tổng quan tháng",
    headers: ["Chỉ số", "Giá trị", "Ghi chú"],
    rows: metrics.map((metric) => [metric.label, metric.value, metric.note])
  };
}

function createSalesSection(state: OperationsState, salesOrders: OperationsState["salesOrders"]): MonthlyReportSection {
  return {
    title: "Đơn bán lập trong tháng",
    headers: ["Đơn bán", "Khách hàng", "Ngày", "Trạng thái", "Trước VAT", "VAT", "Sau VAT"],
    rows: salesOrders.map((order) => {
      const totals = salesOrderTotals(order.lines);
      return [order.documentNo, partyName(state, order.customerId), order.orderDate, order.status, totals.net, totals.tax, totals.gross];
    })
  };
}

function createCustomerLedgerSection(
  state: OperationsState,
  entries: OperationsState["customerLedgerEntries"]
): MonthlyReportSection {
  return {
    title: "Sổ công nợ khách hàng",
    headers: ["Khách hàng", "Chứng từ", "Nợ", "Có", "Ngày"],
    rows: entries.map((entry) => [
      partyName(state, entry.customerId),
      entry.sourceDocument,
      entry.direction === "debit" ? entry.amount : "",
      entry.direction === "credit" ? entry.amount : "",
      entry.postingDate
    ])
  };
}

function createSupplierLedgerSection(
  state: OperationsState,
  entries: OperationsState["supplierLedgerEntries"]
): MonthlyReportSection {
  return {
    title: "Sổ công nợ nhà cung cấp",
    headers: ["Nhà cung cấp", "Chứng từ", "Tăng phải trả", "Giảm phải trả", "Ngày"],
    rows: entries.map((entry) => [
      partyName(state, entry.supplierId),
      entry.sourceDocument,
      entry.direction === "credit" ? entry.amount : "",
      entry.direction === "debit" ? entry.amount : "",
      entry.postingDate
    ])
  };
}

function createCashSection(entries: OperationsState["cashTransactions"]): MonthlyReportSection {
  return {
    title: "Sổ quỹ",
    headers: ["Tài khoản", "Chứng từ", "Thu", "Chi", "Thời điểm"],
    rows: entries.map((entry) => [
      entry.accountName,
      entry.sourceDocument,
      entry.direction === "in" ? entry.amount : "",
      entry.direction === "out" ? entry.amount : "",
      entry.postedAt
    ])
  };
}

function createInventorySection(state: OperationsState, movements: OperationsState["inventoryMovements"]): MonthlyReportSection {
  return {
    title: "Phát sinh kho",
    headers: ["Loại", "Chứng từ", "Vật tư", "Số lượng", "Giá vốn", "Mã ghi sổ", "Thời điểm"],
    rows: movements.map((movement) => [
      movement.movementType,
      movement.sourceDocument,
      productLabel(state, movement.productUnitId),
      movement.quantity,
      movement.unitCost,
      movement.postingKey,
      movement.postedAt
    ])
  };
}

function createEmployeeLedgerSection(
  state: OperationsState,
  entries: OperationsState["employeeLedgerEntries"]
): MonthlyReportSection {
  return {
    title: "Sổ tiền công nhân viên",
    headers: ["Nhân viên", "Chứng từ", "Phát sinh công", "Đã trả", "Ngày"],
    rows: entries.map((entry) => [
      partyName(state, entry.employeeId),
      entry.sourceDocument,
      entry.direction === "credit" ? entry.amount : "",
      entry.direction === "debit" ? entry.amount : "",
      entry.postingDate
    ])
  };
}

function createImportIssueSection(state: OperationsState): MonthlyReportSection {
  return {
    title: "Vấn đề import còn mở",
    headers: ["Trang tính", "Dòng", "Mức", "Nội dung"],
    rows: state.importIssues
      .filter((issue) => issue.status === "open")
      .map((issue) => [issue.sourceSheet, issue.rowNumber, issue.severity === "error" ? "Lỗi" : "Cảnh báo", issue.message])
  };
}

function createAuditSection(entries: OperationsState["auditLogs"]): MonthlyReportSection {
  return {
    title: "Nhật ký kiểm toán",
    headers: ["Thời điểm", "Người thao tác", "Vai trò", "Thao tác", "Quyền", "Chứng từ liên quan", "Lý do", "Mã liên kết", "Tóm tắt"],
    rows: entries.map((entry) => [
      entry.occurredAt,
      entry.actorName,
      entry.actorRole ?? "-",
      entry.action,
      entry.permission ?? "-",
      entry.targetId ?? "-",
      entry.reason ?? "-",
      entry.correlationId ?? "-",
      entry.summary
    ])
  };
}

function collectReportDates(state: OperationsState) {
  return [
    ...state.salesOrders.map((order) => order.orderDate),
    ...state.purchaseOrders.map((order) => order.orderDate),
    ...state.deliveryJobs.map((job) => job.plannedDate),
    ...state.customerLedgerEntries.map((entry) => entry.postingDate),
    ...state.supplierLedgerEntries.map((entry) => entry.postingDate),
    ...state.employeeLedgerEntries.map((entry) => entry.postingDate),
    ...state.cashTransactions.map((entry) => entry.postedAt),
    ...state.inventoryMovements.map((movement) => movement.postedAt),
    ...state.workOrders.map((order) => order.workDate),
    ...state.auditLogs.map((entry) => entry.occurredAt)
  ];
}

function isSameMonth(value: string, month: string) {
  return value.slice(0, 7) === month;
}

function assertMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Tháng báo cáo không hợp lệ.");
  }
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${monthNumber}/${year}`;
}

function sumBy<T>(items: T[], value: (item: T) => number) {
  return items.reduce((sum, item) => sum + value(item), 0);
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function htmlTable(section: MonthlyReportSection) {
  return `<table>
        <thead>
          <tr>${section.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${
            section.rows.length > 0
              ? section.rows
                  .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(displayValue(cell))}</td>`).join("")}</tr>`)
                  .join("\n")
              : `<tr><td colspan="${section.headers.length}">Không có dữ liệu trong tháng này.</td></tr>`
          }
        </tbody>
      </table>`;
}

function displayValue(value: string | number) {
  return typeof value === "number" ? new Intl.NumberFormat("vi-VN").format(value) : value;
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
