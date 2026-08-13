import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMobileContext: vi.fn(),
  notificationSubscribe: vi.fn(),
  notificationUnsubscribe: vi.fn(),
  notificationStatus: vi.fn(),
  snapshot: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  touchPartnerPresence: vi.fn(),
  listOnlineParties: vi.fn(),
  trackingStart: vi.fn(),
  trackingStop: vi.fn(),
  trackingOverview: vi.fn()
}));

vi.mock("@/server/mobile/mobile-api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireMobileContext: mocks.requireMobileContext,
    requireNativeMobileContext: mocks.requireMobileContext,
    mobileError: (error: unknown, fallback: string) => NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : fallback },
      { status: 400 }
    )
  };
});

vi.mock("@/server/notifications/runtime", () => ({
  notificationService: {
    subscribe: mocks.notificationSubscribe,
    unsubscribe: mocks.notificationUnsubscribe,
    getSubscriptionStatus: mocks.notificationStatus
  }
}));

vi.mock("@/modules/operations/demo-store", () => ({ getDemoOperationsSnapshot: mocks.snapshot }));
vi.mock("@/server/communications/runtime", () => ({
  communicationService: {
    listMessages: mocks.listMessages,
    sendMessage: mocks.sendMessage,
    touchPartnerPresence: mocks.touchPartnerPresence,
    listOnlineParties: mocks.listOnlineParties
  }
}));
vi.mock("@/server/delivery-tracking/runtime", () => ({
  deliveryTrackingService: {
    start: mocks.trackingStart,
    stop: mocks.trackingStop,
    getOverview: mocks.trackingOverview
  }
}));

import { DELETE as deleteSubscription, POST as postSubscription } from "@/app/api/notifications/subscription/route";
import { POST as postMessage } from "@/app/api/communications/messages/route";
import { GET as getPresence, POST as postPresence } from "@/app/api/communications/presence/route";
import { POST as postTracking } from "@/app/api/mobile/tracking/route";

const user = { id: "customer-user", role: "customer", customerId: "cus-minh-anh" };
const actor = { id: "driver-user", role: "driver", displayName: "Tài xế" };

describe("partner and mobile API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMobileContext.mockResolvedValue({ user, actor });
    mocks.snapshot.mockResolvedValue({ state: { salesOrders: [] } });
  });

  it("rejects cross-origin push subscription mutations before using the session", async () => {
    const response = await postSubscription(new Request("https://erp.example/api/notifications/subscription", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ channel: "expo", endpoint: "ExpoPushToken[valid-token]" })
    }));

    expect(response.status).toBe(400);
    expect(mocks.requireMobileContext).not.toHaveBeenCalled();
    expect(mocks.notificationSubscribe).not.toHaveBeenCalled();
  });

  it("accepts a valid same-origin Web Push subscription without returning endpoint keys", async () => {
    mocks.notificationSubscribe.mockResolvedValue({ id: "subscription-1", channel: "web", endpoint: "https://push.example/secret" });
    const response = await postSubscription(new Request("https://erp.example/api/notifications/subscription", {
      method: "POST",
      headers: { origin: "https://erp.example", "content-type": "application/json" },
      body: JSON.stringify({ channel: "web", endpoint: "https://push.example/customer", keys: { p256dh: "a".repeat(16), auth: "b".repeat(8) } })
    }));

    expect(response.status).toBe(200);
    expect(mocks.notificationSubscribe).toHaveBeenCalledWith(user, {
      channel: "web", endpoint: "https://push.example/customer", p256dh: "a".repeat(16), auth: "b".repeat(8)
    });
    expect(await response.json()).toEqual({ ok: true, subscription: { id: "subscription-1", channel: "web" } });
  });

  it("validates unsubscribe payloads and does not invoke the service on malformed input", async () => {
    const response = await deleteSubscription(new Request("https://erp.example/api/notifications/subscription", {
      method: "DELETE",
      headers: { origin: "https://erp.example", "content-type": "application/json" },
      body: JSON.stringify({ channel: "web", endpoint: "short" })
    }));

    expect(response.status).toBe(400);
    expect(mocks.notificationUnsubscribe).not.toHaveBeenCalled();
  });

  it("rejects cross-origin partner messages and forwards a valid idempotent customer message", async () => {
    const crossOrigin = await postMessage(new Request("https://erp.example/api/communications/messages", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ partyType: "customer", body: "Xin chào", idempotencyKey: "message-key-001" })
    }));
    expect(crossOrigin.status).toBe(400);
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    mocks.sendMessage.mockResolvedValue({ message: { id: "message-1" } });
    const response = await postMessage(new Request("https://erp.example/api/communications/messages", {
      method: "POST",
      headers: { origin: "https://erp.example", "content-type": "application/json" },
      body: JSON.stringify({ partyType: "customer", body: "Xin chào", idempotencyKey: "message-key-001" })
    }));

    expect(response.status).toBe(200);
    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      user,
      partyType: "customer",
      requestedPartyId: undefined,
      idempotencyKey: "message-key-001"
    }));
  });

  it("only tracks a partner presence after same-origin verification and returns no account details to the owner", async () => {
    const crossOrigin = await postPresence(new Request("https://erp.example/api/communications/presence", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: "{}"
    }));
    expect(crossOrigin.status).toBe(400);
    expect(mocks.touchPartnerPresence).not.toHaveBeenCalled();

    mocks.touchPartnerPresence.mockResolvedValue({ tracked: true });
    const update = await postPresence(new Request("https://erp.example/api/communications/presence", {
      method: "POST",
      headers: { origin: "https://erp.example", "content-type": "application/json" },
      body: "{}"
    }));
    expect(update.status).toBe(200);
    expect(mocks.touchPartnerPresence).toHaveBeenCalledWith(user, { salesOrders: [] });

    mocks.listOnlineParties.mockResolvedValue({ onlinePartyKeys: ["customer:cus-minh-anh"] });
    const list = await getPresence(new Request("https://erp.example/api/communications/presence"));
    expect(await list.json()).toEqual({ ok: true, onlinePartyKeys: ["customer:cus-minh-anh"] });
  });

  it("starts tracking without creating a public customer URL", async () => {
    mocks.trackingStart.mockResolvedValue({ session: { id: "session-1", status: "active" }, publicToken: "opaque-public-token" });
    const response = await postTracking(new Request("https://erp.example/api/mobile/tracking", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://erp.example", host: "erp.example" },
      body: JSON.stringify({ action: "start", deliveryJobId: "delivery-1" })
    }));

    expect(mocks.trackingStart).toHaveBeenCalledWith(actor, "delivery-1");
    expect(await response.json()).toEqual({
      ok: true,
      session: { id: "session-1", status: "active" }
    });
  });
});
