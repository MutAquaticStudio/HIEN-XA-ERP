import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import type { OperationsActor } from "@/modules/operations/types";
import type { SafeIdentityUser } from "@/server/identity/types";

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  runOperation: vi.fn(),
  runCreateCommand: vi.fn(),
  projectSnapshot: vi.fn()
}));

vi.mock("@/server/erp-v2/runtime", () => ({
  getErpV2Snapshot: mocks.getSnapshot,
  runErpV2Operation: mocks.runOperation,
  runErpV2CreateCommand: mocks.runCreateCommand
}));
vi.mock("@/server/identity/auth-context", () => ({
  visibleModulesForIdentity: (user: { moduleIds: string[] }) => user.moduleIds
}));
vi.mock("@/server/identity/operations-projection", () => ({
  projectOperationsSnapshot: mocks.projectSnapshot
}));

import { getMobileAuditDetail } from "@/server/mobile/mobile-audit-service";
import { getMobileCatalogOverview } from "@/server/mobile/mobile-catalog-service";
import { createMobileImportDryRun, runMobileImportAction } from "@/server/mobile/mobile-import-service";
import { getMobileReportingOverview } from "@/server/mobile/mobile-reporting-service";

function identity(input: Partial<SafeIdentityUser> = {}): SafeIdentityUser {
  return {
    id: "mobile-owner",
    email: "owner@example.test",
    normalizedEmail: "owner@example.test",
    displayName: "Chu cua hang",
    role: "owner",
    moduleIds: ["import", "audit", "reporting", "sales"],
    status: "active",
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    failedLoginAttempts: 0,
    sessionVersion: 1,
    ...input
  };
}

function actor(permissions: string[]): OperationsActor {
  return { id: "mobile-owner", displayName: "Chu cua hang", role: "owner", permissions };
}

function snapshot(state = createInitialOperationsState(), revision = 7) {
  return { state, revision, syncedAt: "2026-07-30T00:00:00.000Z", source: "memory" as const };
}

describe("native Batch 4 service boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSnapshot.mockResolvedValue(snapshot());
    mocks.projectSnapshot.mockImplementation((value: unknown) => value);
    mocks.runOperation.mockResolvedValue({ summary: "Da cap nhat.", revision: 8, syncedAt: "2026-07-30T00:01:00.000Z" });
    mocks.runCreateCommand.mockResolvedValue({ summary: "Da tao.", revision: 8, syncedAt: "2026-07-30T00:01:00.000Z" });
  });

  it("blocks import outside the import module and rejects malformed workbook input before a command is created", async () => {
    const workbook = { name: "unsafe.csv", size: 12, arrayBuffer: vi.fn() };
    await expect(createMobileImportDryRun(identity({ moduleIds: [] }), actor(["import.create_dry_run"]), workbook)).rejects.toMatchObject({ status: 403 });
    await expect(createMobileImportDryRun(identity(), actor(["import.create_dry_run"]), workbook)).rejects.toMatchObject({ status: 400 });
    expect(mocks.runCreateCommand).not.toHaveBeenCalled();
  });

  it("replays an import action idempotently and stops a stale import action before mutation", async () => {
    const state = createInitialOperationsState();
    state.processedOperations.push({ idempotencyKey: "mobile-import-replay-0001" } as (typeof state.processedOperations)[number]);
    mocks.getSnapshot.mockResolvedValue(snapshot(state, 7));

    const replay = await runMobileImportAction(identity(), actor(["import.resolve_issue"]), "issue-any", {
      action: "resolveIssue",
      idempotencyKey: "mobile-import-replay-0001",
      expectedRevision: 7
    });
    expect(replay.summary).toMatch(/không ghi trùng/i);
    expect(mocks.runOperation).not.toHaveBeenCalled();

    await expect(runMobileImportAction(identity(), actor(["import.resolve_issue"]), "issue-any", {
      action: "resolveIssue",
      idempotencyKey: "mobile-import-stale-0002",
      expectedRevision: 6
    })).rejects.toMatchObject({ status: 409 });
    expect(mocks.runOperation).not.toHaveBeenCalled();
  });

  it("redacts before and after audit detail for non-administrator audit users", async () => {
    const state = createInitialOperationsState();
    const event = state.auditLogs[0];
    expect(event).toBeDefined();
    if (!event) throw new Error("Expected sample audit event.");
    event.before = { secretReference: "before-private" };
    event.after = { secretReference: "after-private" };
    mocks.getSnapshot.mockResolvedValue(snapshot(state));

    const detail = await getMobileAuditDetail(identity({ role: "accountant", moduleIds: ["audit"] }), event.id);
    expect(detail.audit).toMatchObject({ id: event.id, detailRedacted: true, before: undefined, after: undefined });
    expect(JSON.stringify(detail)).not.toContain("private");

    const ownerDetail = await getMobileAuditDetail(identity({ role: "owner", moduleIds: ["audit"] }), event.id);
    expect(ownerDetail.audit).toMatchObject({ detailRedacted: false, before: { secretReference: "before-private" }, after: { secretReference: "after-private" } });
  });

  it("keeps catalog cost and margin fields out of the mobile catalog projection and blocks field roles", async () => {
    await expect(getMobileCatalogOverview(identity({ role: "driver", moduleIds: [] }))).rejects.toMatchObject({ status: 403 });

    const catalog = await getMobileCatalogOverview(identity({ role: "sales", moduleIds: ["sales"] }));
    expect(catalog.products.length).toBeGreaterThan(0);
    expect(catalog.products[0]).not.toHaveProperty("unitCost");
    expect(catalog.products[0]).not.toHaveProperty("latestLandedCost");
    expect(catalog.products[0]).not.toHaveProperty("targetMargin");
  });

  it("keeps reporting behind its module boundary and rejects a month outside the available reporting data", async () => {
    await expect(getMobileReportingOverview(identity({ role: "worker", moduleIds: [] }), {})).rejects.toMatchObject({ status: 403 });
    await expect(getMobileReportingOverview(identity({ moduleIds: ["reporting"] }), { month: "1999-01" })).rejects.toMatchObject({ status: 400 });
  });
});
