import { LogIn, MessageCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/auth-actions";
import { getCurrentIdentityUser } from "@/server/identity/auth-context";

export const dynamic = "force-dynamic";

export default async function SupplierLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentIdentityUser();
  if (user) redirect(user.role === "supplier" ? "/nha-cung-cap" : "/");
  const { error } = await searchParams;
  return <main className="auth-page customer-login-page"><section className="auth-panel customer-login-panel" aria-labelledby="supplier-login-title"><div className="auth-brand"><div className="brand-mark">HX</div><div><p className="auth-brand-name">VLXD Hien Xa</p><p className="auth-brand-note">Cổng đối tác nhà cung cấp</p></div></div><div className="auth-heading"><MessageCircle aria-hidden="true" /><div><h1 id="supplier-login-title">Trao đổi với cửa hàng</h1><p>Đăng nhập bằng tài khoản do cửa hàng cấp để nhận và trả lời tin nhắn.</p></div></div>{error ? <div className="feedback feedback-error" role="alert">{error}</div> : null}<form action={loginAction} className="auth-form"><input type="hidden" name="returnTo" value="/nha-cung-cap" /><label className="field"><span>Tên đăng nhập</span><input name="identifier" autoComplete="username" minLength={3} maxLength={254} required /></label><label className="field"><span>Mật khẩu</span><input name="password" type="password" autoComplete="current-password" maxLength={128} required /></label><button className="button button-primary auth-submit" type="submit"><LogIn aria-hidden="true" />Đăng nhập cổng đối tác</button></form><p className="customer-login-help">Chưa có tài khoản hoặc quên mật khẩu? Liên hệ cửa hàng để được cấp lại.</p></section></main>;
}
