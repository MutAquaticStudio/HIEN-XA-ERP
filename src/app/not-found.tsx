import Link from "next/link";

export default function NotFound() {
  return <main className="system-state-page"><section className="system-state-card" aria-labelledby="not-found-title"><span className="system-state-code">Không tìm thấy trang</span><h1 id="not-found-title">Đường dẫn này không còn sử dụng</h1><p>Trang có thể đã được chuyển hoặc tài khoản của cô/chú không có quyền xem.</p><div className="system-state-actions"><Link className="button button-primary" href="/">Về trang chính</Link><Link className="button" href="/login">Đăng nhập lại</Link></div></section></main>;
}
