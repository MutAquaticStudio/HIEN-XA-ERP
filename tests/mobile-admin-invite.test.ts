import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { OperationsModuleId } from "../src/modules/operations/erp-registry";
import { FileIdentityStore } from "../src/server/identity/file-identity-store";
import { IdentityService } from "../src/server/identity/identity-service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("mobile admin invitations", () => {
  it("creates a token-free, idempotent internal invitation with audit correlation", async () => {
    const fixture = await createFixture();
    const owner = await fixture.service.authenticate(fixture.ownerEmail, fixture.ownerPassword);
    const initial = await fixture.service.getAdminSnapshot(owner);
    const command: {
      email: string;
      role: "warehouse";
      moduleIds: OperationsModuleId[];
      idempotencyKey: string;
      expectedRevision: number;
    } = {
      email: "warehouse.mobile@hienxa.test",
      role: "warehouse" as const,
      moduleIds: ["overview", "inventory"],
      idempotencyKey: "mobile-admin-invite-warehouse-0001",
      expectedRevision: initial.revision
    };

    const created = await fixture.service.inviteMobileUser(owner, command);
    const afterCreate = await fixture.service.getAdminSnapshot(owner);
    const replayed = await fixture.service.inviteMobileUser(owner, command);
    const afterReplay = await fixture.service.getAdminSnapshot(owner);

    expect(created).toMatchObject({ replayed: false, user: { email: command.email, role: "warehouse", status: "invited" } });
    expect(created).not.toHaveProperty("token");
    expect(replayed).toMatchObject({ replayed: true, user: { id: created.user.id } });
    expect(afterReplay.revision).toBe(afterCreate.revision);
    expect(afterReplay.auditEvents.filter((event) => event.action === "user_invited" && event.correlationId === command.idempotencyKey)).toHaveLength(1);

    await expect(fixture.service.inviteMobileUser(owner, {
      ...command,
      email: "stale.mobile@hienxa.test",
      idempotencyKey: "mobile-admin-invite-stale-0002",
      expectedRevision: initial.revision
    })).rejects.toMatchObject({ status: 409 });
  });

  it("refuses mobile invitations for roles that require a party or employee binding", async () => {
    const fixture = await createFixture();
    const owner = await fixture.service.authenticate(fixture.ownerEmail, fixture.ownerPassword);
    const snapshot = await fixture.service.getAdminSnapshot(owner);

    await expect(fixture.service.inviteMobileUser(owner, {
      email: "worker.mobile@hienxa.test",
      role: "worker",
      moduleIds: ["overview", "workforce"],
      idempotencyKey: "mobile-admin-invite-worker-0003",
      expectedRevision: snapshot.revision
    })).rejects.toThrow();
  });
});

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), "vlxd-mobile-admin-invite-"));
  temporaryDirectories.push(directory);
  const ownerEmail = "owner@hienxa.test";
  const ownerPassword = "OwnerPass1234";
  const store = new FileIdentityStore(join(directory, "identity.json"), {
    NODE_ENV: "development",
    ERP_BOOTSTRAP_ADMIN_EMAIL: ownerEmail,
    ERP_BOOTSTRAP_ADMIN_PASSWORD: ownerPassword,
    ERP_BOOTSTRAP_ADMIN_NAME: "Owner test"
  });
  return { ownerEmail, ownerPassword, service: new IdentityService(store) };
}
