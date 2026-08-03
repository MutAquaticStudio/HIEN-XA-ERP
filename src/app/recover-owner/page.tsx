import Link from "next/link";
import { AlertTriangle, KeyRound, ShieldCheck } from "lucide-react";
import { getCurrentIdentityUser } from "@/server/identity/auth-context";
import { recoverOwnerAction } from "@/app/auth-actions";

export const dynamic = "force-dynamic";

export default async function RecoverOwnerPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  if (await getCurrentIdentityUser()) {
    return (
      <main className="auth-page">
        <section className="auth-panel auth-state-panel">
          <ShieldCheck aria-hidden="true" />
          <h1>Đã đăng nhập</h1>
          <p>Bạn đang đăng nhập và không cần khôi phục trên màn hình này.</p>
          <Link className="button" href="/">Quay về hệ thống</Link>
        </section>
      </main>
    );
  }

  const { error, message } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="recover-owner-title">
        <div className="auth-brand">
          <div className="brand-mark">HX</div>
          <div>
            <p className="auth-brand-name">VLXD Hien Xa</p>
            <p className="auth-brand-note">Khôi phục chủ cửa hàng</p>
          </div>
        </div>

        <div className="auth-heading">
          <KeyRound aria-hidden="true" />
          <div>
            <h1 id="recover-owner-title">Khôi phục tài khoản Chủ cửa hàng</h1>
            <p>Dùng khóa khôi phục để đặt lại tên đăng nhập và mật khẩu owner.</p>
          </div>
        </div>

        {error ? <div className="feedback feedback-error" role="alert">{error}</div> : null}
        {message ? <div className="feedback feedback-success" role="status">{message}</div> : null}

        <form action={recoverOwnerAction} className="auth-form">
          <label className="field">
            <span>Khóa khôi phục</span>
            <input name="token" type="password" minLength={16} maxLength={256} required />
            <small>Nhập khóa được cấp trong biến môi trường ERP_OWNER_RECOVERY_TOKEN.</small>
          </label>
          <label className="field">
            <span>Tên đăng nhập owner mới (email hoặc username)</span>
            <input name="identifier" autoComplete="off" minLength={3} maxLength={254} required />
          </label>
          <label className="field">
            <span>Mật khẩu mới</span>
            <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
            <small>Tối thiểu 12 ký tự, có cả chữ và số.</small>
          </label>
          <label className="field">
            <span>Xác nhận mật khẩu mới</span>
            <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
          </label>
          <button className="button button-primary auth-submit" type="submit">
            <AlertTriangle aria-hidden="true" />
            Khôi phục tài khoản
          </button>
        </form>

        <p className="auth-heading p">
          <Link href="/login">Quay về đăng nhập</Link>
        </p>
      </section>
    </main>
  );
}
