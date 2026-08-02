"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Application boundary error", error); }, [error]);
  return <main className="system-state-page"><section className="system-state-card" aria-labelledby="error-title"><span className="system-state-code">Không tải được nội dung</span><h1 id="error-title">Hệ thống đang gặp gián đoạn</h1><p>Thông tin của cô/chú vẫn được giữ an toàn. Hãy thử tải lại hoặc quay về trang chính.</p>{error.digest ? <p className="system-reference">Mã đối chiếu: {error.digest}</p> : null}<div className="system-state-actions"><button className="button button-primary" onClick={reset} type="button">Thử lại</button><Link className="button" href="/">Về trang chính</Link></div><small>Nếu lỗi tiếp tục, vui lòng liên hệ cửa hàng và cung cấp mã đối chiếu ở trên.</small></section></main>;
}
