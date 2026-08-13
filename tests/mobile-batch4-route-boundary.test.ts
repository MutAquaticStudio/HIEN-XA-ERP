import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIdentityUserFromBearerRequest: vi.fn(),
  requireIdentityUser: vi.fn(),
  operationsActorForIdentity: vi.fn()
}));

vi.mock("@/server/identity/auth-context", () => ({
  getIdentityUserFromBearerRequest: mocks.getIdentityUserFromBearerRequest,
  requireIdentityUser: mocks.requireIdentityUser,
  operationsActorForIdentity: mocks.operationsActorForIdentity,
  visibleModulesForIdentity: (user: { moduleIds: string[] }) => user.moduleIds
}));

import { GET as getAdmin, POST as postAdmin } from "@/app/api/mobile/admin/route";
import { GET as getAudit } from "@/app/api/mobile/audit/route";
import { GET as getAuditDetail } from "@/app/api/mobile/audit/[auditId]/route";
import { GET as getCatalog } from "@/app/api/mobile/catalog/route";
import { GET as getImport, POST as postImport } from "@/app/api/mobile/import/route";
import { POST as postImportIssue } from "@/app/api/mobile/import/[issueId]/route";
import { GET as getReporting } from "@/app/api/mobile/reporting/route";

describe("native Batch 4 route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIdentityUserFromBearerRequest.mockResolvedValue(undefined);
  });

  it("returns 401 before import, audit, reporting, catalog, or administration work when Bearer is absent", async () => {
    const request = (path: string, method = "GET", body?: string) => new Request(`https://erp.example.test${path}`, {
      method,
      body,
      headers: body ? { "content-type": "application/json" } : undefined
    });
    const routes: Array<() => Promise<Response>> = [
      () => getImport(request("/api/mobile/import")),
      () => postImport(request("/api/mobile/import", "POST", "{}")),
      () => postImportIssue(request("/api/mobile/import/issue-1", "POST", "{}"), { params: Promise.resolve({ issueId: "issue-1" }) }),
      () => getAudit(request("/api/mobile/audit")),
      () => getAuditDetail(request("/api/mobile/audit/audit-1"), { params: Promise.resolve({ auditId: "audit-1" }) }),
      () => getReporting(request("/api/mobile/reporting")),
      () => getCatalog(request("/api/mobile/catalog")),
      () => getAdmin(request("/api/mobile/admin")),
      () => postAdmin(request("/api/mobile/admin", "POST", "{}"))
    ];

    for (const run of routes) {
      const response = await run();
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ ok: false });
    }
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
    expect(mocks.operationsActorForIdentity).not.toHaveBeenCalled();
  });
});
