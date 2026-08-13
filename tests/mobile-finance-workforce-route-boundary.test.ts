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

import { GET as getCash, POST as postCash } from "@/app/api/mobile/cash/route";
import { GET as getPayables, POST as postPayables } from "@/app/api/mobile/payables/route";
import { GET as getReceivables, POST as postReceivables } from "@/app/api/mobile/receivables/route";
import { GET as getWorkforce, POST as postWorkforce } from "@/app/api/mobile/workforce/route";

describe("native finance and workforce route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIdentityUserFromBearerRequest.mockResolvedValue(undefined);
  });

  it("returns 401 before finance or workforce handlers when Bearer is absent", async () => {
    const routes: Array<{ route: (request: Request) => Promise<Response>; request: Request }> = [
      { route: getReceivables, request: new Request("https://erp.example.test/api/mobile/receivables") },
      { route: postReceivables, request: new Request("https://erp.example.test/api/mobile/receivables", { method: "POST", body: JSON.stringify({ action: "createPaymentDraft" }) }) },
      { route: getPayables, request: new Request("https://erp.example.test/api/mobile/payables") },
      { route: postPayables, request: new Request("https://erp.example.test/api/mobile/payables", { method: "POST", body: JSON.stringify({ action: "createPaymentDraft" }) }) },
      { route: getCash, request: new Request("https://erp.example.test/api/mobile/cash") },
      { route: postCash, request: new Request("https://erp.example.test/api/mobile/cash", { method: "POST", body: JSON.stringify({ action: "createVoucherDraft" }) }) },
      { route: getWorkforce, request: new Request("https://erp.example.test/api/mobile/workforce") },
      { route: postWorkforce, request: new Request("https://erp.example.test/api/mobile/workforce", { method: "POST", body: JSON.stringify({ action: "approveOutput" }) }) }
    ];

    for (const { route, request } of routes) {
      const response = await route(request);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn."
      });
    }
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
  });
});
