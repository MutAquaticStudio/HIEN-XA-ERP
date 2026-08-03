import Link from "next/link";
import { ClipboardList, LogOut, MapPinned, ReceiptText, WalletCards } from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import { CustomerPaymentProofForm } from "@/components/customer-payment-proof-form";
import { PartnerConversation } from "@/components/partner-conversation";
import { PushNotificationControl } from "@/components/push-notification-control";

type CustomerLedgerItem = {
  id: string;
  documentNo: string;
  date: string;
  direction: "debit" | "credit";
  amount: number;
  dueDate?: string;
};

type CustomerOrderItem = {
  id: string;
  documentNo: string;
  orderDate: string;
  status: "draft" | "confirmed" | "allocated" | "partially_delivered" | "delivered";
  total: number;
  paymentMethod?: "transfer" | "credit_requested";
};

type CustomerPaymentProofItem = {
  id: string;
  salesOrderId: string;
  amount: number;
  status: "submitted" | "reviewed" | "rejected";
  submittedAt: string;
};

export function CustomerAccountPortal({
  customerName,
  customerId,
  customerPhone,
  balance,
  paymentDueDate,
  entries,
  orders,
  paymentProofs
}: {
  customerName: string;
  customerId: string;
  customerPhone: string;
  balance: number;
  paymentDueDate?: string;
  entries: CustomerLedgerItem[];
  orders: CustomerOrderItem[];
  paymentProofs: CustomerPaymentProofItem[];
}) {
  const hasCredit = balance < 0;
  const amountDue = Math.abs(balance);
  const paymentLabel = balance > 0
    ? "Cần thanh toán"
    : hasCredit
      ? "Cửa hàng đang kiểm tra tiền dư"
      : "Bạn đã thanh toán đủ";
  const paymentNote = balance > 0
    ? paymentDueDate
      ? `Hạn thanh toán: ${formatDate(paymentDueDate)}`
      : "Cửa hàng sẽ thông báo hạn thanh toán."
    : hasCredit
      ? "Cửa hàng sẽ kiểm tra lại số tiền đã trả dư."
      : "Hiện bạn chưa cần thanh toán.";

  return (
    <main className="customer-portal">
      <header className="customer-portal-header">
        <Link className="customer-portal-brand" href="/khach-hang" aria-label="Cổng khách hàng VLXD Hiền Xạ">
          <span className="brand-mark">HX</span>
          <span>
            <strong>VLXD Hiền Xạ</strong>
            <small>Cổng thông tin khách hàng</small>
          </span>
        </Link>
        <form action={logoutAction}>
          <button className="customer-logout" type="submit">
            <LogOut aria-hidden="true" />
            Đăng xuất
          </button>
        </form>
      </header>

      <section className="customer-hero" aria-labelledby="customer-portal-title">
        <div>
          <p className="customer-eyebrow">Thông tin của bạn</p>
          <h1 id="customer-portal-title">Chào {customerName}</h1>
          <p>{customerPhone ? `Số điện thoại: ${customerPhone}` : "Theo dõi đơn hàng và thanh toán với cửa hàng."}</p>
        </div>
        <Link className="button button-primary customer-order-button" href="/dat-hang">
          <ClipboardList aria-hidden="true" />
          Đặt thêm hàng
        </Link>
        <Link className="button customer-order-button" href="/khach-hang/theo-doi">
          <MapPinned aria-hidden="true" />
          Theo dõi giao hàng
        </Link>
      </section>

      <section className="customer-debt-card" aria-label="Thông tin thanh toán">
        <div className="customer-debt-icon"><WalletCards aria-hidden="true" /></div>
        <div>
          <p>{paymentLabel}</p>
          <strong className={hasCredit ? "customer-credit-value" : ""}>{formatCurrency(amountDue)}</strong>
          <span>{paymentNote}</span>
        </div>
      </section>

      <section className="customer-portal-grid">
        <article className="customer-panel">
          <div className="customer-panel-heading">
            <div>
              <p className="customer-eyebrow">Thanh toán</p>
              <h2>Các lần đã thanh toán</h2>
            </div>
            <ReceiptText aria-hidden="true" />
          </div>
          {entries.length > 0 ? (
            <ul className="customer-entry-list">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>{entry.documentNo}</strong>
                    <span>Đã thanh toán ngày {formatDate(entry.date)}</span>
                  </div>
                  <b className="customer-entry-credit">{formatCurrency(entry.amount)}</b>
                </li>
              ))}
            </ul>
          ) : <p className="customer-empty">Chưa có lần thanh toán nào.</p>}
        </article>

        <article className="customer-panel">
          <div className="customer-panel-heading">
            <div>
              <p className="customer-eyebrow">Đơn hàng của bạn</p>
              <h2>Đơn gần đây</h2>
            </div>
            <ClipboardList aria-hidden="true" />
          </div>
          {orders.length > 0 ? (
            <ul className="customer-order-list">
              {orders.map((order) => (
                <li key={order.id}>
                  <div>
                    <strong>{order.documentNo}</strong>
                    <span>{formatDate(order.orderDate)} · {orderStatusLabel(order.status)}</span>
                  </div>
                  <b>{formatCurrency(order.total)}</b>
                </li>
              ))}
            </ul>
          ) : <p className="customer-empty">Chưa có đơn hàng nào để hiển thị.</p>}
        </article>
      </section>

      <CustomerPaymentProofForm orders={orders} proofs={paymentProofs} />
      <PartnerConversation partyType="customer" partyId={customerId} partyLabel="Cửa hàng VLXD Hiền Xạ" title="Nhắn tin với cửa hàng" />
      <p className="customer-portal-note">Số tiền do cửa hàng kiểm tra. Nếu cần hỗ trợ, hãy nhắn tin hoặc gọi cho cửa hàng.</p>
      <PushNotificationControl />
    </main>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

function orderStatusLabel(status: CustomerOrderItem["status"]) {
  const labels: Record<CustomerOrderItem["status"], string> = {
    draft: "Đang chờ cửa hàng xác nhận",
    confirmed: "Đã xác nhận",
    allocated: "Đã chuẩn bị nguồn hàng",
    partially_delivered: "Đang giao một phần",
    delivered: "Đã giao xong"
  };
  return labels[status];
}
