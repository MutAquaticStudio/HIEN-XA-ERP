import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { OperationsModuleId } from "@/modules/operations/erp-registry";
import { visibleModulesForRole } from "@/modules/operations/identity";
import type { UserRole } from "@/modules/operations/types";
import { createOpaqueToken, hashOpaqueToken, verifyPassword, hashPassword } from "./crypto";
import { IdentityPublicError } from "./errors";
import { FileIdentityStore } from "./file-identity-store";
import type {
  IdentityAuditEvent,
  IdentitySnapshot,
  IdentityUser,
  InvitationPreview,
  SafeIdentityUser
} from "./types";

const invitationLifetimeMs = 72 * 60 * 60 * 1000;
const loginLockDurationMs = 15 * 60 * 1000;
const failedLoginLimit = 5;
const maximumIdentifierLength = 254;
const maximumPasswordLength = 128;
const maximumDisplayNameLength = 100;
const maximumInvitationTokenLength = 256;
const minimumRecoveryTokenLength = 16;
const maximumRecoveryTokenLength = 256;
const invalidCredentialsMessage = "Tên đăng nhập/email hoặc mật khẩu không đúng.";
const dummyPasswordHash = hashPassword(createOpaqueToken());

export class IdentityService {
  constructor(
    private readonly store: FileIdentityStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getUserById(userId: string) {
    const data = await this.store.getSnapshot();
    const user = data.users.find((candidate) => candidate.id === userId);
    return user ? toSafeUser(user) : undefined;
  }

  async getAdminSnapshot(actor: SafeIdentityUser): Promise<IdentitySnapshot> {
    assertCanManageUsers(actor);
    const data = await this.store.getSnapshot();
    return {
      revision: data.revision,
      users: data.users.map(toSafeUser),
      auditEvents: structuredClone(data.auditEvents)
    };
  }

  async authenticate(identifier: string, password: string) {
    const normalizedIdentifier = normalizeLoginIdentifier(identifier);
    const boundedPassword = password.slice(0, maximumPasswordLength);
    const snapshot = await this.store.getSnapshot();
    const candidate = snapshot.users.find((user) =>
      user.normalizedEmail === normalizedIdentifier
      || user.normalizedUsername === normalizedIdentifier
    );

    if (
      normalizedIdentifier.length < 3
      || normalizedIdentifier.length > maximumIdentifierLength
      || password.length < 1
      || password.length > maximumPasswordLength
      || !candidate
      || candidate.status === "invited"
      || !candidate.passwordHash
    ) {
      verifyPassword(boundedPassword, dummyPasswordHash);
      throw new IdentityPublicError(invalidCredentialsMessage);
    }

    const result = await this.store.transaction((data) => {
      const user = data.users.find((current) => current.id === candidate.id);
      const now = this.now();
      const nowIso = now.toISOString();
      const passwordMatches = verifyPassword(boundedPassword, user?.passwordHash ?? dummyPasswordHash);
      const isCurrentlyLocked = Boolean(
        user?.lockedUntil && new Date(user.lockedUntil).getTime() > now.getTime()
      );

      if (user?.lockedUntil && !isCurrentlyLocked) {
        user.lockedUntil = undefined;
      }

      if (
        !user
        || user.status !== "active"
        || !user.passwordHash
        || isCurrentlyLocked
        || !passwordMatches
      ) {
        if (!user) {
          return { ok: false as const };
        }
        if (user.status === "active" && !isCurrentlyLocked && !passwordMatches) {
          user.failedLoginAttempts += 1;
          if (user.failedLoginAttempts >= failedLoginLimit) {
            user.lockedUntil = new Date(now.getTime() + loginLockDurationMs).toISOString();
            user.failedLoginAttempts = 0;
          }
        }
        user.updatedAt = nowIso;
        pushAudit(data.auditEvents, {
          action: "login_failed",
          targetUserId: user.id,
          targetEmail: user.email || user.username,
          occurredAt: nowIso,
          summary: "Từ chối đăng nhập do thông tin xác thực hoặc trạng thái tài khoản không hợp lệ."
        });
        return { ok: false as const };
      }

      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
      user.lastLoginAt = nowIso;
      user.updatedAt = nowIso;
      pushAudit(data.auditEvents, {
        action: "login_succeeded",
        actorUserId: user.id,
        targetUserId: user.id,
        targetEmail: user.email || user.username,
        occurredAt: nowIso,
        summary: "Đăng nhập thành công."
      });
      return { ok: true as const, user: toSafeUser(user) };
    });

    if (!result.ok) {
      throw new IdentityPublicError(invalidCredentialsMessage);
    }
    return result.user;
  }

  async createManagedWorker(
    actor: SafeIdentityUser,
    input: { username: string; displayName: string; password: string }
  ) {
    assertCanManageUsers(actor);
    const normalizedUsername = normalizeUsername(input.username);
    const displayName = input.displayName.trim();
    validateUsername(normalizedUsername);
    if (displayName.length < 2 || displayName.length > maximumDisplayNameLength) {
      throw new IdentityPublicError("Họ tên Thợ phải có từ 2 đến 100 ký tự.");
    }
    validatePassword(input.password);
    const nowIso = this.now().toISOString();

    return this.store.transaction((data) => {
      const existing = data.users.find((candidate) =>
        candidate.normalizedUsername === normalizedUsername
        || candidate.normalizedEmail === normalizedUsername
      );
      if (existing) {
        throw new IdentityPublicError("Tên đăng nhập này đã được sử dụng.");
      }

      const user: IdentityUser = {
        id: randomUUID(),
        email: "",
        normalizedEmail: "",
        username: normalizedUsername,
        normalizedUsername,
        displayName,
        role: "worker",
        moduleIds: normalizeModuleIds("worker"),
        status: "active",
        passwordHash: hashPassword(input.password),
        acceptedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        failedLoginAttempts: 0,
        sessionVersion: 1
      };
      data.users.push(user);
      pushAudit(data.auditEvents, {
        action: "managed_worker_created",
        actorUserId: actor.id,
        targetUserId: user.id,
        targetEmail: user.username,
        occurredAt: nowIso,
        summary: `Tạo trực tiếp tài khoản Thợ ${user.username} cho ${user.displayName}.`
      });
      return toSafeUser(user);
    });
  }

  async inviteUser(
    actor: SafeIdentityUser,
    input: { email: string; role: UserRole; moduleIds?: OperationsModuleId[] }
  ) {
    assertCanManageUsers(actor);
    assertCanAssignRole(actor, input.role);
    const normalizedEmail = normalizeEmail(input.email);
    if (!isValidEmail(normalizedEmail) || normalizedEmail.length > maximumIdentifierLength) {
      throw new IdentityPublicError("Email lời mời không hợp lệ.");
    }

    const token = createOpaqueToken();
    const now = this.now();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + invitationLifetimeMs).toISOString();
    const moduleIds = normalizeModuleIds(input.role, input.moduleIds);

    const user = await this.store.transaction((data) => {
      const existing = data.users.find((candidate) => candidate.normalizedEmail === normalizedEmail);
      if (existing && existing.status !== "invited" && !(existing.status === "disabled" && !existing.passwordHash)) {
        throw new IdentityPublicError("Email này đã có tài khoản trong hệ thống.");
      }

      const target: IdentityUser = existing ?? {
        id: randomUUID(),
        email: normalizedEmail,
        normalizedEmail,
        displayName: normalizedEmail,
        role: input.role,
        moduleIds,
        status: "invited",
        createdAt: nowIso,
        updatedAt: nowIso,
        failedLoginAttempts: 0,
        sessionVersion: 1
      };
      target.role = input.role;
      target.moduleIds = moduleIds;
      target.status = "invited";
      target.inviteTokenHash = hashOpaqueToken(token);
      target.inviteExpiresAt = expiresAt;
      target.invitedBy = actor.id;
      target.invitedAt = nowIso;
      target.updatedAt = nowIso;
      if (!existing) {
        data.users.push(target);
      }

      pushAudit(data.auditEvents, {
        action: "user_invited",
        actorUserId: actor.id,
        targetUserId: target.id,
        targetEmail: target.email,
        occurredAt: nowIso,
        summary: `Mời ${target.email} với vai trò ${target.role}.`
      });
      return toSafeUser(target);
    });

    return { user, token, expiresAt };
  }

  async getInvitationPreview(token: string): Promise<InvitationPreview | undefined> {
    if (!token || token.length < 20 || token.length > maximumInvitationTokenLength) {
      return undefined;
    }
    const tokenHash = hashOpaqueToken(token);
    const data = await this.store.getSnapshot();
    const user = data.users.find((candidate) => candidate.inviteTokenHash === tokenHash && candidate.status === "invited");
    if (!user?.inviteExpiresAt || new Date(user.inviteExpiresAt).getTime() <= this.now().getTime()) {
      return undefined;
    }
    return {
      email: user.email,
      role: user.role,
      moduleIds: [...user.moduleIds],
      expiresAt: user.inviteExpiresAt
    };
  }

  async acceptInvitation(token: string, displayName: string, password: string) {
    if (token.length < 20 || token.length > maximumInvitationTokenLength) {
      throw new IdentityPublicError("Lời mời không hợp lệ hoặc đã hết hạn.");
    }
    const tokenHash = hashOpaqueToken(token);
    const normalizedDisplayName = displayName.trim();
    if (normalizedDisplayName.length < 2 || normalizedDisplayName.length > maximumDisplayNameLength) {
      throw new IdentityPublicError("Họ tên phải có từ 2 đến 100 ký tự.");
    }
    validatePassword(password);

    const now = this.now();
    const nowIso = now.toISOString();
    return this.store.transaction((data) => {
      const user = data.users.find((candidate) => candidate.inviteTokenHash === tokenHash && candidate.status === "invited");
      if (!user?.inviteExpiresAt || new Date(user.inviteExpiresAt).getTime() <= now.getTime()) {
        throw new IdentityPublicError("Lời mời không hợp lệ hoặc đã hết hạn.");
      }

      user.displayName = normalizedDisplayName;
      user.passwordHash = hashPassword(password);
      user.status = "active";
      user.acceptedAt = nowIso;
      user.inviteTokenHash = undefined;
      user.inviteExpiresAt = undefined;
      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
      user.sessionVersion += 1;
      user.updatedAt = nowIso;
      pushAudit(data.auditEvents, {
        action: "invitation_accepted",
        actorUserId: user.id,
        targetUserId: user.id,
        targetEmail: user.email || user.username,
        occurredAt: nowIso,
        summary: `${user.email} đã nhận lời mời và kích hoạt tài khoản.`
      });
      return toSafeUser(user);
    });
  }

  async recoverOwnerCredentials(input: {
    recoveryToken: string;
    expectedRecoveryToken: string;
    identifier: string;
    password: string;
  }) {
    assertRecoveryToken(input.recoveryToken, input.expectedRecoveryToken);
    const normalizedIdentifier = normalizeLoginIdentifier(input.identifier);
    if (normalizedIdentifier.length < 3 || normalizedIdentifier.length > maximumIdentifierLength) {
      throw new IdentityPublicError("Tên Ä‘Äƒng nháº­p Ä‘áº¿n 3 Ä‘áº¿n 254 kÃ½ tá»±.");
    }
    validatePassword(input.password);

    const nowIso = this.now().toISOString();
    const candidateIsEmail = normalizedIdentifier.includes("@");
    if (candidateIsEmail) {
      if (!isValidEmail(normalizedIdentifier)) {
        throw new IdentityPublicError("Äá»‹a chá»‰ email khÃ´ng há»£p lá»‡.");
      }
    } else if (!isValidUsername(normalizedIdentifier)) {
      throw new IdentityPublicError("TÃªn Ä‘Äƒng nháº­p pháº£i cÃ³ thá»©c dáº¡ng 3-30 kÃ½ tá»±.");
    }

    return this.store.transaction((data) => {
      const owners = data.users.filter((candidate) => candidate.role === "owner" && candidate.status === "active");
      if (owners.length === 0) {
        throw new IdentityPublicError("KhÃ´ng tÃ¬m tháº¥y tÃ i khoáº£n Chá»§ cá»­a hÃ ng Ä‘ang há»£p lá»‡.");
      }
      if (owners.length > 1) {
        throw new IdentityPublicError("HÃª thá»‘ng cÃ³ nhiá»u tài khoản Owner. Vui lÃ²ng liÃªn há»‡ hÃ³m phÃ¢n quyá»n kĩ thuáº­t.");
      }

      const owner = owners[0];
      if (candidateIsEmail) {
        const emailConflict = data.users.some((candidate) =>
          candidate.id !== owner.id && candidate.normalizedEmail === normalizedIdentifier
        );
        if (emailConflict) {
          throw new IdentityPublicError("Äá»‹a chá»‰ email nÃ y Ä‘Ã£ Ä‘Æ°á»£c sá»­ dá»¥ng.");
        }
        owner.email = normalizedIdentifier;
        owner.normalizedEmail = normalizedIdentifier;
      } else {
        const usernameConflict = data.users.some((candidate) =>
          candidate.id !== owner.id && candidate.normalizedUsername === normalizedIdentifier
        );
        if (usernameConflict) {
          throw new IdentityPublicError("TÃªn Ä‘Äƒng nháº­p nÃ y Ä‘Ã£ Ä‘Æ°á»£c sá»­ dá»¥ng.");
        }
        owner.username = normalizedIdentifier;
        owner.normalizedUsername = normalizedIdentifier;
      }

      owner.passwordHash = hashPassword(input.password);
      owner.failedLoginAttempts = 0;
      owner.lockedUntil = undefined;
      owner.sessionVersion += 1;
      owner.updatedAt = nowIso;
      pushAudit(data.auditEvents, {
        action: "owner_recovered",
        actorUserId: owner.id,
        targetUserId: owner.id,
        targetEmail: owner.email || owner.username,
        occurredAt: nowIso,
        summary: `KhÃ´i phÃºc thÃ´ng tin Ä‘Äƒng nháº­p cho ${accountLabel(owner)}.`, 
      });
      return toSafeUser(owner);
    });
  }

  async updateUserAccess(
    actor: SafeIdentityUser,
    input: {
      userId: string;
      role: UserRole;
      status: "invited" | "active" | "disabled";
      moduleIds?: OperationsModuleId[];
    }
  ) {
    assertCanManageUsers(actor);
    assertCanAssignRole(actor, input.role);
    const nowIso = this.now().toISOString();

    return this.store.transaction((data) => {
      const user = data.users.find((candidate) => candidate.id === input.userId);
      if (!user) {
        throw new IdentityPublicError("Không tìm thấy tài khoản cần cập nhật.");
      }
      assertCanManageTarget(actor, user);
      if (actor.id === user.id) {
        throw new IdentityPublicError("Không thể tự thay đổi vai trò hoặc phạm vi quyền của tài khoản đang đăng nhập.");
      }
      if (user.status === "invited" && input.status === "active") {
        throw new IdentityPublicError("Tài khoản được mời phải đặt mật khẩu trước khi kích hoạt.");
      }
      if (input.status === "active" && !user.passwordHash) {
        throw new IdentityPublicError("Tài khoản chưa có mật khẩu; hãy tạo lại lời mời để người dùng kích hoạt.");
      }
      if (user.status !== "invited" && input.status === "invited") {
        throw new IdentityPublicError("Không thể chuyển tài khoản đã kích hoạt về trạng thái chờ lời mời.");
      }
      if (user.role === "owner" && (input.role !== "owner" || input.status === "disabled")) {
        const otherActiveOwners = data.users.filter((candidate) =>
          candidate.id !== user.id && candidate.role === "owner" && candidate.status === "active"
        );
        if (otherActiveOwners.length === 0) {
          throw new IdentityPublicError("Hệ thống phải còn ít nhất một Chủ cửa hàng đang hoạt động.");
        }
      }

      user.role = input.role;
      user.moduleIds = normalizeModuleIds(input.role, input.moduleIds);
      user.status = input.status;
      if (input.status === "disabled") {
        user.inviteTokenHash = undefined;
        user.inviteExpiresAt = undefined;
      }
      user.sessionVersion += 1;
      user.updatedAt = nowIso;
      pushAudit(data.auditEvents, {
        action: "user_access_updated",
        actorUserId: actor.id,
        targetUserId: user.id,
        targetEmail: user.email,
        occurredAt: nowIso,
        summary: `Cập nhật ${accountLabel(user)}: vai trò ${user.role}, trạng thái ${user.status}.`
      });
      return toSafeUser(user);
    });
  }

  async resetUserPassword(actor: SafeIdentityUser, userId: string, password: string) {
    assertCanManageUsers(actor);
    validatePassword(password);
    const nowIso = this.now().toISOString();

    return this.store.transaction((data) => {
      const user = data.users.find((candidate) => candidate.id === userId);
      if (!user) {
        throw new IdentityPublicError("Không tìm thấy tài khoản cần đặt lại mật khẩu.");
      }
      assertCanManageTarget(actor, user);
      if (actor.id === user.id) {
        throw new IdentityPublicError("Không thể đặt lại mật khẩu tài khoản đang đăng nhập tại màn hình này.");
      }
      if (user.status === "invited") {
        throw new IdentityPublicError("Tài khoản đang chờ lời mời phải tự đặt mật khẩu khi kích hoạt.");
      }

      user.passwordHash = hashPassword(password);
      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
      user.sessionVersion += 1;
      user.updatedAt = nowIso;
      pushAudit(data.auditEvents, {
        action: "user_password_reset",
        actorUserId: actor.id,
        targetUserId: user.id,
        targetEmail: user.email || user.username,
        occurredAt: nowIso,
        summary: `Đặt lại mật khẩu cho ${accountLabel(user)}.`
      });
      return toSafeUser(user);
    });
  }
}

export function canManageUsers(user: Pick<SafeIdentityUser, "role" | "status">) {
  return user.status === "active" && (user.role === "owner" || user.role === "administrator");
}

export function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("vi-VN");
}

export function normalizeUsername(username: string) {
  return username.trim().toLocaleLowerCase("vi-VN");
}

function normalizeLoginIdentifier(identifier: string) {
  return identifier.trim().toLocaleLowerCase("vi-VN");
}

function normalizeModuleIds(role: UserRole, requested?: OperationsModuleId[]) {
  const allowed = visibleModulesForRole(role);
  if (!requested || requested.length === 0) {
    return [...allowed];
  }
  const selected = new Set(requested);
  selected.add("overview");
  return allowed.filter((moduleId) => selected.has(moduleId));
}

function assertCanManageUsers(actor: SafeIdentityUser) {
  if (!canManageUsers(actor)) {
    throw new IdentityPublicError("Bạn không có quyền quản trị người dùng.");
  }
}

function assertCanAssignRole(actor: SafeIdentityUser, role: UserRole) {
  if (actor.role === "administrator" && (role === "owner" || role === "administrator")) {
    throw new IdentityPublicError("Quản trị hệ thống không được cấp vai trò Chủ cửa hàng hoặc Quản trị hệ thống.");
  }
}

function assertCanManageTarget(actor: SafeIdentityUser, target: IdentityUser) {
  if (actor.role === "administrator" && (target.role === "owner" || target.role === "administrator")) {
    throw new IdentityPublicError("Quản trị hệ thống không được sửa tài khoản Chủ cửa hàng hoặc Quản trị hệ thống.");
  }
}

function validatePassword(password: string) {
  if (password.length < 12 || password.length > maximumPasswordLength) {
    throw new IdentityPublicError("Mật khẩu phải có từ 12 đến 128 ký tự.");
  }
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
    throw new IdentityPublicError("Mật khẩu phải có cả chữ và số.");
  }
  if (/[\u0000-\u001f\u007f]/u.test(password)) {
    throw new IdentityPublicError("Mật khẩu không được chứa ký tự điều khiển.");
  }
  const compactPassword = password.toLocaleLowerCase("vi-VN").replace(/[^a-z0-9]/g, "");
  if (["password1234", "admin1234567", "matkhau123456", "123456789012"].includes(compactPassword)) {
    throw new IdentityPublicError("Mật khẩu này quá dễ đoán. Hãy dùng một mật khẩu khác.");
  }
}

function validateUsername(username: string) {
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
    throw new IdentityPublicError("Tên đăng nhập phải có 3-30 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.");
  }
}

function accountLabel(user: Pick<IdentityUser, "email" | "username">) {
  return user.username || user.email;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toSafeUser(user: IdentityUser): SafeIdentityUser {
  const { passwordHash: _passwordHash, inviteTokenHash: _inviteTokenHash, ...safe } = user;
  return structuredClone(safe) as SafeIdentityUser;
}

function pushAudit(events: IdentityAuditEvent[], event: Omit<IdentityAuditEvent, "id">) {
  events.unshift({ id: randomUUID(), ...event });
}

function isValidUsername(username: string) {
  return /^[a-z0-9][a-z0-9._-]{2,29}$/u.test(username);
}

function assertRecoveryToken(token: string, expectedToken: string) {
  if (!expectedToken) {
    throw new IdentityPublicError("ChÆ°a cáº¥u hÃ¬nh khÃ³a khÃ´i phá»¥c cho tÃ i khoáº£n Chá»§ cá»­a hÃ ng.");
  }

  const normalizedToken = token.trim();
  if (normalizedToken.length < minimumRecoveryTokenLength || normalizedToken.length > maximumRecoveryTokenLength) {
    throw new IdentityPublicError("KhÃ³a khÃ´i phá»¥c khÃ´ng há»£p lá»‡.");
  }

  const expected = createHash("sha256").update(expectedToken.trim()).digest();
  const candidate = createHash("sha256").update(normalizedToken).digest();
  if (expected.length !== candidate.length || !timingSafeEqual(expected, candidate)) {
    throw new IdentityPublicError("KhÃ³a khÃ´i phá»¥c khÃ´ng há»£p lá»‡.");
  }
}
