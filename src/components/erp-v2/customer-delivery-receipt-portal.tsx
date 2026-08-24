"use client";

import { useRef, useState, useTransition } from "react";
import { confirmCustomerDeliveryReceiptAction } from "@/app/portal-actions";
import type { CustomerPortalReadModel } from "@/server/erp-v2/partner-portal-read-model";
import { MutationIntentRegistry } from "./mutation-intent-registry";

export function CustomerDeliveryReceiptPortal({ deliveries }: { deliveries: CustomerPortalReadModel["deliveries"] }) {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string }>();
  const [isPending, startTransition] = useTransition();
  const mutationIntents = useRef(new MutationIntentRegistry());
  const openJobs = deliveries.filter((job) => job.status === "in_transit" && !job.customerConfirmationStatus);
  return <section className="customer-panel" aria-labelledby="delivery-receipt-title">
    <div className="customer-panel-heading"><div><p className="customer-eyebrow">Xác nhận nhận hàng</p><h1 id="delivery-receipt-title">Chụp ảnh sau khi nhận đủ hàng</h1><p className="panel-note">Ảnh xác nhận là bắt buộc trước khi cửa hàng hoàn tất giao và ghi công nợ.</p></div></div>
    <div className="panel-body">{feedback ? <p className={`feedback feedback-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.text}</p> : null}{openJobs.length === 0 ? <p className="customer-empty">Hiện không có chuyến đang giao cần bạn xác nhận.</p> : openJobs.map((job) => <form key={job.id} className="stack-form" onSubmit={(event) => { event.preventDefault(); const formElement = event.currentTarget; const formData = new FormData(formElement); const intentScope = `customer-delivery-receipt:${job.id}`; const intent = mutationIntents.current.begin(intentScope, { deliveryJobId: job.id, receiptImage: formData.get("receiptImage") }, () => `customer-receipt-${job.id}-${crypto.randomUUID()}`); if (!intent.shouldExecute) return; formData.set("idempotencyKey", intent.idempotencyKey); startTransition(async () => { try { const result = await confirmCustomerDeliveryReceiptAction(formData); setFeedback({ type: result.ok ? "success" : "error", text: result.message }); if (result.ok) { mutationIntents.current.complete(intentScope, intent.idempotencyKey); formElement.reset(); } else mutationIntents.current.retainForRetry(intentScope, intent.idempotencyKey); } catch (error) { mutationIntents.current.retainForRetry(intentScope, intent.idempotencyKey); setFeedback({ type: "error", text: error instanceof Error ? error.message : "Chưa thể gửi ảnh xác nhận. Vui lòng thử lại." }); } }); }}><input type="hidden" name="deliveryJobId" value={job.id} /><p><strong>{job.documentNo}</strong> · Đơn {job.salesOrderNo}</p><label>Ảnh khách nhận hàng<input name="receiptImage" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required /></label><button className="button button-primary" disabled={isPending} type="submit">{isPending ? "Đang gửi ảnh..." : "Gửi ảnh xác nhận"}</button></form>)}</div>
  </section>;
}
