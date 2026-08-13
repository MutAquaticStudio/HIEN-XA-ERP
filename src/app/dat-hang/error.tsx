"use client";

import Link from "next/link";

export default function CustomerOrderError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="system-state-page"><section className="system-state-card"><span className="system-state-code">Danh mục tạm gián đoạn</span><h1>Chưa tải được giá vật liệu</h1><p>Cô/chú có thể thử lại. Nếu danh mục chưa có dữ liệu, cửa hàng sẽ hỗ trợ báo giá trực tiếp.</p>{error.digest ? <p className="system-reference">Mã đối chiếu: {error.digest}</p> : null}<div className="system-state-actions"><button className="button button-primary" onClick={reset} type="button">Thử lại</button><Link className="button" href="/khach-hang/dang-nhap">Đăng nhập cổng khách</Link></div></section></main>;
}
