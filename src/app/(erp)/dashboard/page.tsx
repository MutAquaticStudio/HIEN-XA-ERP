import { formatMoney, formatQuantity } from "@/lib/format";
import { createDashboardReadModel } from "@/server/erp-v2/dashboard-read-model";
import { getErpV2Snapshot } from "@/server/erp-v2/runtime";
import { requirePageIdentityUser } from "@/server/identity/auth-context";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePageIdentityUser();
  if (user.role === "customer" || user.role === "supplier") redirect(user.role === "customer" ? "/khach-hang" : "/nha-cung-cap");
  const snapshot = projectOperationsSnapshot(await getErpV2Snapshot(), user);
  const query = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const model = createDashboardReadModel(snapshot.state, query.from ?? today, query.to ?? today, dashboardRole(user.role));
  const maxRevenue = Math.max(...model.revenue.map((point) => point.revenue), 1);
  return <>
    <header className="erp-v2-page-header">
      <div>
        <p className="erp-v2-eyebrow">Tổng quan vận hành</p>
        <h1>Điều hành theo số liệu thật</h1>
        <p className="erp-v2-page-description">KPI, dòng tiền và việc cần xử lý lấy từ các sổ ghi nhận hiện tại.</p>
      </div>
    </header>
    <section className="erp-v2-dashboard-filter" aria-labelledby="dashboard-filter-title">
      <div className="erp-v2-filter-heading">
        <div>
          <h2 id="dashboard-filter-title">Phạm vi báo cáo</h2>
          <p>Chọn cùng một khoảng ngày cho toàn bộ KPI, biểu đồ và danh sách.</p>
        </div>
        <output htmlFor="dashboard-from dashboard-to">{model.from} → {model.to}</output>
      </div>
      <form method="get">
        <label htmlFor="dashboard-from">Từ ngày<input id="dashboard-from" type="date" name="from" defaultValue={model.from} /></label>
        <label htmlFor="dashboard-to">Đến ngày<input id="dashboard-to" type="date" name="to" defaultValue={model.to} /></label>
        <button className="erp-v2-button primary" type="submit">Cập nhật báo cáo</button>
      </form>
    </section>
    <section className="erp-v2-kpi-grid" aria-label="Chỉ số chính">
      {model.kpis.map((kpi) => <article className="erp-v2-kpi" key={kpi.id}><span>{kpi.label}</span><strong>{kpi.unit === "money" ? formatMoney(kpi.value) : formatQuantity(kpi.value)}</strong><small>{kpi.note}</small></article>)}
    </section>
    <section className="erp-v2-dashboard-grid" aria-label="Biểu đồ vận hành">
      <article className="erp-v2-panel erp-v2-chart-panel" aria-labelledby="revenue-chart-title">
        <div className="erp-v2-panel-header"><div><h2 id="revenue-chart-title">Doanh thu theo ngày</h2><p>Nguồn: sổ phải thu · Đơn vị: VND · Bộ lọc: {model.from} → {model.to}</p></div></div>
        {model.revenue.some((point) => point.revenue > 0) ? <>
          <div className="erp-v2-chart" role="img" aria-label={`Biểu đồ doanh thu từ ${model.from} đến ${model.to}`}>
            {model.revenue.map((point) => {
              const valueLabel = `${point.date}: ${formatMoney(point.revenue)}`;
              return <div className="erp-v2-chart-column" key={point.date}>
                <span role="img" tabIndex={0} aria-label={valueLabel} title={valueLabel} style={{ height: `${Math.max((point.revenue / maxRevenue) * 100, point.revenue ? 4 : 1)}%` }} />
                <small>{point.date.slice(5)}</small>
              </div>;
            })}
          </div>
          <div className="erp-v2-chart-table"><table aria-label="Bảng doanh thu theo ngày"><caption className="sr-only">Doanh thu theo ngày trong khoảng đã chọn</caption><thead><tr><th scope="col">Ngày</th><th scope="col">Doanh thu</th></tr></thead><tbody>{model.revenue.map((point) => <tr key={point.date}><td>{point.date}</td><td>{formatMoney(point.revenue)}</td></tr>)}</tbody></table></div>
        </> : <div className="erp-v2-empty compact"><p>Chưa có doanh thu được ghi nhận trong kỳ đã chọn.</p></div>}
      </article>
      <article className="erp-v2-panel erp-v2-chart-panel" aria-labelledby="cash-chart-title">
        <div className="erp-v2-panel-header"><div><h2 id="cash-chart-title">Thu vào và chi ra</h2><p>Nguồn: giao dịch quỹ · Đơn vị: VND · Cùng bộ lọc thời gian.</p></div></div>
        {model.cash.in || model.cash.out ? <>
          <div className="erp-v2-cash-summary"><div><span>Thu vào</span><strong>{formatMoney(model.cash.in)}</strong></div><div><span>Chi ra</span><strong>{formatMoney(model.cash.out)}</strong></div><div><span>Ròng</span><strong>{formatMoney(model.cash.net)}</strong></div></div>
          <div className="erp-v2-chart-table"><table aria-label="Bảng thu chi theo ngày"><caption className="sr-only">Thu vào và chi ra theo ngày</caption><thead><tr><th scope="col">Ngày</th><th scope="col">Thu vào</th><th scope="col">Chi ra</th></tr></thead><tbody>{model.revenue.map((point) => <tr key={point.date}><td>{point.date}</td><td>{formatMoney(point.cashIn)}</td><td>{formatMoney(point.cashOut)}</td></tr>)}</tbody></table></div>
        </> : <div className="erp-v2-empty compact"><p>Chưa có giao dịch quỹ trong kỳ đã chọn.</p></div>}
      </article>
    </section>
    <section className="erp-v2-dashboard-grid lower" aria-label="Danh sách vận hành">
      <article className="erp-v2-panel" aria-labelledby="top-products-title"><div className="erp-v2-panel-header"><div><h2 id="top-products-title">Top vật tư trong kỳ</h2><p>Nguồn: dòng đơn bán · Sắp xếp theo số lượng.</p></div></div>{model.topProducts.length ? <div className="erp-v2-mini-list">{model.topProducts.map((item) => <div key={item.id}><strong>{item.label}</strong><span>{formatQuantity(item.quantity)} {item.unit}</span></div>)}</div> : <div className="erp-v2-empty compact"><p>Chưa có vật tư phát sinh trong kỳ.</p></div>}</article>
      <article className="erp-v2-panel" aria-labelledby="attention-title"><div className="erp-v2-panel-header"><div><h2 id="attention-title">Việc cần xử lý</h2><p>Nguồn: dashboard vai trò hiện tại.</p></div></div>{model.attention.length ? <div className="erp-v2-mini-list">{model.attention.map((item) => <div key={item.id}><strong>{item.label}</strong><span>{item.count} · {item.detail}</span></div>)}</div> : <div className="erp-v2-empty compact"><p>Không có việc cần xử lý.</p></div>}</article>
    </section>
  </>;
}

function dashboardRole(role: string) {
  return (["accountant", "sales", "warehouse", "driver", "worker"].includes(role) ? role : "owner") as "owner" | "accountant" | "sales" | "warehouse" | "driver" | "worker";
}
