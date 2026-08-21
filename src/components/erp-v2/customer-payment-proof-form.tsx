"use client";

import { useRef, useState, useTransition } from "react";
import { Landmark, Send } from "lucide-react";
import { submitCustomerPaymentProofAction } from "@/app/portal-actions";
import { getSelectableCustomerPaymentOrders } from "@/modules/operations/selectors";
import type { CustomerPortalReadModel } from "@/server/erp-v2/partner-portal-read-model";

export function CustomerPaymentProofForm({ orders, paymentProofs }: Pick<CustomerPortalReadModel, "orders" | "paymentProofs">) {
  const transferOrders = getSelectableCustomerPaymentOrders(orders);
  const [orderId, setOrderId] = useState(transferOrders[0]?.id ?? "");
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyKeys = useRef(new Map<string, string>());
  const selected = transferOrders.find((order) => order.id === orderId);
  const bankId = process.env.NEXT_PUBLIC_PAYMENT_BANK_ID?.trim();
  const accountNumber = process.env.NEXT_PUBLIC_PAYMENT_ACCOUNT_NO?.trim();
  const qrUrl = selected && bankId && accountNumber
    ? `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNumber)}-compact2.png?amount=${Math.round(selected.total)}&addInfo=${encodeURIComponent(`THANH TOAN ${selected.documentNo}`)}`
    : undefined;

  if (transferOrders.length === 0) return null;

  return (
    <section className="customer-payment-panel" aria-labelledby="payment-proof-title">
      <div className="customer-panel-heading"><div><p className="customer-eyebrow">Thanh toán chuyển khoản</p><h2 id="payment-proof-title">Gửi minh chứng để cửa hàng đối soát</h2></div><Landmark aria-hidden="true" /></div>
      <div className="customer-payment-body">
        <label>Đơn hàng<select value={orderId} onChange={(event) => setOrderId(event.target.value)}>{transferOrders.map((order) => <option key={order.id} value={order.id}>{order.documentNo} - {formatCurrency(order.total)}</option>)}</select></label>
        {qrUrl ? <img className="customer-payment-qr" src={qrUrl} alt={`Mã QR thanh toán ${selected?.documentNo ?? "đơn hàng"}`} /> : <p className="customer-payment-config">Cửa hàng sẽ gửi thông tin QR chuyển khoản sau khi xác nhận đơn.</p>}
        <form ref={formRef} className="customer-payment-form" onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          formData.set("orderId", orderId);
          const idempotencyKey = idempotencyKeys.current.get(orderId) ?? `customer-proof-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          idempotencyKeys.current.set(orderId, idempotencyKey);
          formData.set("idempotencyKey", idempotencyKey);
          startTransition(async () => {
            const result = await submitCustomerPaymentProofAction(formData);
            setMessage(result.message);
            if (result.ok) {
              formRef.current?.reset();
              idempotencyKeys.current.delete(orderId);
            }
          });
        }}>
          <input type="hidden" name="amount" value={selected?.total ?? 0} />
          <label>Mã giao dịch ngân hàng<input name="transferReference" minLength={3} maxLength={160} placeholder="Ví dụ: MB-2407-001" required /></label>
          <label>Ghi chú<textarea name="note" rows={2} maxLength={1000} placeholder="Ghi thêm nếu cần" /></label>
          <label>Ảnh hoặc PDF chuyển khoản<input name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required /></label>
          <button className="button button-primary" type="submit" disabled={pending || !selected}><Send aria-hidden="true" />{pending ? "Đang gửi..." : "Gửi cửa hàng đối soát"}</button>
        </form>
        {message ? <p className="customer-payment-message" role="status">{message}</p> : null}
        {paymentProofs.length ? <div className="customer-payment-history"><p>Đã gửi {paymentProofs.length} minh chứng. Cửa hàng chỉ ghi nhận thanh toán sau khi đối soát.</p><ul>{paymentProofs.map((proof) => <li key={proof.id}>{formatCurrency(proof.amount)} - {paymentProofStatusText(proof.status)}{proof.rejectionReason ? `: ${proof.rejectionReason}` : ""}</li>)}</ul></div> : null}
      </div>
    </section>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function paymentProofStatusText(status: CustomerPortalReadModel["paymentProofs"][number]["status"]) {
  if (status === "reviewed") return "Cửa hàng đã kiểm tra";
  if (status === "rejected") return "Cửa hàng cần bạn gửi lại minh chứng";
  return "Đang chờ cửa hàng kiểm tra";
}
