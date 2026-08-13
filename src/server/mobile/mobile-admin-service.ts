import { z } from "zod";
import { operationsErpRegistry, type OperationsModuleId } from "@/modules/operations/erp-registry";
import { canManageUsers } from "@/server/identity/identity-service";
import { identityService } from "@/server/identity/runtime";
import type { SafeIdentityUser } from "@/server/identity/types";
import { PublicApiError } from "@/server/shared/public-api-error";

const roleSchema = z.enum(["owner", "administrator", "accountant", "sales", "warehouse", "dispatcher", "driver", "worker", "supervisor", "viewer", "customer", "supplier"]);
const mobileInviteRoleSchema = z.enum(["administrator", "accountant", "sales", "warehouse", "dispatcher", "supervisor", "viewer"]);
const moduleSchema = z.enum(operationsErpRegistry.navigation.map((module) => module.id) as [OperationsModuleId, ...OperationsModuleId[]]);
const passwordSchema = z.string().min(12).max(128);
const adminActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/), expectedRevision: z.number().int().nonnegative(), email: z.string().trim().email().max(254), role: mobileInviteRoleSchema, moduleIds: z.array(moduleSchema).min(1), reauthPassword: passwordSchema }).strict(),
  z.object({ action: z.literal("updateAccess"), idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/), userId: z.string().uuid(), expectedSessionVersion: z.number().int().positive(), role: roleSchema, status: z.enum(["invited", "active", "disabled"]), moduleIds: z.array(moduleSchema).min(1), reauthPassword: passwordSchema }).strict(),
  z.object({ action: z.literal("resetPassword"), idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/), userId: z.string().uuid(), expectedSessionVersion: z.number().int().positive(), password: passwordSchema, reauthPassword: passwordSchema }).strict()
]);

export async function getMobileAdminOverview(user: SafeIdentityUser) {
  requireAdmin(user);
  const snapshot = await identityService.getAdminSnapshot(user);
  return { revision: snapshot.revision, users: snapshot.users, auditEvents: snapshot.auditEvents.slice().sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 80) };
}

export async function runMobileAdminAction(user: SafeIdentityUser, input: unknown) {
  requireAdmin(user);
  const value = adminActionSchema.parse(input);
  const identity = await identityService.getAdminSnapshot(user);
  if (value.action === "invite") {
    await verifyAdminReauthentication(user, value.reauthPassword);
    const invitation = await identityService.inviteMobileUser(user, {
      email: value.email,
      role: value.role,
      moduleIds: value.moduleIds,
      idempotencyKey: value.idempotencyKey,
      expectedRevision: value.expectedRevision
    });
    return {
      summary: invitation.replayed
        ? `Lời mời cho ${invitation.user.email} đã được ghi nhận trước đó.`
        : `Đã tạo lời mời cho ${invitation.user.email}. Hãy gửi liên kết lời mời qua kênh được cửa hàng phê duyệt.`,
      user: invitation.user,
      expiresAt: invitation.expiresAt,
      replayed: invitation.replayed
    };
  }
  const target = identity.users.find((candidate) => candidate.id === value.userId);
  if (!target) throw new PublicApiError(403, "Không tìm thấy tài khoản cần cập nhật.");
  if (target.sessionVersion !== value.expectedSessionVersion) throw new PublicApiError(409, "Tài khoản đã được thay đổi bởi thao tác khác. Vui lòng tải lại trước khi tiếp tục.");
  await verifyAdminReauthentication(user, value.reauthPassword);
  if (value.action === "updateAccess") {
    const updated = await identityService.updateUserAccess(user, { userId: value.userId, role: value.role, status: value.status, moduleIds: value.moduleIds, idempotencyKey: value.idempotencyKey, expectedSessionVersion: value.expectedSessionVersion });
    return { summary: `Đã cập nhật quyền cho ${updated.username || updated.email}.`, user: updated };
  }
  const updated = await identityService.resetUserPassword(user, value.userId, value.password, { idempotencyKey: value.idempotencyKey, expectedSessionVersion: value.expectedSessionVersion });
  return { summary: `Đã đặt lại mật khẩu cho ${updated.username || updated.email}.`, user: updated };
}

function requireAdmin(user: SafeIdentityUser) { if (!canManageUsers(user)) throw new PublicApiError(403, "Chỉ Chủ cửa hàng hoặc Quản trị viên được quản lý tài khoản trên điện thoại."); }
async function verifyAdminReauthentication(user: SafeIdentityUser, password: string) {
  const authenticated = await identityService.authenticate(user.username || user.email, password);
  if (!authenticated || authenticated.id !== user.id) throw new PublicApiError(403, "Không thể xác nhận lại danh tính quản trị viên.");
}
