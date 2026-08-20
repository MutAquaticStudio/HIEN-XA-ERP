"use client";
export default function CatalogError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="erp-v2-main"><div className="erp-v2-panel erp-v2-empty" role="alert"><h1>Không tải được danh mục</h1><p>Kiểm tra kết nối rồi thử lại. Chi tiết kỹ thuật không hiển thị trong giao diện người dùng.</p><button className="erp-v2-button primary" type="button" onClick={reset}>Thử lại</button></div></main>;
}
