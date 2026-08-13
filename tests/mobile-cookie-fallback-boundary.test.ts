import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIdentityUserFromBearerRequest: vi.fn(),
  requireIdentityUser: vi.fn(),
  operationsActorForIdentity: vi.fn()
}));

vi.mock("@/server/identity/auth-context", () => ({
  getIdentityUserFromBearerRequest: mocks.getIdentityUserFromBearerRequest,
  requireIdentityUser: mocks.requireIdentityUser,
  operationsActorForIdentity: mocks.operationsActorForIdentity
}));

import { requireMobileContext } from "@/server/mobile/mobile-api";

describe("cookie-compatible mobile boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not fall back to a cookie when an invalid Bearer header is supplied", async () => {
    mocks.getIdentityUserFromBearerRequest.mockResolvedValue(undefined);
    await expect(requireMobileContext(new Request("https://erp.example.test/api/messages", {
      headers: { authorization: "Bearer invalid-token" }
    }))).rejects.toThrow("Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
  });
});
