"use client";
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="erp-v2-main"><div className="erp-v2-panel erp-v2-empty" role="alert"><h1>Không tải được tổng quan</h1><p>Kiểm tra kết nối rồi thử lại.</p><button className="erp-v2-button primary" type="button" onClick={reset}>Thử lại</button></div></main>;
}
