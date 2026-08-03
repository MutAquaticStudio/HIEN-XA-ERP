import { AlertTriangle, CheckCircle2, KeyRound } from "lucide-react";
import { acceptInvitationAction } from "@/app/auth-actions";
import { operationsErpRegistry } from "@/modules/operations/erp-registry";
import { operationsActorRoleOptions } from "@/modules/operations/identity";
import { identityService } from "@/server/identity/runtime";

export const dynamic = "force-dynamic";

export default async function InvitationPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const [{ error }, invitation] = await Promise.all([
    searchParams,
    identityService.getInvitationPreview(token)
  ]);

  if (!invitation) {
    return (
      <main className="auth-page">
        <section className="auth-panel auth-state-panel">
          <AlertTriangle aria-hidden="true" />
          <h1>Lời mời không còn hiệu lực</h1>
          <p>Liên kết có thể đã được dùng, bị hủy hoặc đã hết hạn. Hãy liên hệ quản trị viên để tạo lời mời mới.</p>
          <a className="button" href="/login">Về trang đăng nhập</a>
        </section>
      </main>
    );
  }

  const roleLabel = operationsActorRoleOptions.find((option) => option.id === invitation.role)?.label ?? invitation.role;
  const moduleLabels = operationsErpRegistry.navigation
    .filter((module) => invitation.moduleIds.includes(module.id))
    .map((module) => module.label);

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="invite-title">
        <div className="auth-brand">
          <div className="brand-mark">HX</div>
          <div>
            <p className="auth-brand-name">VLXD Hiền Xa</p>
            <p className="auth-brand-note">Kích hoạt tài khoản</p>
          </div>
        </div>

        <div className="auth-heading">
          <KeyRound aria-hidden="true" />
          <div>
            <h1 id="invite-title">Nhận lời mời</h1>
            <p>Thiết lập thông tin đăng nhập cho tài khoản của bạn.</p>
          </div>
        </div>

        <div className="invitation-summary">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <strong>{invitation.email}</strong>
            <span>{roleLabel} · {moduleLabels.join(", ")}</span>
          </div>
        </div>

        {error ? <div className="feedback feedback-error" role="alert">{error}</div> : null}

        <form action={acceptInvitationAction} className="auth-form">
          <input name="token" type="hidden" value={token} />
          <label className="field">
            <span>Họ và tên</span>
            <input name="displayName" autoComplete="name" minLength={2} maxLength={100} required autoFocus />
          </label>
          <label className="field">
            <span>Mật khẩu mới</span>
            <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
            <small>Tối thiểu 10 ký tự, có cả chữ và số.</small>
          </label>
          <label className="field">
            <span>Nhập lại mật khẩu</span>
            <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
          </label>
          <button className="button button-primary auth-submit" type="submit">
            <CheckCircle2 aria-hidden="true" />
            Kích hoạt và đăng nhập
          </button>
        </form>
      </section>
    </main>
  );
}
