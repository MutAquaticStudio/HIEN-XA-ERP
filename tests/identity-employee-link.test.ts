import { describe, expect, it } from "vitest";
import { visibleModulesForRole } from "../src/modules/operations/identity";
import { IdentityService, type IdentityStore } from "../src/server/identity/identity-service";
import type { IdentityUser, PersistedIdentityData, SafeIdentityUser } from "../src/server/identity/types";

const now = "2026-08-05T00:00:00.000Z";

function identityUser(overrides: Partial<IdentityUser> & Pick<IdentityUser, "id" | "role">): IdentityUser {
  return {
    email: `${overrides.id}@example.invalid`,
    normalizedEmail: `${overrides.id}@example.invalid`,
    username: overrides.id,
    normalizedUsername: overrides.id,
    displayName: overrides.id,
    moduleIds: [...visibleModulesForRole(overrides.role)],
    status: "active",
    passwordHash: "test-only-hash",
    createdAt: now,
    updatedAt: now,
    failedLoginAttempts: 0,
    sessionVersion: 1,
    ...overrides
  };
}

function createStore(users: IdentityUser[]) {
  let data: PersistedIdentityData = { schemaVersion: 1, revision: 0, users, auditEvents: [] };
  const store: IdentityStore = {
    async getSnapshot() { return structuredClone(data); },
    async transaction<T>(handler: (draft: PersistedIdentityData) => T | Promise<T>) {
      const draft = structuredClone(data);
      const result = await handler(draft);
      draft.revision += 1;
      data = draft;
      return result;
    }
  };
  return { store, snapshot: () => structuredClone(data) };
}

const employee = { id: "employee-worker-1", roleType: "worker" as const, status: "active" as const };

describe("IdentityService.linkEmployeeIdentity", () => {
  it("links once, revokes old sessions and audits an idempotent retry", async () => {
    const owner = identityUser({ id: "owner-1", role: "owner" });
    const worker = identityUser({ id: "11111111-1111-4111-8111-111111111111", role: "worker" });
    const memory = createStore([owner, worker]);
    const service = new IdentityService(memory.store, () => new Date(now));
    const input = {
      userId: worker.id,
      employeeId: employee.id,
      employee,
      expectedSessionVersion: 1,
      idempotencyKey: "link-worker-identity-001",
      reason: "Thêm liên kết tài khoản với hồ sơ nhân sự"
    };

    const linked = await service.linkEmployeeIdentity(owner as SafeIdentityUser, input);
    const replayed = await service.linkEmployeeIdentity(owner as SafeIdentityUser, input);
    expect(linked).toMatchObject({ employeeId: employee.id, sessionVersion: 2 });
    expect(replayed).toMatchObject({ employeeId: employee.id, sessionVersion: 2 });
    expect(memory.snapshot().auditEvents.filter((event) => event.action === "employee_identity_linked")).toHaveLength(1);
  });

  it("rejects non-owner, incompatible roles, duplicate links and stale versions", async () => {
    const owner = identityUser({ id: "owner-1", role: "owner" });
    const admin = identityUser({ id: "admin-1", role: "administrator" });
    const worker = identityUser({ id: "11111111-1111-4111-8111-111111111111", role: "worker" });
    const linkedWorker = identityUser({ id: "22222222-2222-4222-8222-222222222222", role: "worker", employeeId: employee.id });
    const input = {
      userId: worker.id,
      employeeId: employee.id,
      employee,
      expectedSessionVersion: 1,
      idempotencyKey: "link-002",
      reason: "Liên kết hồ sơ nhân sự phù hợp"
    };

    await expect(new IdentityService(createStore([owner, admin, worker]).store).linkEmployeeIdentity(admin as SafeIdentityUser, input)).rejects.toThrow("Chỉ Chủ cửa hàng");
    await expect(new IdentityService(createStore([owner, worker]).store).linkEmployeeIdentity(owner as SafeIdentityUser, { ...input, employee: { ...employee, roleType: "driver" as const } })).rejects.toThrow("không phù hợp");
    await expect(new IdentityService(createStore([owner, worker, linkedWorker]).store).linkEmployeeIdentity(owner as SafeIdentityUser, input)).rejects.toThrow("một tài khoản khác");
    await expect(new IdentityService(createStore([owner, { ...worker, sessionVersion: 2 }]).store).linkEmployeeIdentity(owner as SafeIdentityUser, input)).rejects.toThrow("đã được thay đổi");
  });
});
