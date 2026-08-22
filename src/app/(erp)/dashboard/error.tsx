"use client";
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="erp-v2-route-error" role="alert"><h1>Không tải được tổng quan</h1><p>Kiểm tra kết nối rồi thử lại.</p><button className="erp-v2-button primary" type="button" onClick={reset}>Thử lại</button></section>;
}
