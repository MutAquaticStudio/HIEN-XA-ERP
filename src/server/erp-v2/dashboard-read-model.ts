import { createRoleDashboard, type DashboardRoleId } from "@/modules/operations/role-dashboard";
import { reconcileOperationsState } from "@/modules/operations/reconciliation";
import type { OperationsState } from "@/modules/operations/types";

export type DashboardChartPoint = { date: string; revenue: number; cashIn: number; cashOut: number };
export type DashboardReadModel = {
  from: string;
  to: string;
  kpis: Array<{ id: string; label: string; value: number; unit: "money" | "count"; note: string }>;
  revenue: DashboardChartPoint[];
  topProducts: Array<{ id: string; label: string; quantity: number; unit: string }>;
  attention: Array<{ id: string; label: string; detail: string; count: number; severity: string }>;
  cash: { in: number; out: number; net: number };
};

export function createDashboardReadModel(state: OperationsState, from: string, to: string, role: DashboardRoleId = "owner"): DashboardReadModel {
  const range = normalizeRange(from, to);
  const inRange = (date: string) => date.slice(0, 10) >= range.from && date.slice(0, 10) <= range.to;
  const days = enumerateDays(range.from, range.to);
  const revenueByDay = new Map(days.map((day) => [day, 0]));
  const cashInByDay = new Map(days.map((day) => [day, 0]));
  const cashOutByDay = new Map(days.map((day) => [day, 0]));
  const quantities = new Map<string, { label: string; unit: string; quantity: number }>();
  for (const entry of state.customerLedgerEntries) {
    if (entry.entryType !== "sale_delivery" || entry.direction !== "debit" || !inRange(entry.postingDate)) continue;
    revenueByDay.set(entry.postingDate.slice(0, 10), (revenueByDay.get(entry.postingDate.slice(0, 10)) ?? 0) + entry.amount);
  }
  for (const transaction of state.cashTransactions) {
    if (!inRange(transaction.postedAt)) continue;
    const day = transaction.postedAt.slice(0, 10);
    const target = transaction.direction === "in" ? cashInByDay : cashOutByDay;
    target.set(day, (target.get(day) ?? 0) + transaction.amount);
  }
  for (const order of state.salesOrders) {
    if (!inRange(order.orderDate)) continue;
    for (const line of order.lines) {
      const product = state.productUnits.find((item) => item.id === line.productUnitId);
      if (!product) continue;
      const current = quantities.get(product.id) ?? { label: `${product.productCode} · ${product.productName}`, unit: product.unitName, quantity: 0 };
      current.quantity += line.quantity;
      quantities.set(product.id, current);
    }
  }
  const reconciliation = reconcileOperationsState(state);
  const cashIn = [...cashInByDay.values()].reduce((sum, value) => sum + value, 0);
  const cashOut = [...cashOutByDay.values()].reduce((sum, value) => sum + value, 0);
  const revenue = [...revenueByDay.entries()].map(([date, value]) => ({ date, revenue: value, cashIn: cashInByDay.get(date) ?? 0, cashOut: cashOutByDay.get(date) ?? 0 }));
  const roleDashboard = createRoleDashboard(state, role);
  const taskItems = roleDashboard.tasks.map((task) => ({ id: task.id, label: task.label, detail: task.detail, count: task.count, severity: task.severity }));
  return {
    from: range.from,
    to: range.to,
    kpis: [
      { id: "revenue", label: "Doanh thu đã ghi nhận", value: revenue.reduce((sum, point) => sum + point.revenue, 0), unit: "money", note: "Từ sổ phải thu của giao hàng trong kỳ." },
      { id: "cash", label: "Tồn quỹ hiện tại", value: reconciliation.cashBalance, unit: "money", note: "Từ các giao dịch quỹ đã ghi nhận." },
      { id: "receivable", label: "Đang nợ khách", value: Object.values(reconciliation.customerAr).reduce((sum, value) => sum + Math.max(value, 0), 0), unit: "money", note: "Số dư dẫn xuất từ sổ khách hàng." },
      { id: "payable", label: "Còn phải trả NCC", value: Object.values(reconciliation.supplierAp).reduce((sum, value) => sum + Math.max(value, 0), 0), unit: "money", note: "Số dư dẫn xuất từ sổ nhà cung cấp." },
      { id: "open-work", label: "Việc cần xử lý", value: taskItems.reduce((sum, task) => sum + task.count, 0), unit: "count", note: "Tổng các nhiệm vụ từ dashboard vai trò." }
    ],
    revenue,
    topProducts: [...quantities.entries()].sort(([, a], [, b]) => b.quantity - a.quantity).slice(0, 8).map(([id, item]) => ({ id, ...item })),
    attention: taskItems,
    cash: { in: cashIn, out: cashOut, net: cashIn - cashOut }
  };
}

export function normalizeRange(from: string, to: string) {
  const safeFrom = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : new Date().toISOString().slice(0, 10);
  const safeTo = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : safeFrom;
  return safeFrom <= safeTo ? { from: safeFrom, to: safeTo } : { from: safeTo, to: safeFrom };
}

function enumerateDays(from: string, to: string) {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end && days.length < 366) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days.length ? days : [from];
}
