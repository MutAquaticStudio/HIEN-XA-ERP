import Link from "next/link";
import { ClipboardList, MapPinned, ReceiptText, WalletCards } from "lucide-react";
import { CustomerPaymentProofForm } from "@/components/erp-v2/customer-payment-proof-form";
import { PartnerConversation } from "@/components/partner-conversation";
import { PushNotificationControl } from "@/components/push-notification-control";
import type { CustomerPortalReadModel } from "@/server/erp-v2/partner-portal-read-model";

export function CustomerPortalOverview({ model }: { model: CustomerPortalReadModel }) {
  const balance = model.receivable - model.overpayment;
  const hasCredit = balance < 0;
  const amountDue = Math.abs(balance);
  const paymentLabel = balance > 0 ? "Cần thanh toán" : hasCredit ? "Cửa hàng đang kiểm tra tiền dư" : "Bạn đã thanh toán đủ";
  const paymentNote = balance > 0
    ? model.paymentDueDate ? `Hạn thanh toán: ${formatDate(model.paymentDueDate)}` : "Cửa hàng sẽ thông báo hạn thanh toán."
    : hasCredit ? "Cửa hàng sẽ kiểm tra lại số tiền đã trả dư." : "Hiện bạn chưa cần thanh toán.";

  return <>
    <section className="customer-hero" aria-labelledby="customer-portal-title">
      <div><p className="customer-eyebrow">Thông tin của bạn</p><h1 id="customer-portal-title">Chào {model.customer.displayName}</h1><p>{model.customer.phone ? `Số điện thoại: ${model.customer.phone}` : "Theo dõi đơn hàng và thanh toán với cửa hàng."}</p></div>
      <Link className="button button-primary customer-order-button" href="/dat-hang"><ClipboardList aria-hidden="true" />Đặt thêm hàng</Link>
      <Link className="button customer-order-button" href="/khach-hang/theo-doi"><MapPinned aria-hidden="true" />Theo dõi giao hàng</Link>
    </section>
    <section className="customer-debt-card" aria-label="Thông tin thanh toán"><div className="customer-debt-icon"><WalletCards aria-hidden="true" /></div><div><p>{paymentLabel}</p><strong className={hasCredit ? "customer-credit-value" : ""}>{formatCurrency(amountDue)}</strong><span>{paymentNote}</span></div></section>
    <section className="customer-portal-grid">
      <article className="customer-panel"><div className="customer-panel-heading"><div><p className="customer-eyebrow">Thanh toán</p><h2>Các lần đã thanh toán</h2></div><ReceiptText aria-hidden="true" /></div>{model.payments.length ? <ul className="customer-entry-list">{model.payments.slice(0, 8).map((entry) => <li key={entry.id}><div><strong>{entry.documentNo}</strong><span>Đã thanh toán ngày {formatDate(entry.date)}</span></div><b className="customer-entry-credit">{formatCurrency(entry.amount)}</b></li>)}</ul> : <p className="customer-empty">Chưa có lần thanh toán nào.</p>}</article>
      <article className="customer-panel"><div className="customer-panel-heading"><div><p className="customer-eyebrow">Đơn hàng của bạn</p><h2>Đơn gần đây</h2></div><ClipboardList aria-hidden="true" /></div>{model.orders.length ? <ul className="customer-order-list">{model.orders.slice(0, 6).map((order) => <li key={order.id}><div><strong><Link href={`/khach-hang/don-hang/${order.id}`}>{order.documentNo}</Link></strong><span>{formatDate(order.orderDate)} · {customerStatus(order.status)}</span></div><b>{formatCurrency(order.total)}</b></li>)}</ul> : <p className="customer-empty">Chưa có đơn hàng nào để hiển thị.</p>}</article>
    </section>
    <div id="minh-chung"><CustomerPaymentProofForm orders={model.orders} paymentProofs={model.paymentProofs} /></div>
    <div id="tin-nhan"><PartnerConversation partyType="customer" partyId={model.customer.id} partyLabel="Cửa hàng VLXD Hiền Xa" title="Nhắn tin với cửa hàng" /></div>
    <p className="customer-portal-note">Số tiền do cửa hàng kiểm tra. Nếu cần hỗ trợ, hãy nhắn tin hoặc gọi cho cửa hàng.</p>
    <PushNotificationControl />
  </>;
}

function formatCurrency(value: number) { return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }
function customerStatus(status: CustomerPortalReadModel["orders"][number]["status"]) { return ({ draft: "Đang chờ cửa hàng xác nhận", confirmed: "Đã xác nhận", allocated: "Đã chuẩn bị nguồn hàng", partially_delivered: "Đang giao một phần", delivered: "Đã giao xong" })[status]; }
