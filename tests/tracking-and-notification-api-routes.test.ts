import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMobileContext: vi.fn(),
  getOverview: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  getPublicTracking: vi.fn(),
  sendTest: vi.fn()
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
  deliveryTrackingService: {
    getOverview: mocks.getOverview,
    start: mocks.start,
    stop: mocks.stop,
    getPublicTracking: mocks.getPublicTracking
  }
}));

vi.mock("@/server/notifications/runtime", () => ({
  notificationService: { sendTest: mocks.sendTest }
}));

import { GET as getTracking, POST as updateTracking } from "@/app/api/mobile/tracking/route";
import { GET as getPublicTracking } from "@/app/api/tracking/[token]/route";
import { POST as sendTestNotification } from "@/app/api/notifications/test/route";

const actor = { id: "worker-1", role: "worker" };
const user = { id: "worker-1", role: "worker", displayName: "Tho giao hang" };
const sessionId = "11111111-1111-4111-8111-111111111111";

describe("tracking and push notification API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMobileContext.mockResolvedValue({ actor, user });
  });

  it("returns a tracking overview only for the authenticated mobile actor", async () => {
    mocks.getOverview.mockResolvedValue({ activeSession: { id: "session-1" }, jobs: [] });

    const response = await getTracking(new Request("https://erp.example.test/api/mobile/tracking"));

    expect(mocks.getOverview).toHaveBeenCalledWith(actor);
    expect(await response.json()).toEqual({ ok: true, activeSession: { id: "session-1" }, jobs: [] });
  });

  it("starts an authorized session without exposing a customer link", async () => {
    mocks.start.mockResolvedValue({ session: { id: "session-1" }, created: true });

    const response = await updateTracking(new Request("https://erp.example.test/api/mobile/tracking", {
      method: "POST",
      headers: { origin: "https://erp.example.test", host: "erp.example.test" },
      body: JSON.stringify({ action: "start", deliveryJobId: "GH-2026-0001" })
    }));

    expect(mocks.start).toHaveBeenCalledWith(actor, "GH-2026-0001");
    expect(await response.json()).toEqual({ ok: true, session: { id: "session-1" }, created: true });
  });

  it("stops only a structurally valid tracking session", async () => {
    mocks.stop.mockResolvedValue({ id: "session-1", status: "stopped" });

    const response = await updateTracking(new Request("https://erp.example.test/api/mobile/tracking", {
      method: "POST",
      headers: { origin: "https://erp.example.test", host: "erp.example.test" },
      body: JSON.stringify({ action: "stop", sessionId })
    }));

    expect(mocks.stop).toHaveBeenCalledWith(actor, sessionId);
    expect(await response.json()).toEqual({ ok: true, session: { id: "session-1", status: "stopped" } });
  });

  it("rejects an unknown tracking action before the service call", async () => {
    const response = await updateTracking(new Request("https://erp.example.test/api/mobile/tracking", {
      method: "POST",
      headers: { origin: "https://erp.example.test", host: "erp.example.test" },
      body: JSON.stringify({ action: "delete", sessionId })
    }));

    expect(response.status).toBe(400);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it("returns an opaque public tracking response with privacy-preserving headers", async () => {
    mocks.getPublicTracking.mockResolvedValue({ status: "in_transit", lastPoint: { latitude: 10.7, longitude: 106.7 } });

    const response = await getPublicTracking(new Request("https://erp.example.test/api/tracking/opaque-public-token"), {
      params: Promise.resolve({ token: "opaque-public-token" })
    });

    expect(mocks.getPublicTracking).toHaveBeenCalledWith("opaque-public-token");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toEqual({
      ok: true,
      status: "in_transit",
      lastPoint: { latitude: 10.7, longitude: 106.7 }
    });
  });

  it("does not reveal whether an invalid public tracking token ever existed", async () => {
    mocks.getPublicTracking.mockResolvedValue(undefined);

    const response = await getPublicTracking(new Request("https://erp.example.test/api/tracking/missing"), {
      params: Promise.resolve({ token: "missing" })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Liên kết theo dõi không hợp lệ hoặc đã hết hạn."
    });
  });

  it("rejects a cross-origin notification test before resolving the mobile session", async () => {
    const response = await sendTestNotification(new Request("https://erp.example.test/api/notifications/test", {
      method: "POST",
      headers: { origin: "https://attacker.example" }
    }));

    expect(response.status).toBe(400);
    expect(mocks.requireMobileContext).not.toHaveBeenCalled();
    expect(mocks.sendTest).not.toHaveBeenCalled();
  });

  it("sends a test notification only to the authenticated user's own subscriptions", async () => {
    const response = await sendTestNotification(new Request("https://erp.example.test/api/notifications/test", {
      method: "POST",
      headers: { origin: "https://erp.example.test" }
    }));

    expect(mocks.sendTest).toHaveBeenCalledWith(user);
    expect(await response.json()).toEqual({ ok: true });
  });
});
