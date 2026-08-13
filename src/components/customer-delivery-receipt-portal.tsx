"use client";

import { useState, useTransition } from "react";
import { confirmCustomerDeliveryReceiptAction } from "@/app/portal-actions";

type DeliveryReceiptJob = {
  id: string;
  documentNo: string;
  status: string;
  customerConfirmation?: { status: "confirmed" | "waived" };
  salesOrderNo: string;
};

export function CustomerDeliveryReceiptPortal({ jobs }: { jobs: DeliveryReceiptJob[] }) {
  const [message, setMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const openJobs = jobs.filter((job) => job.status === "in_transit" && !job.customerConfirmation);

  return (
    <main className="portal-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Xác nhận nhận hàng</p>
            <h1>Chụp ảnh sau khi nhận đủ hàng</h1>
            <p className="panel-note">Ảnh xác nhận là bắt buộc trước khi cửa hàng hoàn tất giao và ghi công nợ.</p>
          </div>
        </div>
        <div className="panel-body">
          {message ? <p className="state-message">{message}</p> : null}
          {openJobs.length === 0 ? (
            <p className="empty-state">Hiện không có chuyến đang giao cần bạn xác nhận.</p>
          ) : openJobs.map((job) => (
            <form
              key={job.id}
              className="stack-form"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                startTransition(async () => {
                  const result = await confirmCustomerDeliveryReceiptAction(formData);
                  setMessage(result.message);
                  if (result.ok) event.currentTarget.reset();
                });
              }}
            >
              <input type="hidden" name="deliveryJobId" value={job.id} />
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <p><strong>{job.documentNo}</strong> · Đơn {job.salesOrderNo}</p>
              <label>
                Ảnh khách nhận hàng
                <input name="receiptImage" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required />
              </label>
              <button className="button button-primary" style={{ minHeight: 48 }} disabled={isPending} type="submit">
                {isPending ? "Đang gửi ảnh..." : "Gửi ảnh xác nhận"}
              </button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
