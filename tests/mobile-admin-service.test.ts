import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SafeIdentityUser } from "@/server/identity/types";

const mocks = vi.hoisted(() => ({
  getAdminSnapshot: vi.fn(),
  authenticate: vi.fn(),
  updateUserAccess: vi.fn(),
  resetUserPassword: vi.fn()
}));

vi.mock("@/server/identity/runtime", () => ({
  identityService: {
    getAdminSnapshot: mocks.getAdminSnapshot,
    authenticate: mocks.authenticate,
    updateUserAccess: mocks.updateUserAccess,
    resetUserPassword: mocks.resetUserPassword
  }
}));

import { getMobileAdminOverview, runMobileAdminAction } from "@/server/mobile/mobile-admin-service";

const owner: SafeIdentityUser = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "owner.mobile",
  email: "owner@example.test",
  normalizedEmail: "owner@example.test",
  displayName: "Chu cua hang",
  role: "owner",
  moduleIds: ["overview"],
  status: "active",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
  failedLoginAttempts: 0,
  sessionVersion: 4
};

const target = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "staff.mobile",
  email: "staff@example.test",
  sessionVersion: 3
};

function adminSnapshot(user = target) {
  return { revision: 12, users: [user], auditEvents: [] };
}

describe("mobile administration service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminSnapshot.mockResolvedValue(adminSnapshot());
    mocks.authenticate.mockResolvedValue(owner);
    mocks.updateUserAccess.mockResolvedValue({ ...target, role: "worker", status: "active", moduleIds: ["overview"] });
    mocks.resetUserPassword.mockResolvedValue(target);
  });

  it("does not reveal administration data to a non-administrator role", async () => {
    await expect(getMobileAdminOverview({ ...owner, role: "sales" })).rejects.toMatchObject({ status: 403 });
    expect(mocks.getAdminSnapshot).not.toHaveBeenCalled();
  });

  it("rejects malformed administrative mutation input before loading identities", async () => {
    await expect(runMobileAdminAction(owner, { action: "resetPassword", userId: target.id, password: "short" })).rejects.toHaveProperty("issues");
    expect(mocks.getAdminSnapshot).not.toHaveBeenCalled();
    expect(mocks.resetUserPassword).not.toHaveBeenCalled();
  });

  it("returns a version conflict before reauthentication or mutation when the target account has changed", async () => {
    await expect(runMobileAdminAction(owner, {
      action: "updateAccess",
      idempotencyKey: "mobile-admin-version-0001",
      userId: target.id,
      expectedSessionVersion: 2,
      role: "worker",
      status: "active",
      moduleIds: ["overview"],
      reauthPassword: "long-enough-password"
    })).rejects.toMatchObject({ status: 409 });
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.updateUserAccess).not.toHaveBeenCalled();
  });

  it("requires reauthentication and forwards the bounded idempotency and version guard to identity access updates", async () => {
    const result = await runMobileAdminAction(owner, {
      action: "updateAccess",
      idempotencyKey: "mobile-admin-access-0002",
      userId: target.id,
      expectedSessionVersion: 3,
      role: "worker",
      status: "active",
      moduleIds: ["overview"],
      reauthPassword: "long-enough-password"
    });

    expect(mocks.authenticate).toHaveBeenCalledWith("owner.mobile", "long-enough-password");
    expect(mocks.updateUserAccess).toHaveBeenCalledWith(owner, {
      userId: target.id,
      role: "worker",
      status: "active",
      moduleIds: ["overview"],
      idempotencyKey: "mobile-admin-access-0002",
      expectedSessionVersion: 3
    });
    expect(result).toMatchObject({ user: { id: target.id } });
  });

  it("never resets a password when administrator reauthentication fails", async () => {
    mocks.authenticate.mockResolvedValue(undefined);
    await expect(runMobileAdminAction(owner, {
      action: "resetPassword",
      idempotencyKey: "mobile-admin-reset-0003",
      userId: target.id,
      expectedSessionVersion: 3,
      password: "new-long-enough-password",
      reauthPassword: "long-enough-password"
    })).rejects.toMatchObject({ status: 403 });
    expect(mocks.resetUserPassword).not.toHaveBeenCalled();
  });
});
