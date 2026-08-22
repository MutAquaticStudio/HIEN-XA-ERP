"use client";

import Link from "next/link";

export default function ErpRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="erp-v2-route-error" role="alert" aria-labelledby="erp-route-error-title">
      <span className="erp-v2-eyebrow">Không tải được nội dung</span>
      <h1 id="erp-route-error-title">Module đang tạm gián đoạn</h1>
      <p>Dữ liệu an toàn. Hãy thử lại trong vùng nội dung này hoặc quay về tổng quan.</p>
      <div className="erp-v2-detail-actions">
        <button className="erp-v2-button primary" type="button" onClick={() => reset()}>Thử lại</button>
        <Link className="erp-v2-button" href="/dashboard">Về tổng quan</Link>
      </div>
    </section>
  );
}
