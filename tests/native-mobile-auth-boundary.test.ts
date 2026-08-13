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

import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { PublicApiError } from "@/server/shared/public-api-error";
import { OperationInputError } from "@/modules/operations/errors";

describe("native mobile authentication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a request without a Bearer token instead of falling back to a browser cookie", async () => {
    mocks.getIdentityUserFromBearerRequest.mockResolvedValue(undefined);

    await expect(requireNativeMobileContext(new Request("https://erp.example.test/api/mobile/tracking")))
      .rejects.toThrow("Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
  });

  it("creates an operations actor only from the authenticated native identity", async () => {
    const user = { id: "driver-1", role: "driver" };
    const actor = { id: "driver-1", role: "driver" };
    mocks.getIdentityUserFromBearerRequest.mockResolvedValue(user);
    mocks.operationsActorForIdentity.mockReturnValue(actor);

    await expect(requireNativeMobileContext(new Request("https://erp.example.test/api/mobile/tracking", {
      headers: { authorization: "Bearer native-token" }
    }))).resolves.toEqual({ user, actor });
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
  });

  it("returns explicit public statuses and hides unexpected failures", async () => {
    const forbidden = mobileError(new PublicApiError(403, "Bạn không có quyền thực hiện thao tác này."), "Không thể tiếp tục.");
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toEqual({ ok: false, error: "Bạn không có quyền thực hiện thao tác này." });

    const orderClaimed = mobileError(new OperationInputError("Lỗi yêu cầu", "ORDER_ALREADY_CLAIMED", 409), "Không thể tiếp tục.");
    expect(orderClaimed.status).toBe(409);
    await expect(orderClaimed.json()).resolves.toMatchObject({ code: "ORDER_ALREADY_CLAIMED", guidance: expect.any(String) });

    const staleState = mobileError(new OperationInputError("Trạng thái không hợp lệ", "STATE_CONFLICT", 412), "Không thể tiếp tục.");
    expect(staleState.status).toBe(412);
    await expect(staleState.json()).resolves.toMatchObject({ code: "STATE_CONFLICT", guidance: expect.any(String) });

    const unexpected = mobileError(new Error("database connection failed"), "Không thể tiếp tục.");
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({ ok: false, error: "Không thể tiếp tục." });
  });
});
