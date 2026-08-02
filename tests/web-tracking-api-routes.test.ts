import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMobileContext: vi.fn(),
  getOverview: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  createPublicShare: vi.fn(),
  revokePublicShare: vi.fn(),
  getCustomerOverview: vi.fn()
}));

vi.mock("@/server/mobile/mobile-api", () => ({
  requireMobileContext: mocks.requireMobileContext,
  mobileError: (error: unknown, fallback: string) => NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback }, { status: 400 })
}));
vi.mock("@/server/delivery-tracking/runtime", () => ({
  deliveryTrackingService: {
    getOverview: mocks.getOverview,
    start: mocks.start,
    stop: mocks.stop,
    createPublicShare: mocks.createPublicShare,
    revokePublicShare: mocks.revokePublicShare,
    getCustomerOverview: mocks.getCustomerOverview
  }
}));

import { GET as getWebTracking, POST as postWebTracking } from "@/app/api/tracking/web/route";
import { POST as postShare } from "@/app/api/tracking/share/route";
import { GET as getCustomerTracking } from "@/app/api/tracking/customer/route";

const actor = { id: "worker-1", role: "driver", displayName: "Tài xế" };
const user = { id: "worker-1", role: "driver", displayName: "Tài xế" };
const deliveryJobId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

describe("web tracking API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMobileContext.mockResolvedValue({ actor, user });
  });

  it("rejects a cross-origin cookie mutation before loading the identity", async () => {
    const response = await postWebTracking(new Request("https://erp.example/api/tracking/web", {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify({ action: "start", deliveryJobId })
    }));

    expect(response.status).toBe(400);
    expect(mocks.requireMobileContext).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("allows a same-origin driver to start only a validated delivery session", async () => {
    mocks.start.mockResolvedValue({ session: { id: sessionId }, created: true });
    const response = await postWebTracking(new Request("https://erp.example/api/tracking/web", {
      method: "POST",
      headers: { origin: "https://erp.example", host: "erp.example", "content-type": "application/json" },
      body: JSON.stringify({ action: "start", deliveryJobId })
    }));

    expect(mocks.start).toHaveBeenCalledWith(actor, deliveryJobId);
    expect(await response.json()).toEqual({ ok: true, session: { id: sessionId }, created: true });
  });

  it("creates a public tracking URL only through the manager share endpoint", async () => {
    mocks.createPublicShare.mockResolvedValue({ publicToken: "a".repeat(32), session: { id: sessionId } });
    const response = await postShare(new Request("https://erp.example/api/tracking/share", {
      method: "POST",
      headers: { origin: "https://erp.example", host: "erp.example", "content-type": "application/json" },
      body: JSON.stringify({ action: "create", sessionId })
    }));

    expect(mocks.createPublicShare).toHaveBeenCalledWith(actor, sessionId);
    expect(await response.json()).toEqual({ ok: true, session: { id: sessionId }, publicUrl: `https://erp.example/track/${"a".repeat(32)}` });
  });

  it("keeps the authenticated customer endpoint scoped to its actor", async () => {
    mocks.getCustomerOverview.mockResolvedValue({ sessions: [] });
    const response = await getCustomerTracking(new Request("https://erp.example/api/tracking/customer"));
    expect(mocks.getCustomerOverview).toHaveBeenCalledWith(actor);
    expect(await response.json()).toEqual({ ok: true, sessions: [] });

    mocks.getOverview.mockResolvedValue({ canManage: false, jobs: [], sessions: [] });
    const overview = await getWebTracking(new Request("https://erp.example/api/tracking/web"));
    expect(await overview.json()).toEqual({ ok: true, canManage: false, jobs: [], sessions: [] });
  });
});
