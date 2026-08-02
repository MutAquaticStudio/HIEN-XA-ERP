import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  createMobileAccessToken: vi.fn(),
  requireMobileContext: vi.fn(),
  recordPoint: vi.fn(),
  getWebPushPublicKey: vi.fn()
}));

vi.mock("@/server/identity/runtime", () => ({
  identityService: { authenticate: mocks.authenticate }
}));

vi.mock("@/server/identity/auth-context", () => ({
  createMobileAccessToken: mocks.createMobileAccessToken,
}));

vi.mock("@/server/mobile/mobile-api", () => ({
  requireMobileContext: mocks.requireMobileContext,
  requireNativeMobileContext: mocks.requireMobileContext,
  mobileError: (error: unknown, fallback: string) => NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : fallback },
    { status: 400 }
  )
}));

vi.mock("@/server/delivery-tracking/runtime", () => ({
  deliveryTrackingService: { recordPoint: mocks.recordPoint }
}));

vi.mock("@/server/notifications/runtime", () => ({
  notificationService: { getWebPushPublicKey: mocks.getWebPushPublicKey }
}));

import { POST as login } from "@/app/api/mobile/auth/login/route";
import { POST as recordTrackingPoint } from "@/app/api/mobile/tracking/points/route";
import { GET as getVapidKey } from "@/app/api/notifications/vapid-key/route";

const mobileUser = {
  id: "worker-1",
  displayName: "Tho giao hang",
  role: "worker",
  moduleIds: ["delivery"],
  sessionVersion: 1
};

describe("mobile API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://erp.example.test");
    mocks.requireMobileContext.mockResolvedValue({ user: mobileUser, actor: { id: mobileUser.id, role: "worker" } });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("authenticates a valid mobile login and returns only the safe user projection", async () => {
    mocks.authenticate.mockResolvedValue(mobileUser);
    mocks.createMobileAccessToken.mockReturnValue("mobile-access-token");

    const response = await login(new Request("https://erp.example.test/api/mobile/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: " worker-1 ", password: "correct-password" })
    }));

    expect(mocks.authenticate).toHaveBeenCalledWith("worker-1", "correct-password");
    expect(await response.json()).toEqual({
      ok: true,
      accessToken: "mobile-access-token",
      user: {
        id: "worker-1",
        displayName: "Tho giao hang",
        role: "worker",
        moduleIds: ["delivery"]
      }
    });
  });

  it("rejects an invalid mobile login payload before authenticating", async () => {
    const response = await login(new Request("https://erp.example.test/api/mobile/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "x", password: "" })
    }));

    expect(response.status).toBe(400);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("records a validated tracking point with the authenticated worker actor", async () => {
    mocks.recordPoint.mockResolvedValue({ id: "session-1", version: 2 });
    const sessionId = "11111111-1111-4111-8111-111111111111";

    const response = await recordTrackingPoint(new Request("https://erp.example.test/api/mobile/tracking/points", {
      method: "POST",
      headers: { origin: "https://erp.example.test", host: "erp.example.test" },
      body: JSON.stringify({
        sessionId,
        clientPointId: "point-0001",
        recordedAt: "2026-07-27T10:00:00.000Z",
        latitude: 10.7769,
        longitude: 106.7009,
        accuracyMeters: 12
      })
    }));

    expect(mocks.recordPoint).toHaveBeenCalledWith(
      { id: "worker-1", role: "worker" },
      expect.objectContaining({ sessionId, clientPointId: "point-0001", latitude: 10.7769, longitude: 106.7009 })
    );
    expect(await response.json()).toEqual({ ok: true, session: { id: "session-1", version: 2 } });
  });

  it("rejects malformed GPS data before it reaches the tracking service", async () => {
    const response = await recordTrackingPoint(new Request("https://erp.example.test/api/mobile/tracking/points", {
      method: "POST",
      headers: { origin: "https://erp.example.test", host: "erp.example.test" },
      body: JSON.stringify({
        sessionId: "not-a-uuid",
        clientPointId: "short",
        recordedAt: "not-a-date",
        latitude: "north",
        longitude: 106.7
      })
    }));

    expect(response.status).toBe(400);
    expect(mocks.recordPoint).not.toHaveBeenCalled();
  });

  it("publishes only the configured public VAPID key", async () => {
    mocks.getWebPushPublicKey.mockReturnValue("public-vapid-key");

    const response = await getVapidKey();

    expect(await response.json()).toEqual({ ok: true, publicKey: "public-vapid-key" });
  });
});
