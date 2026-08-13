import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIdentityUserFromBearerRequest: vi.fn(),
  requireIdentityUser: vi.fn(),
  operationsActorForIdentity: vi.fn(),
  start: vi.fn(),
  recordPoint: vi.fn()
}));

vi.mock("@/server/identity/auth-context", () => ({
  getIdentityUserFromBearerRequest: mocks.getIdentityUserFromBearerRequest,
  requireIdentityUser: mocks.requireIdentityUser,
  operationsActorForIdentity: mocks.operationsActorForIdentity
}));

vi.mock("@/server/delivery-tracking/runtime", () => ({
  deliveryTrackingService: {
    start: mocks.start,
    recordPoint: mocks.recordPoint
  }
}));

import { POST as startTracking } from "@/app/api/mobile/tracking/route";
import { POST as recordTrackingPoint } from "@/app/api/mobile/tracking/points/route";

describe("native mobile route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 before origin or payload handling when the native Bearer token is absent", async () => {
    mocks.getIdentityUserFromBearerRequest.mockResolvedValue(undefined);

    const response = await startTracking(new Request("https://erp.example.test/api/mobile/tracking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start", deliveryJobId: "delivery-1" })
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("keeps malformed native payloads at 400 after a valid Bearer identity", async () => {
    const user = { id: "driver-1", role: "driver" };
    const actor = { id: "driver-1", role: "driver" };
    mocks.getIdentityUserFromBearerRequest.mockResolvedValue(user);
    mocks.operationsActorForIdentity.mockReturnValue(actor);

    const response = await recordTrackingPoint(new Request("https://erp.example.test/api/mobile/tracking/points", {
      method: "POST",
      headers: {
        authorization: "Bearer native-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({})
    }));

    expect(response.status).toBe(400);
    expect(mocks.recordPoint).not.toHaveBeenCalled();
  });
});
