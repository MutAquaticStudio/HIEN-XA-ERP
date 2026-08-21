"use client";
export default function CatalogError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="erp-v2-route-error" role="alert"><h1>Không tải được danh mục</h1><p>Kiểm tra kết nối rồi thử lại. Chi tiết kỹ thuật không hiển thị trong giao diện người dùng.</p><button className="erp-v2-button primary" type="button" onClick={reset}>Thử lại</button></section>;
}
