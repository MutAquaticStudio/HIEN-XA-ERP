import { ErpShell } from "@/components/erp-v2/erp-shell";
import { formatMoney, formatQuantity } from "@/lib/format";
import { createDashboardReadModel } from "@/server/erp-v2/dashboard-read-model";
import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { requirePageIdentityUser } from "@/server/identity/auth-context";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePageIdentityUser();
  if (user.role === "customer" || user.role === "supplier") redirect(user.role === "customer" ? "/khach-hang" : "/nha-cung-cap");
  const snapshot = projectOperationsSnapshot(await getDemoOperationsSnapshot(), user);
  const query = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const model = createDashboardReadModel(snapshot.state, query.from ?? today, query.to ?? today, dashboardRole(user.role));
  const maxRevenue = Math.max(...model.revenue.map((point) => point.revenue), 1);
  return <ErpShell user={user} activePath="/dashboard" title="Tổng quan vận hành">
    <header className="erp-v2-page-header"><div><p className="erp-v2-eyebrow">Tổng quan vận hành</p><h1>Điều hành theo số liệu thật</h1><p className="erp-v2-page-description">KPI, dòng tiền và việc cần xử lý lấy từ các sổ ghi nhận hiện tại.</p></div></header>
    <section className="erp-v2-dashboard-filter"><form method="get"><label>Từ ngày<input type="date" name="from" defaultValue={model.from} /></label><label>Đến ngày<input type="date" name="to" defaultValue={model.to} /></label><button className="erp-v2-button primary" type="submit">Cập nhật báo cáo</button></form></section>
    <section className="erp-v2-kpi-grid" aria-label="Chỉ số chính">{model.kpis.map((kpi) => <article className="erp-v2-kpi" key={kpi.id}><span>{kpi.label}</span><strong>{kpi.unit === "money" ? formatMoney(kpi.value) : formatQuantity(kpi.value)}</strong><small>{kpi.note}</small></article>)}</section>
    <section className="erp-v2-dashboard-grid"><article className="erp-v2-panel erp-v2-chart-panel"><div className="erp-v2-panel-header"><div><h2>Doanh thu theo ngày</h2><p>Nguồn: sổ phải thu · Đơn vị: VND · Bộ lọc: {model.from} → {model.to}</p></div></div>{model.revenue.some((point) => point.revenue > 0) ? <><div className="erp-v2-chart" aria-label="Biểu đồ doanh thu theo ngày">{model.revenue.map((point) => <div className="erp-v2-chart-column" key={point.date}><span title={`${point.date}: ${formatMoney(point.revenue)}`} style={{ height: `${Math.max((point.revenue / maxRevenue) * 100, point.revenue ? 4 : 1)}%` }} /><small>{point.date.slice(5)}</small></div>)}</div><div className="erp-v2-chart-table"><table><thead><tr><th>Ngày</th><th>Doanh thu</th></tr></thead><tbody>{model.revenue.map((point) => <tr key={point.date}><td>{point.date}</td><td>{formatMoney(point.revenue)}</td></tr>)}</tbody></table></div></> : <div className="erp-v2-empty compact"><p>Chưa có doanh thu được ghi nhận trong kỳ đã chọn.</p></div>}</article><article className="erp-v2-panel erp-v2-chart-panel"><div className="erp-v2-panel-header"><div><h2>Thu vào và chi ra</h2><p>Nguồn: giao dịch quỹ · Đơn vị: VND · Cùng bộ lọc thời gian.</p></div></div>{model.cash.in || model.cash.out ? <><div className="erp-v2-cash-summary"><div><span>Thu vào</span><strong>{formatMoney(model.cash.in)}</strong></div><div><span>Chi ra</span><strong>{formatMoney(model.cash.out)}</strong></div><div><span>Ròng</span><strong>{formatMoney(model.cash.net)}</strong></div></div><div className="erp-v2-chart-table"><table><thead><tr><th>Ngày</th><th>Thu vào</th><th>Chi ra</th></tr></thead><tbody>{model.revenue.map((point) => <tr key={point.date}><td>{point.date}</td><td>{formatMoney(point.cashIn)}</td><td>{formatMoney(point.cashOut)}</td></tr>)}</tbody></table></div></> : <div className="erp-v2-empty compact"><p>Chưa có giao dịch quỹ trong kỳ đã chọn.</p></div>}</article></section>
    <section className="erp-v2-dashboard-grid lower"><article className="erp-v2-panel"><div className="erp-v2-panel-header"><div><h2>Top vật tư trong kỳ</h2><p>Nguồn: dòng đơn bán · Sắp xếp theo số lượng.</p></div></div>{model.topProducts.length ? <div className="erp-v2-mini-list">{model.topProducts.map((item) => <div key={item.id}><strong>{item.label}</strong><span>{formatQuantity(item.quantity)} {item.unit}</span></div>)}</div> : <div className="erp-v2-empty compact"><p>Chưa có vật tư phát sinh trong kỳ.</p></div>}</article><article className="erp-v2-panel"><div className="erp-v2-panel-header"><div><h2>Việc cần xử lý</h2><p>Nguồn: dashboard vai trò hiện tại.</p></div></div>{model.attention.length ? <div className="erp-v2-mini-list">{model.attention.map((item) => <div key={item.id}><strong>{item.label}</strong><span>{item.count} · {item.detail}</span></div>)}</div> : <div className="erp-v2-empty compact"><p>Không có việc cần xử lý.</p></div>}</article></section>
  </ErpShell>;
}

function dashboardRole(role: string) {
  return (["accountant", "sales", "warehouse", "driver", "worker"].includes(role) ? role : "owner") as "owner" | "accountant" | "sales" | "warehouse" | "driver" | "worker";
}
