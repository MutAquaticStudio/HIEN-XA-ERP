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

import { GET as getSales, POST as createSales } from "@/app/api/mobile/sales/route";
import { GET as getPurchase, POST as createPurchase } from "@/app/api/mobile/procurement/route";

describe("native sales and procurement route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIdentityUserFromBearerRequest.mockResolvedValue(undefined);
  });

  it("returns 401 before bounded sales or procurement handling when Bearer is absent", async () => {
    const routes: Array<{ route: (request: Request) => Promise<Response>; request: Request }> = [
      { route: getSales, request: new Request("https://erp.example.test/api/mobile/sales") },
      { route: createSales, request: new Request("https://erp.example.test/api/mobile/sales", { method: "POST", body: JSON.stringify({ action: "reviewDraft" }) }) },
      { route: getPurchase, request: new Request("https://erp.example.test/api/mobile/procurement") },
      { route: createPurchase, request: new Request("https://erp.example.test/api/mobile/procurement", { method: "POST", body: JSON.stringify({ action: "reviewDraft" }) }) }
    ];

    for (const { route, request } of routes) {
      const response = await route(request);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ ok: false, error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
    }
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
  });
});
