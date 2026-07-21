import Link from "next/link";
import { ArrowLeft, Clock3, KeyRound, LogOut, MailPlus, ShieldCheck, UserCheck, UserPlus, UserRoundCog, UserX } from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import { createManagedWorkerAction, inviteUserAction, resetUserPasswordAction, updateUserAccessAction } from "@/app/admin/actions";
import { CopyInviteLink } from "@/components/copy-invite-link";
import { RoleModuleFields } from "@/components/role-module-fields";
import { visibleModulesForRole, operationsActorRoleOptions } from "@/modules/operations/identity";
import type { UserRole } from "@/modules/operations/types";
import { requirePageIdentityAdmin } from "@/server/identity/auth-context";
import { identityService } from "@/server/identity/runtime";
import type { IdentityUserStatus, SafeIdentityUser } from "@/server/identity/types";

export const dynamic = "force-dynamic";

const statusLabels: Record<IdentityUserStatus, string> = {
  invited: "Đang chờ nhận lời mời",
  active: "Đang hoạt động",
  disabled: "Đã khóa"
};

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string; error?: string; invite?: string }>;
}) {
  const actor = await requirePageIdentityAdmin();
  const [snapshot, query] = await Promise.all([
    identityService.getAdminSnapshot(actor),
    searchParams
  ]);
  const roleIds = operationsActorRoleOptions.map((option) => option.id);
  const assignableRoles = actor.role === "owner"
    ? roleIds
    : roleIds.filter((role) => role !== "owner" && role !== "administrator");
  const counts = snapshot.users.reduce((result, user) => {
    result[user.status] += 1;
    return result;
  }, { invited: 0, active: 0, disabled: 0 });

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand">
          <div className="brand-mark">HX</div>
          <div>
            <h1 className="brand-title">VLXD Hien Xa</h1>
            <p className="brand-subtitle">Quản trị hệ thống</p>
          </div>
        </div>
        <nav className="nav-list">
          <Link className="nav-item" href="/">
            <ArrowLeft aria-hidden="true" />
            <span>Về hệ thống ERP</span>
          </Link>
          <span className="nav-item nav-item-active">
            <ShieldCheck aria-hidden="true" />
            <span>Người dùng và quyền</span>
          </span>
        </nav>
        <div className="sidebar-account">
          <div className="account-summary">
            <span className="account-name">{actor.displayName}</span>
            <span className="account-email">{actor.email}</span>
          </div>
          <form action={logoutAction}>
            <button className="nav-item nav-button account-action" type="submit">
              <LogOut aria-hidden="true" />
              <span>Đăng xuất</span>
            </button>
          </form>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <h2>Người dùng và phân quyền</h2>
            <p>Mời người dùng, giới hạn module và khóa phiên truy cập từ một nơi.</p>
          </div>
          <span className="revision-label">Phiên bản quyền #{snapshot.revision}</span>
        </header>

        {query.error ? <div className="feedback feedback-error" role="alert">{query.error}</div> : null}
        {query.message ? <div className="feedback feedback-success" role="status">{query.message}</div> : null}
        {query.invite ? (
          <section className="invite-result" aria-labelledby="invite-result-title">
            <div>
              <h3 id="invite-result-title">Liên kết lời mời</h3>
              <p>Gửi riêng liên kết này cho đúng người nhận. Liên kết hết hạn sau 72 giờ và chỉ dùng một lần.</p>
            </div>
            <CopyInviteLink value={query.invite} />
          </section>
        ) : null}

        <section className="admin-metrics" aria-label="Tổng hợp tài khoản">
          <AdminMetric icon={UserCheck} label="Đang hoạt động" value={counts.active} />
          <AdminMetric icon={Clock3} label="Chờ nhận lời mời" value={counts.invited} />
          <AdminMetric icon={UserX} label="Đã khóa" value={counts.disabled} />
        </section>

        <section className="admin-section managed-worker-section">
          <div className="admin-section-heading">
            <UserPlus aria-hidden="true" />
            <div>
              <h3>Tạo nhanh tài khoản Thợ</h3>
              <p>Admin đặt sẵn tên đăng nhập và mật khẩu. Thợ không cần email, không phải nhận lời mời hoặc tự đăng ký.</p>
            </div>
          </div>
          <form action={createManagedWorkerAction} className="admin-form">
            <div className="managed-worker-grid">
              <label className="field">
                <span>Họ và tên Thợ</span>
                <input name="displayName" autoComplete="off" minLength={2} maxLength={100} required />
              </label>
              <label className="field">
                <span>Tên đăng nhập ngắn</span>
                <input name="username" autoComplete="off" minLength={3} maxLength={30} placeholder="Ví dụ: tho01" required />
              </label>
              <label className="field">
                <span>Mật khẩu</span>
                <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
              </label>
              <label className="field">
                <span>Nhập lại mật khẩu</span>
                <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
              </label>
            </div>
            <div className="managed-worker-access">
              <ShieldCheck aria-hidden="true" />
              <span>Vai trò: <strong>Thợ</strong></span>
              <span>Module: <strong>Tổng quan, Mua hàng, Giao hàng, Nhân công</strong></span>
            </div>
            <button className="button button-primary admin-primary-action" type="submit">
              <UserPlus aria-hidden="true" />
              Tạo tài khoản và kích hoạt ngay
            </button>
          </form>
        </section>

        <section className="admin-section invite-user-section">
          <div className="admin-section-heading">
            <MailPlus aria-hidden="true" />
            <div>
              <h3>Mời người dùng mới</h3>
              <p>Không có đăng ký công khai. Người dùng chỉ kích hoạt tài khoản qua liên kết được tạo tại đây.</p>
            </div>
          </div>
          <form action={inviteUserAction} className="admin-form">
            <label className="field admin-email-field">
              <span>Email người nhận</span>
              <input name="email" type="email" autoComplete="off" maxLength={254} required />
            </label>
            <RoleModuleFields
              initialRole="sales"
              initialModuleIds={visibleModulesForRole("sales")}
              allowedRoles={assignableRoles}
            />
            <button className="button button-primary admin-primary-action" type="submit">
              <MailPlus aria-hidden="true" />
              Tạo lời mời
            </button>
          </form>
        </section>

        <section className="admin-section">
          <div className="admin-section-heading">
            <UserRoundCog aria-hidden="true" />
            <div>
              <h3>Danh sách tài khoản</h3>
              <p>Thay đổi vai trò hoặc module sẽ vô hiệu hóa ngay phiên đăng nhập cũ của người dùng.</p>
            </div>
          </div>
          <div className="user-access-list">
            {snapshot.users.map((user) => (
              <UserAccessItem
                key={user.id}
                actor={actor}
                user={user}
                assignableRoles={assignableRoles}
              />
            ))}
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-heading">
            <ShieldCheck aria-hidden="true" />
            <div>
              <h3>Nhật ký định danh gần nhất</h3>
              <p>Lời mời, đăng nhập và thay đổi quyền đều được ghi lại.</p>
            </div>
          </div>
          <div className="identity-audit-list">
            {snapshot.auditEvents.slice(0, 20).map((event) => (
              <div className="identity-audit-row" key={event.id}>
                <time>{formatAdminDate(event.occurredAt)}</time>
                <span>{event.summary}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function UserAccessItem({
  actor,
  user,
  assignableRoles
}: {
  actor: SafeIdentityUser;
  user: SafeIdentityUser;
  assignableRoles: UserRole[];
}) {
  const isSelf = actor.id === user.id;
  const protectedFromAdmin = actor.role === "administrator" && ["owner", "administrator"].includes(user.role);
  const canEdit = !isSelf && !protectedFromAdmin;
  const canReissueInvitation = canEdit && !user.acceptedAt && user.status !== "active";

  return (
    <article className="user-access-item">
      <div className="user-access-header">
        <div>
          <h4>{user.displayName}</h4>
          <p>{user.username ? `Tên đăng nhập: ${user.username}` : user.email}</p>
        </div>
        <span className={`status identity-status identity-status-${user.status}`}>{statusLabels[user.status]}</span>
      </div>

      {canEdit ? (
        <form action={updateUserAccessAction} className="user-access-form">
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="email" value={user.email} />
          <RoleModuleFields
            initialRole={user.role}
            initialModuleIds={user.moduleIds}
            allowedRoles={assignableRoles}
            compact
          />
          <label className="field status-field">
            <span>Trạng thái tài khoản</span>
            <select name="status" defaultValue={user.status}>
              {user.status === "invited" ? <option value="invited">Đang chờ nhận lời mời</option> : null}
              {user.status !== "invited" ? <option value="active">Đang hoạt động</option> : null}
              <option value="disabled">Đã khóa</option>
            </select>
          </label>
          <div className="user-access-actions">
            <button className="button button-primary" type="submit">
              <ShieldCheck aria-hidden="true" />
              Lưu phân quyền
            </button>
            {canReissueInvitation ? (
              <button className="button" type="submit" formAction={inviteUserAction}>
                <MailPlus aria-hidden="true" />
                Tạo lại lời mời
              </button>
            ) : null}
          </div>
          {user.status !== "invited" ? (
            <div className="password-reset-panel">
              <div className="password-reset-heading">
                <KeyRound aria-hidden="true" />
                <div>
                  <strong>Đặt lại mật khẩu</strong>
                  <span>Mật khẩu mới có hiệu lực ngay và đăng xuất mọi phiên cũ của tài khoản này.</span>
                </div>
              </div>
              <div className="password-reset-grid">
                <label className="field">
                  <span>Mật khẩu mới</span>
                  <input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} />
                </label>
                <label className="field">
                  <span>Nhập lại mật khẩu mới</span>
                  <input name="confirmNewPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} />
                </label>
                <button className="button" type="submit" formAction={resetUserPasswordAction}>
                  <KeyRound aria-hidden="true" />
                  Đặt lại mật khẩu
                </button>
              </div>
            </div>
          ) : null}
        </form>
      ) : (
        <div className="protected-account-note">
          {isSelf
            ? "Đây là tài khoản đang đăng nhập. Dùng một tài khoản Owner khác để thay đổi quyền tài khoản này."
            : "Quản trị hệ thống không được sửa tài khoản Owner hoặc quản trị viên khác."}
        </div>
      )}
    </article>
  );
}

function AdminMetric({ icon: Icon, label, value }: { icon: typeof UserCheck; label: string; value: number }) {
  return (
    <div className="admin-metric">
      <Icon aria-hidden="true" />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function formatAdminDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(value));
}
