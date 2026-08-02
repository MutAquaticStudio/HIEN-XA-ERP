import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, LogIn, ShieldCheck, UserRound } from "lucide-react";
import { loginAction } from "@/app/auth-actions";
import { getCurrentIdentityUser } from "@/server/identity/auth-context";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  if (await getCurrentIdentityUser()) {
    redirect("/");
  }
  const { error, message } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="auth-brand">
          <div className="brand-mark">HX</div>
          <div>
            <p className="auth-brand-name">VLXD Hien Xa</p>
            <p className="auth-brand-note">ERP vận hành</p>
          </div>
        </div>

        <div className="auth-heading">
          <ShieldCheck aria-hidden="true" />
          <div>
            <h1 id="login-title">Đăng nhập hệ thống</h1>
            <p>Chỉ tài khoản do quản trị viên cấp mới có thể truy cập.</p>
          </div>
        </div>

        {error ? <div className="feedback feedback-error" role="alert">{error}</div> : null}
        {message ? <div className="feedback feedback-success" role="status">{message}</div> : null}

        <form action={loginAction} className="auth-form">
          <label className="field">
            <span>Tên đăng nhập hoặc email</span>
            <input name="identifier" autoComplete="username" minLength={3} maxLength={254} required />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <input name="password" type="password" autoComplete="current-password" maxLength={128} required />
          </label>
          <button className="button button-primary auth-submit" type="submit">
            <LogIn aria-hidden="true" />
            Đăng nhập
          </button>
          <Link className="button" href="/recover-owner">Khôi phục tài khoản chủ</Link>
        </form>

        <nav className="auth-portal-options" aria-label="Chọn cổng đăng nhập theo vai trò">
          <p>Bạn là khách hàng hoặc nhà cung cấp?</p>
          <div className="auth-portal-option-grid">
            <Link className="auth-portal-option" href="/khach-hang/dang-nhap">
              <UserRound aria-hidden="true" />
              <span><strong>Khách hàng</strong><small>Xem đơn hàng, công nợ và nhắn tin với cửa hàng.</small></span>
              <b>Đăng nhập</b>
            </Link>
            <Link className="auth-portal-option" href="/nha-cung-cap/dang-nhap">
              <Building2 aria-hidden="true" />
              <span><strong>Nhà cung cấp</strong><small>Nhận và trả lời trao đổi từ cửa hàng.</small></span>
              <b>Đăng nhập</b>
            </Link>
          </div>
        </nav>
      </section>
    </main>
  );
}
