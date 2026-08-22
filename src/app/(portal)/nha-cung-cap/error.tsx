"use client";

import Link from "next/link";

export default function SupplierPortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="partner-portal-route-error" role="alert" aria-labelledby="supplier-portal-error-title">
      <span className="customer-eyebrow">Tạm gián đoạn</span>
      <h1 id="supplier-portal-error-title">Chưa tải được dữ liệu đối tác</h1>
      <p>Hãy thử lại trong cổng nhà cung cấp. Nếu lỗi tiếp tục, liên hệ cửa hàng để được hỗ trợ.</p>
      <div className="customer-portal-error-actions"><button className="button button-primary" type="button" onClick={() => reset()}>Thử lại</button><Link className="button" href="/nha-cung-cap">Về tổng quan</Link></div>
    </section>
  );
}
