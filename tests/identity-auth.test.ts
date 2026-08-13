import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { FileIdentityStore } from "../src/server/identity/file-identity-store";
import { IdentityService } from "../src/server/identity/identity-service";
import { createIdentitySessionToken, verifyIdentitySessionToken } from "../src/server/identity/session-token";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("invite-only identity service", () => {
  it("refuses to bootstrap with a predictable development administrator", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vlxd-identity-empty-"));
    temporaryDirectories.push(directory);
    const store = new FileIdentityStore(join(directory, "identity.json"), { NODE_ENV: "development" });

    await expect(store.getSnapshot()).rejects.toThrow("ERP_BOOTSTRAP_ADMIN_EMAIL");
  });

  it("bootstraps one owner and authenticates with a scrypt password hash", async () => {
    const fixture = await createFixture();
    const owner = await fixture.service.authenticate("OWNER@HIENXA.TEST", fixture.ownerPassword);
    const persisted = await readFile(fixture.filePath, "utf8");

    expect(owner.role).toBe("owner");
    expect(owner.status).toBe("active");
    expect(persisted).toContain("scrypt$");
    expect(persisted).not.toContain(fixture.ownerPassword);
    await expect(fixture.service.authenticate(owner.email, "wrong-password")).rejects.toThrow("không đúng");
  });

  it("recovers owner login credentials with a recovery token", async () => {
    const fixture = await createFixture();
    const owner = await fixture.service.authenticate("OWNER@HIENXA.TEST", fixture.ownerPassword);
    const recoveryToken = "owner-recovery-token";

    await expect(
      fixture.service.recoverOwnerCredentials({
        recoveryToken,
        expectedRecoveryToken: recoveryToken,
        identifier: "owner-new@hienxa.test",
        password: "OwnerNewPass123"
      })
    ).resolves.toMatchObject({
      id: owner.id
    });

    await expect(fixture.service.authenticate("OWNER@HIENXA.TEST", fixture.ownerPassword)).rejects.toThrow(/không đúng/i);
    await expect(fixture.service.authenticate("owner-new@hienxa.test", "OwnerNewPass123")).resolves.toMatchObject({
      id: owner.id
    });
  });

  it("rejects invalid owner recovery tokens", async () => {
    const fixture = await createFixture();
    await expect(
      fixture.service.recoverOwnerCredentials({
        recoveryToken: "wrong-token",
        expectedRecoveryToken: "owner-recovery-token",
        identifier: "owner-new@hienxa.test",
        password: "OwnerNewPass123"
      })
    ).rejects.toThrow("Khóa khôi phục");
  });

  it("stores only an invitation hash, limits modules by role and consumes the token once", async () => {
    const fixture = await createFixture();
    const owner = await fixture.service.authenticate(fixture.ownerEmail, fixture.ownerPassword);
    const invitation = await fixture.service.inviteUser(owner, {
      email: "driver.qc@hienxa.test",
      role: "driver",
      moduleIds: ["overview", "delivery", "cash"]
    });
    const persistedBeforeAcceptance = await readFile(fixture.filePath, "utf8");

    expect(invitation.user.moduleIds).toEqual(["overview", "delivery"]);
    expect(persistedBeforeAcceptance).not.toContain(invitation.token);
    expect(persistedBeforeAcceptance).toMatch(/"inviteTokenHash":"[a-f0-9]{64}"/);
    expect(await fixture.service.getInvitationPreview(invitation.token)).toMatchObject({
      email: "driver.qc@hienxa.test",
      role: "driver",
      moduleIds: ["overview", "delivery"]
    });

    const accepted = await fixture.service.acceptInvitation(invitation.token, "Tài xế QC", "DriverPass123");
    expect(accepted.status).toBe("active");
    expect(await fixture.service.getInvitationPreview(invitation.token)).toBeUndefined();
    await expect(fixture.service.acceptInvitation(invitation.token, "Tài xế QC", "DriverPass123")).rejects.toThrow("không hợp lệ");
    await expect(fixture.service.authenticate(accepted.email, "DriverPass123")).resolves.toMatchObject({ id: accepted.id });
  });

  it("enforces admin boundaries and invalidates old sessions after access changes", async () => {
    const fixture = await createFixture();
    const owner = await fixture.service.authenticate(fixture.ownerEmail, fixture.ownerPassword);
    const adminInvitation = await fixture.service.inviteUser(owner, {
      email: "admin.ops@hienxa.test",
      role: "administrator",
      moduleIds: ["overview", "audit"]
    });
    const administrator = await fixture.service.acceptInvitation(adminInvitation.token, "Quản trị vận hành", "AdminOps1234");

    await expect(fixture.service.inviteUser(administrator, {
      email: "owner2@hienxa.test",
      role: "owner"
    })).rejects.toThrow("không được cấp vai trò");

    const managedWorker = await fixture.service.createManagedWorker(administrator, {
      username: "tho_qc01",
      displayName: "Thợ QC Một",
      password: "WorkerPass123"
    });
    expect(managedWorker).toMatchObject({
      username: "tho_qc01",
      email: "",
      role: "worker",
      status: "active",
      moduleIds: ["overview", "procurement", "delivery", "workforce"]
    });
    await expect(fixture.service.authenticate("THO_QC01", "WorkerPass123")).resolves.toMatchObject({ id: managedWorker.id });
    await expect(fixture.service.createManagedWorker(administrator, {
      username: "tho_qc01",
      displayName: "Thợ trùng",
      password: "WorkerPass123"
    })).rejects.toThrow("đã được sử dụng");

    const resetWorker = await fixture.service.resetUserPassword(owner, managedWorker.id, "WorkerPass456");
    expect(resetWorker.sessionVersion).toBe(managedWorker.sessionVersion + 1);
    await expect(fixture.service.authenticate("tho_qc01", "WorkerPass123")).rejects.toThrow("không đúng");
    await expect(fixture.service.authenticate("tho_qc01", "WorkerPass456")).resolves.toMatchObject({ id: managedWorker.id });
    expect(await readFile(fixture.filePath, "utf8")).not.toContain("WorkerPass456");

    const salesInvitation = await fixture.service.inviteUser(owner, {
      email: "sales@hienxa.test",
      role: "sales"
    });
    const salesUser = await fixture.service.acceptInvitation(salesInvitation.token, "Nhân viên bán hàng", "SalesPass123");
    const secret = "identity-test-session-secret-with-at-least-32-characters";
    const oldToken = createIdentitySessionToken(salesUser, secret);
    const oldPayload = verifyIdentitySessionToken(oldToken, secret);

    const disabled = await fixture.service.updateUserAccess(owner, {
      userId: salesUser.id,
      role: "sales",
      status: "disabled",
      moduleIds: ["overview", "sales"]
    });

    expect(disabled.sessionVersion).toBe(salesUser.sessionVersion + 1);
    expect(oldPayload?.ver).not.toBe(disabled.sessionVersion);
    await expect(fixture.service.authenticate(salesUser.email, "SalesPass123")).rejects.toThrow("không đúng");
    await expect(fixture.service.updateUserAccess(owner, {
      userId: owner.id,
      role: "viewer",
      status: "active",
      moduleIds: ["overview"]
    })).rejects.toThrow("Không thể tự thay đổi");
  });

  it("temporarily locks an account without revealing account status", async () => {
    let currentTime = Date.UTC(2026, 6, 18, 8, 0, 0);
    const fixture = await createFixture(() => new Date(currentTime));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(fixture.service.authenticate(fixture.ownerEmail, "Incorrect123")).rejects.toThrow("không đúng");
    }
    await expect(fixture.service.authenticate(fixture.ownerEmail, fixture.ownerPassword)).rejects.toThrow("không đúng");

    const lockedData = JSON.parse(await readFile(fixture.filePath, "utf8")) as {
      users: Array<{ lockedUntil?: string }>;
    };
    expect(lockedData.users[0]?.lockedUntil).toBeTruthy();

    currentTime += 16 * 60 * 1_000;
    await expect(fixture.service.authenticate(fixture.ownerEmail, fixture.ownerPassword)).resolves.toMatchObject({
      email: fixture.ownerEmail
    });
  });

  it("applies bounded identity inputs and rejects weak managed passwords", async () => {
    const fixture = await createFixture();
    const owner = await fixture.service.authenticate(fixture.ownerEmail, fixture.ownerPassword);

    await expect(fixture.service.authenticate("x".repeat(255), "Password1234")).rejects.toThrow("không đúng");
    await expect(fixture.service.createManagedWorker(owner, {
      username: "tho_weak",
      displayName: "Thợ mật khẩu yếu",
      password: "password123"
    })).rejects.toThrow("12 đến 128");
    await expect(fixture.service.createManagedWorker(owner, {
      username: "tho_long",
      displayName: "Thợ mật khẩu dài",
      password: `A1${"x".repeat(127)}`
    })).rejects.toThrow("128");
    expect(await fixture.service.getInvitationPreview("x".repeat(257))).toBeUndefined();
  });
});

describe("signed identity session", () => {
  it("rejects tampering and expired tokens", () => {
    const secret = "identity-test-session-secret-with-at-least-32-characters";
    const now = Date.UTC(2026, 6, 18, 8, 0, 0);
    const token = createIdentitySessionToken({ id: "user-123", sessionVersion: 4 }, secret, now);

    expect(verifyIdentitySessionToken(token, secret, now)).toMatchObject({
      sub: "user-123",
      ver: 4,
      iat: Math.floor(now / 1_000),
      exp: Math.floor(now / 1_000) + 8 * 60 * 60
    });
    expect(verifyIdentitySessionToken(token, secret, now)?.sid).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(verifyIdentitySessionToken(`${token}x`, secret, now)).toBeUndefined();
    expect(verifyIdentitySessionToken(token, secret, now + 9 * 60 * 60 * 1_000)).toBeUndefined();
    expect(verifyIdentitySessionToken("x".repeat(1_025), secret, now)).toBeUndefined();
  });
});

async function createFixture(now?: () => Date) {
  const directory = await mkdtemp(join(tmpdir(), "vlxd-identity-"));
  temporaryDirectories.push(directory);
  const filePath = join(directory, "identity.json");
  const ownerEmail = "owner@hienxa.test";
  const ownerPassword = "OwnerPass1234";
  const store = new FileIdentityStore(filePath, {
    NODE_ENV: "development",
    ERP_BOOTSTRAP_ADMIN_EMAIL: ownerEmail,
    ERP_BOOTSTRAP_ADMIN_PASSWORD: ownerPassword,
    ERP_BOOTSTRAP_ADMIN_NAME: "Chủ cửa hàng QC"
  });
  return {
    filePath,
    ownerEmail,
    ownerPassword,
    service: new IdentityService(store, now)
  };
}
