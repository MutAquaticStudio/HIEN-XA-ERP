import Link from "next/link";
import { redirect } from "next/navigation";
import { LogIn, WalletCards } from "lucide-react";
import { loginAction } from "@/app/auth-actions";
import { getCurrentIdentityUser } from "@/server/identity/auth-context";

export const dynamic = "force-dynamic";

export default async function CustomerLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const user = await getCurrentIdentityUser();
  if (user) {
    redirect(user.role === "customer" ? "/khach-hang" : "/");
  }
  const { error, returnTo } = await searchParams;
  const safeReturnTo = returnTo === "/dat-hang" ? "/dat-hang" : "/khach-hang";

  return (
    <main className="auth-page customer-login-page">
      <section className="auth-panel customer-login-panel" aria-labelledby="customer-login-title">
        <div className="auth-brand">
          <div className="brand-mark">HX</div>
          <div>
            <p className="auth-brand-name">VLXD Hiền Xa</p>
            <p className="auth-brand-note">Cổng thông tin khách hàng</p>
          </div>
        </div>
        <div className="auth-heading">
          <WalletCards aria-hidden="true" />
          <div>
            <h1 id="customer-login-title">Xem đơn hàng và công nợ</h1>
            <p>Đăng nhập bằng tài khoản cửa hàng đã cấp. Mỗi tài khoản chỉ xem được thông tin của chính mình.</p>
          </div>
        </div>
        {error ? <div className="feedback feedback-error" role="alert">{error}</div> : null}
        <form action={loginAction} className="auth-form">
          <input type="hidden" name="returnTo" value={safeReturnTo} />
          <label className="field">
            <span>Tên đăng nhập</span>
            <input name="identifier" autoComplete="username" minLength={3} maxLength={254} required />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <input name="password" type="password" autoComplete="current-password" maxLength={128} required />
          </label>
          <button className="button button-primary auth-submit" type="submit">
            <LogIn aria-hidden="true" />
            Đăng nhập cổng khách hàng
          </button>
        </form>
        <p className="customer-login-help">Chưa có tài khoản hoặc quên mật khẩu? Liên hệ cửa hàng để được cấp lại.</p>
        <Link className="customer-login-link" href="/dat-hang">Xem giá tham khảo và gửi yêu cầu đặt hàng</Link>
      </section>
    </main>
  );
}
