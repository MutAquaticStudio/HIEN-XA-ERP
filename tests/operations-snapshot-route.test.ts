import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getErpV2Snapshot: vi.fn(),
  requireIdentityUser: vi.fn(),
  projectOperationsSnapshot: vi.fn()
}));

vi.mock("@/server/erp-v2/runtime", () => ({ getErpV2Snapshot: mocks.getErpV2Snapshot }));
vi.mock("@/server/identity/auth-context", () => ({ requireIdentityUser: mocks.requireIdentityUser }));
vi.mock("@/server/identity/operations-projection", () => ({ projectOperationsSnapshot: mocks.projectOperationsSnapshot }));

import { GET } from "@/app/api/operations/snapshot/route";
import { IdentityPublicError } from "@/server/identity/errors";

describe("operations snapshot browser route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an identity and returns only the role-projected snapshot without caching", async () => {
    const user = { id: "owner-1", role: "owner" };
    const source = { state: { secret: "raw" }, revision: 7, syncedAt: "2026-08-24T00:00:00.000Z" };
    const projected = { state: { safe: true }, revision: 7, syncedAt: source.syncedAt };
    mocks.requireIdentityUser.mockResolvedValue(user);
    mocks.getErpV2Snapshot.mockResolvedValue(source);
    mocks.projectOperationsSnapshot.mockReturnValue(projected);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(mocks.projectOperationsSnapshot).toHaveBeenCalledWith(source, user);
    expect(await response.json()).toEqual(projected);
  });

  it("does not read ERP state when the browser session is invalid", async () => {
    mocks.requireIdentityUser.mockRejectedValue(new IdentityPublicError("expired"));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getErpV2Snapshot).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ ok: false, error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
  });
});
