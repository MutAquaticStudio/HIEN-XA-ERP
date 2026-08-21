import Link from "next/link";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import { PartnerPortalNav } from "@/components/erp-v2/partner-portal-nav";
import type { CustomerPortalOrderReadModel, CustomerPortalReadModel, SupplierPortalReadModel } from "@/server/erp-v2/partner-portal-read-model";

export function PartnerPortalFrame({ role, activePath, children }: { role: "customer" | "supplier"; activePath: string; children: React.ReactNode }) {
  const root = role === "customer" ? "/khach-hang" : "/nha-cung-cap";
  return <main className={`customer-portal ${role === "supplier" ? "supplier-portal" : ""}`}>
    <header className="customer-portal-header">
      <Link className="customer-portal-brand" href={root}><span className="brand-mark">HX</span><span><strong>VLXD Hiền Xa</strong><small>{role === "customer" ? "Cổng thông tin khách hàng" : "Cổng nhà cung cấp"}</small></span></Link>
      <form action={logoutAction}><button className="customer-logout" type="submit"><LogOut aria-hidden="true" />Đăng xuất</button></form>
    </header>
    <PartnerPortalNav role={role} activePath={activePath} />
    {children}
  </main>;
}

export function CustomerOrderListPage({ model }: { model: CustomerPortalReadModel }) {
  return <section className="partner-record-page" aria-labelledby="customer-orders-title">
    <div className="customer-panel-heading"><div><p className="customer-eyebrow">Đơn hàng của bạn</p><h1 id="customer-orders-title">Theo dõi số đặt, đã giao và còn lại</h1></div><Link className="button button-primary" href="/dat-hang">Đặt thêm hàng</Link></div>
    {model.orders.length ? <div className="partner-record-list">{model.orders.map((order) => <article key={order.id}>
      <div><Link href={`/khach-hang/don-hang/${order.id}`}><strong>{order.documentNo}</strong></Link><span>{formatDate(order.orderDate)} · {customerStatus(order.status)}</span></div>
      <div><span>{order.lines.length} dòng vật tư</span><strong>{formatMoney(order.total)}</strong></div>
      <div className="partner-progress" aria-label={`Tiến độ giao ${order.documentNo}`}>{order.lines.map((line) => <span key={line.id}>{line.productName}: {formatQuantity(line.deliveredQuantity)}/{formatQuantity(line.orderedQuantity)} {line.unitName}</span>)}</div>
    </article>)}</div> : <p className="customer-empty">Chưa có đơn hàng.</p>}
  </section>;
}

export function CustomerOrderDetailPage({ order }: { order: CustomerPortalOrderReadModel }) {
  return <section className="partner-record-page" aria-labelledby="customer-order-title">
    <Link className="erp-v2-back-link" href="/khach-hang/don-hang">← Tất cả đơn hàng</Link>
    <div className="customer-panel-heading"><div><p className="customer-eyebrow">Chi tiết đơn hàng</p><h1 id="customer-order-title">{order.documentNo}</h1><p>{formatDate(order.orderDate)} · {customerStatus(order.status)}</p></div><strong>{formatMoney(order.total)}</strong></div>
    <div className="partner-record-table"><table><thead><tr><th>Vật tư</th><th>Đã đặt</th><th>Đã giao</th><th>Còn lại</th><th>Đơn giá</th></tr></thead><tbody>{order.lines.map((line) => <tr key={line.id}><td>{line.productName}</td><td>{formatQuantity(line.orderedQuantity)} {line.unitName}</td><td>{formatQuantity(line.deliveredQuantity)} {line.unitName}</td><td>{formatQuantity(line.remainingQuantity)} {line.unitName}</td><td>{formatMoney(line.unitPrice)}</td></tr>)}</tbody></table></div>
    <p className="customer-portal-note">Trạng thái nguồn được tổng hợp an toàn. Portal không hiển thị kho, nhà cung cấp, giá mua hoặc giá vốn.</p>
  </section>;
}

export function CustomerPaymentPage({ model }: { model: CustomerPortalReadModel }) {
  return <section className="partner-record-page" aria-labelledby="customer-payment-title">
    <div className="customer-panel-heading"><div><p className="customer-eyebrow">Công nợ và thanh toán</p><h1 id="customer-payment-title">Số liệu đã được cửa hàng ghi nhận</h1></div></div>
    <div className="supplier-summary-grid"><article><span>Phải thanh toán</span><strong>{formatMoney(model.receivable)}</strong><small>{model.paymentDueDate ? `Hạn ${formatDate(model.paymentDueDate)}` : "Chưa có hạn thanh toán"}</small></article><article><span>Tiền dư đang kiểm tra</span><strong>{formatMoney(model.overpayment)}</strong></article></div>
    <div className="customer-portal-grid"><article className="customer-panel"><h2>Lịch sử thanh toán</h2>{model.payments.length ? <ul className="customer-entry-list">{model.payments.map((payment) => <li key={payment.id}><div><strong>{payment.documentNo}</strong><span>{formatDate(payment.date)}</span></div><b>{formatMoney(payment.amount)}</b></li>)}</ul> : <p className="customer-empty">Chưa có thanh toán được duyệt.</p>}</article><article className="customer-panel"><h2>Minh chứng đã gửi</h2>{model.paymentProofs.length ? <ul className="customer-entry-list">{model.paymentProofs.map((proof) => <li key={proof.id}><div><strong>{model.orders.find((order) => order.id === proof.salesOrderId)?.documentNo ?? proof.salesOrderId}</strong><span>{formatDate(proof.submittedAt)} · {proofStatus(proof.status)}{proof.rejectionReason ? `: ${proof.rejectionReason}` : ""}</span></div><b>{formatMoney(proof.amount)}</b></li>)}</ul> : <p className="customer-empty">Chưa gửi minh chứng.</p>}<Link className="button button-primary" href="/khach-hang#minh-chung">Gửi minh chứng ở tổng quan</Link></article></div>
  </section>;
}

export function SupplierOrderListPage({ model }: { model: SupplierPortalReadModel }) {
  return <section className="partner-record-page" aria-labelledby="supplier-orders-title"><div className="customer-panel-heading"><div><p className="customer-eyebrow">Đơn mua của cửa hàng</p><h1 id="supplier-orders-title">Chỉ hiển thị đơn thuộc nhà cung cấp này</h1></div></div>{model.orders.length ? <div className="partner-record-list">{model.orders.map((order) => <article key={order.id}><div><Link href={`/nha-cung-cap/don-mua/${order.id}`}><strong>{order.documentNo}</strong></Link><span>{formatDate(order.orderDate)} · {supplierStatus(order.status)}</span></div><div><span>{order.latestResponse ? `${order.latestResponse.status === "available" ? "Có thể cung cấp" : "Chưa thể cung cấp"}${order.expectedDeliveryDate ? ` · giao ${formatDate(order.expectedDeliveryDate)}` : ""}` : "Chưa phản hồi"} · {order.noticeCount} báo giao</span><strong>{formatMoney(order.lines.reduce((sum, line) => sum + line.orderedQuantity * line.unitCost * (1 + line.taxRate), 0))}</strong></div><div className="partner-progress">{order.lines.map((line) => <span key={line.id}>{line.productName}: đã nhận {formatQuantity(line.receivedQuantity)}/{formatQuantity(line.orderedQuantity)} {line.unitName}</span>)}</div></article>)}</div> : <p className="customer-empty">Chưa có đơn mua.</p>}</section>;
}

export function SupplierPaymentPage({ model }: { model: SupplierPortalReadModel }) {
  return <section className="partner-record-page" aria-labelledby="supplier-payment-title"><div className="customer-panel-heading"><div><p className="customer-eyebrow">Công nợ nhà cung cấp</p><h1 id="supplier-payment-title">Thanh toán đã ghi nhận</h1></div></div><div className="supplier-summary-grid"><article><span>Cửa hàng phải trả</span><strong>{formatMoney(model.payable)}</strong></article><article><span>Trả dư đang đối chiếu</span><strong>{formatMoney(model.overpayment)}</strong></article></div><article className="customer-panel"><h2>Lịch sử thanh toán</h2>{model.payments.length ? <ul className="customer-entry-list">{model.payments.map((payment) => <li key={payment.id}><div><strong>{payment.documentNo}</strong><span>{formatDate(payment.date)}</span></div><b>{formatMoney(payment.amount)}</b></li>)}</ul> : <p className="customer-empty">Chưa có lần thanh toán nào.</p>}</article></section>;
}

function formatMoney(value: number) { return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value); }
function formatQuantity(value: number) { return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }
function customerStatus(status: CustomerPortalOrderReadModel["status"]) { return ({ draft: "Chờ xác nhận", confirmed: "Đã xác nhận", allocated: "Đã cấp nguồn", partially_delivered: "Đang giao một phần", delivered: "Đã giao" })[status]; }
function supplierStatus(status: SupplierPortalReadModel["orders"][number]["status"]) { return ({ draft: "Đang soạn", ordered: "Đã xác nhận", partially_received: "Đang nhận", fully_received: "Đã nhận đủ" })[status]; }
function proofStatus(status: CustomerPortalReadModel["paymentProofs"][number]["status"]) { return ({ submitted: "Cửa hàng đang kiểm tra", reviewed: "Đã duyệt", rejected: "Đã từ chối" })[status]; }
