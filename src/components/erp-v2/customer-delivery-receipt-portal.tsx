"use client";

import { useState, useTransition } from "react";
import { confirmCustomerDeliveryReceiptAction } from "@/app/portal-actions";
import type { CustomerPortalReadModel } from "@/server/erp-v2/partner-portal-read-model";

export function CustomerDeliveryReceiptPortal({ deliveries }: { deliveries: CustomerPortalReadModel["deliveries"] }) {
  const [message, setMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const openJobs = deliveries.filter((job) => job.status === "in_transit" && !job.customerConfirmationStatus);
  return <section className="customer-panel" aria-labelledby="delivery-receipt-title">
    <div className="customer-panel-heading"><div><p className="customer-eyebrow">Xác nhận nhận hàng</p><h1 id="delivery-receipt-title">Chụp ảnh sau khi nhận đủ hàng</h1><p className="panel-note">Ảnh xác nhận là bắt buộc trước khi cửa hàng hoàn tất giao và ghi công nợ.</p></div></div>
    <div className="panel-body">{message ? <p className="state-message" role="status">{message}</p> : null}{openJobs.length === 0 ? <p className="customer-empty">Hiện không có chuyến đang giao cần bạn xác nhận.</p> : openJobs.map((job) => <form key={job.id} className="stack-form" onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); startTransition(async () => { const result = await confirmCustomerDeliveryReceiptAction(formData); setMessage(result.message); if (result.ok) event.currentTarget.reset(); }); }}><input type="hidden" name="deliveryJobId" value={job.id} /><input type="hidden" name="idempotencyKey" value={`customer-receipt-${job.id}-${crypto.randomUUID()}`} /><p><strong>{job.documentNo}</strong> · Đơn {job.salesOrderNo}</p><label>Ảnh khách nhận hàng<input name="receiptImage" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required /></label><button className="button button-primary" disabled={isPending} type="submit">{isPending ? "Đang gửi ảnh..." : "Gửi ảnh xác nhận"}</button></form>)}</div>
  </section>;
}
