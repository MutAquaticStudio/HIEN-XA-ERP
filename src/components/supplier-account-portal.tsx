"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ClipboardCheck, Landmark, LogOut, MessageCircle, Send, Truck } from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import { submitSupplierDeliveryNoticeAction, submitSupplierPurchaseOrderResponseAction } from "@/app/portal-actions";
import { PartnerConversation } from "@/components/partner-conversation";
import { PushNotificationControl } from "@/components/push-notification-control";

type SupplierOrder = {
  id: string;
  documentNo: string;
  orderDate: string;
  status: string;
  lines: Array<{
    id: string;
    name: string;
    unitName: string;
    orderedQuantity: number;
    receivedQuantity: number;
    unitCost: number;
    taxRate: number;
    destination: string;
  }>;
  responseCount: number;
  noticeCount: number;
};

type LedgerItem = {
  id: string;
  documentNo: string;
  date: string;
  direction: "debit" | "credit";
  amount: number;
};

export function SupplierAccountPortal({
  supplierName,
  supplierId,
  orders,
  balance,
  entries
}: {
  supplierName: string;
  supplierId: string;
  orders: SupplierOrder[];
  balance: number;
  entries: LedgerItem[];
}) {
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  const outstanding = Math.max(0, balance);

  return (
    <main className="customer-portal supplier-portal">
      <header className="customer-portal-header">
        <Link className="customer-portal-brand" href="/nha-cung-cap" aria-label="Cổng nhà cung cấp VLXD Hiền Xa">
          <span className="brand-mark">HX</span>
          <span><strong>VLXD Hiền Xa</strong><small>Cổng nhà cung cấp</small></span>
        </Link>
        <form action={logoutAction}>
          <button className="customer-logout" type="submit"><LogOut aria-hidden="true" />Đăng xuất</button>
        </form>
      </header>

      <section className="customer-hero" aria-labelledby="supplier-portal-title">
        <div>
          <p className="customer-eyebrow">Thông tin dành cho nhà cung cấp</p>
          <h1 id="supplier-portal-title">Chào {supplierName}</h1>
          <p>Xem đơn bán cho cửa hàng, trả lời khả năng cung cấp và báo hàng đã giao để cửa hàng kiểm tra.</p>
        </div>
        <Truck aria-hidden="true" />
      </section>

      <section className="supplier-summary-grid" aria-label="Tóm tắt nhà cung cấp">
        <article>
          <ClipboardCheck aria-hidden="true" />
          <span>Đơn bán cần trả lời</span>
          <strong>{orders.filter((order) => order.status !== "fully_received").length}</strong>
        </article>
        <article>
          <Landmark aria-hidden="true" />
          <span>Cửa hàng cần thanh toán</span>
          <strong>{formatCurrency(outstanding)}</strong>
          <span>Cửa hàng sẽ thông báo hạn thanh toán.</span>
        </article>
      </section>

      <div className="supplier-portal-workspace">
        <div className="supplier-portal-primary">
      <section className="supplier-orders-panel" aria-labelledby="supplier-orders-title">
        <div className="customer-panel-heading">
          <div>
            <p className="customer-eyebrow">Đơn bán cho cửa hàng</p>
            <h2 id="supplier-orders-title">Trả lời và báo giao hàng</h2>
          </div>
          <ClipboardCheck aria-hidden="true" />
        </div>

        {orders.length > 0 ? (
          <div className="supplier-order-list">
            {orders.map((order) => (
              <article className="supplier-order" key={order.id}>
                <div className="supplier-order-heading">
                  <div><strong>{order.documentNo}</strong><span>{formatDate(order.orderDate)} · {statusLabel(order.status)}</span></div>
                  <b>{order.responseCount} lần trả lời · {order.noticeCount} lần báo giao</b>
                </div>
                <div className="supplier-order-lines">
                  {order.lines.map((line) => (
                    <div key={line.id}>
                      <span><strong>{line.name}</strong><small>{line.destination}</small></span>
                      <span>{formatQuantity(line.orderedQuantity)} {line.unitName}</span>
                      <span>Đã nhận: {formatQuantity(line.receivedQuantity)}</span>
                      <b>{formatCurrency(line.unitCost * line.orderedQuantity * (1 + line.taxRate))}</b>
                    </div>
                  ))}
                </div>

                <div className="supplier-order-actions">
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    startTransition(async () => {
                      const result = await submitSupplierPurchaseOrderResponseAction({
                        idempotencyKey: createPortalKey("supplier-response"),
                        purchaseOrderId: order.id,
                        status: form.get("status"),
                        proposedDeliveryDate: form.get("proposedDeliveryDate") || undefined,
                        note: form.get("note") || undefined
                      });
                      setMessage(result.message);
                    });
                  }}>
                    <label>Khả năng cung cấp<select name="status" defaultValue="available"><option value="available">Có thể cung cấp</option><option value="unavailable">Chưa thể cung cấp</option></select></label>
                    <label>Ngày giao dự kiến<input name="proposedDeliveryDate" type="date" /></label>
                    <label>Ghi chú<textarea name="note" rows={2} maxLength={1000} placeholder="Ví dụ: giao thành hai đợt" /></label>
                    <button className="button button-secondary" type="submit" disabled={pending}><MessageCircle aria-hidden="true" />{pending ? "Đang gửi..." : "Gửi trả lời"}</button>
                  </form>

                  <form encType="multipart/form-data" onSubmit={(event) => {
                    event.preventDefault();
                    const formElement = event.currentTarget;
                    const form = new FormData(formElement);
                    form.set("purchaseOrderId", order.id);
                    form.set("idempotencyKey", createPortalKey("supplier-delivery"));
                    startTransition(async () => {
                      const result = await submitSupplierDeliveryNoticeAction(form);
                      setMessage(result.message);
                      if (result.ok) formElement.reset();
                    });
                  }}>
                    <p className="supplier-action-title">Báo hàng đã giao</p>
                    {order.lines.filter((line) => line.orderedQuantity > line.receivedQuantity).map((line) => (
                      <label key={line.id}>Số lượng {line.name}<input name={`line:${line.id}`} type="number" min="0" max={line.orderedQuantity - line.receivedQuantity} step="any" placeholder="0" /></label>
                    ))}
                    <label>Ghi chú giao hàng<textarea name="note" rows={2} maxLength={1000} placeholder="Thông tin xe, người giao hoặc ghi chú" /></label>
                    <label>Ảnh hoặc chứng từ giao hàng<input name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" /></label>
                    <button className="button button-primary" type="submit" disabled={pending}><Send aria-hidden="true" />{pending ? "Đang gửi..." : "Gửi báo giao để cửa hàng duyệt"}</button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="customer-empty">Chưa có đơn bán nào cần xử lý.</p>}

        {message ? <p className="supplier-portal-message" role="status" aria-live="polite">{message}</p> : null}
      </section>

      <section className="customer-portal-grid">
        <article className="customer-panel">
          <div className="customer-panel-heading"><div><p className="customer-eyebrow">Thanh toán</p><h2>Các lần cửa hàng đã thanh toán</h2></div><Landmark aria-hidden="true" /></div>
          {entries.length > 0 ? (
            <ul className="customer-entry-list">
              {entries.map((entry) => <li key={entry.id}><div><strong>{entry.documentNo}</strong><span>Đã thanh toán ngày {formatDate(entry.date)}</span></div><b className="customer-entry-credit">{formatCurrency(entry.amount)}</b></li>)}
            </ul>
          ) : <p className="customer-empty">Chưa có lần thanh toán nào.</p>}
        </article>
        <article className="customer-panel">
          <div className="customer-panel-heading"><div><p className="customer-eyebrow">Cửa hàng sẽ kiểm tra</p><h2>Trả lời và báo giao</h2></div><ClipboardCheck aria-hidden="true" /></div>
          <p className="customer-empty">Sau khi bạn gửi, cửa hàng sẽ kiểm tra rồi thông báo lại. Số tiền chưa thay đổi ngay.</p>
        </article>
      </section>
        </div>

        <aside className="supplier-portal-sidebar" aria-label="Trao đổi với cửa hàng">
          <PartnerConversation partyType="supplier" partyId={supplierId} partyLabel="Cửa hàng VLXD Hiền Xa" title="Nhắn tin với cửa hàng" compact />
        </aside>
      </div>
      <PushNotificationControl />
    </main>
  );
}

function createPortalKey(prefix: string) {
  return `${prefix}-${Date.now()}-${window.crypto.randomUUID()}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

function statusLabel(status: string) {
  return ({ ordered: "Đã xác nhận", partially_received: "Đang nhận hàng", fully_received: "Đã nhận đủ", draft: "Đang soạn" } as Record<string, string>)[status] ?? status;
}
