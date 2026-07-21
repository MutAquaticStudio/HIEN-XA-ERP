import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appActions = readFileSync(join(process.cwd(), "src", "app", "actions.ts"), "utf8");
const operationsApp = readFileSync(join(process.cwd(), "src", "components", "operations-app.tsx"), "utf8");
const loginPage = readFileSync(join(process.cwd(), "src", "app", "login", "page.tsx"), "utf8");
const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "202607180002_identity_invitation_admin.sql"), "utf8");
const managedWorkerMigration = readFileSync(join(process.cwd(), "supabase", "migrations", "202607180003_managed_worker_accounts.sql"), "utf8");
const adminActions = readFileSync(join(process.cwd(), "src", "app", "admin", "actions.ts"), "utf8");

describe("identity integration boundaries", () => {
  it("derives every ERP mutation actor from the signed server session", () => {
    expect(appActions).toContain("requireOperationsActor");
    expect(appActions).toContain("projectOperationsState");
    expect(appActions).toContain("projectOperationsSnapshot");
    expect(appActions).not.toContain("actorRoleSchema");
    expect(operationsApp).not.toContain('formData.set("actorRole"');
    expect(operationsApp).not.toMatch(/actorRole:\s*activeActorRole/);
  });

  it("offers login only and no public registration call to action", () => {
    expect(loginPage).toContain("Đăng nhập hệ thống");
    expect(loginPage).toContain("Chỉ tài khoản do quản trị viên cấp");
    expect(loginPage).toContain("Tên đăng nhập hoặc email");
    expect(loginPage).not.toContain("Đăng ký");
    expect(loginPage).not.toContain("/signup");
  });

  it("allows admins to create and reset worker accounts without email onboarding", () => {
    expect(adminActions).toContain("createManagedWorkerAction");
    expect(adminActions).toContain("resetUserPasswordAction");
    expect(managedWorkerMigration).toContain("app_users_username_unique_idx");
    expect(managedWorkerMigration).toContain("managed_by_admin");
  });

  it("keeps production invitation tokens hashed and identity audit immutable", () => {
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("trg_identity_audit_logs_append_only");
    expect(migration).toContain("session_version integer not null default 1");
    expect(migration).toContain("app_users_admin_select");
  });
});
