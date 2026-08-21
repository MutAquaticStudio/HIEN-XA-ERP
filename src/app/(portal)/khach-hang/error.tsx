"use client";

import Link from "next/link";

export default function CustomerPortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="partner-portal-route-error" role="alert" aria-labelledby="customer-portal-error-title">
      <span className="customer-eyebrow">Tạm gián đoạn</span>
      <h1 id="customer-portal-error-title">Chưa tải được dữ liệu tài khoản</h1>
      <p>Hãy thử lại trong cổng khách hàng. Nếu lỗi tiếp tục, liên hệ cửa hàng để được hỗ trợ.</p>
      <div className="customer-portal-error-actions"><button className="button button-primary" type="button" onClick={() => reset()}>Thử lại</button><Link className="button" href="/khach-hang">Về tổng quan</Link></div>
    </section>
  );
}
