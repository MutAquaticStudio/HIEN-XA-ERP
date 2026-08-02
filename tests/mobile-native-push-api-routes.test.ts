import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireNativeMobileContext: vi.fn(),
  requireMobileContext: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn()
}));

vi.mock("@/server/mobile/mobile-api", () => ({
  requireNativeMobileContext: mocks.requireNativeMobileContext,
  requireMobileContext: mocks.requireMobileContext,
  mobileError: (error: unknown, fallback: string) => NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : fallback },
    { status: error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 400 }
  )
}));

vi.mock("@/server/notifications/runtime", () => ({
  notificationService: { subscribe: mocks.subscribe, unsubscribe: mocks.unsubscribe }
}));

import { DELETE, POST } from "@/app/api/mobile/notifications/subscription/route";

const user = { id: "worker-1", role: "worker" };
const endpoint = "ExpoPushToken[device-token-123456789]";

describe("native push subscription route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireNativeMobileContext.mockResolvedValue({ user });
  });

  it("uses the Bearer-only native boundary when registering an Expo device", async () => {
    mocks.subscribe.mockResolvedValue({ id: "push-1", channel: "expo" });

    const response = await POST(new Request("https://erp.example/api/mobile/notifications/subscription", {
      method: "POST",
      headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
      body: JSON.stringify({ channel: "expo", endpoint })
    }));

    expect(response.status).toBe(200);
    expect(mocks.requireNativeMobileContext).toHaveBeenCalledTimes(1);
    expect(mocks.requireMobileContext).not.toHaveBeenCalled();
    expect(mocks.subscribe).toHaveBeenCalledWith(user, { channel: "expo", endpoint });
    expect(await response.json()).toEqual({ ok: true, subscription: { id: "push-1", channel: "expo" } });
  });

  it("does not subscribe malformed tokens", async () => {
    const response = await POST(new Request("https://erp.example/api/mobile/notifications/subscription", {
      method: "POST",
      headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
      body: JSON.stringify({ channel: "expo", endpoint: "invalid" })
    }));

    expect(response.status).toBe(400);
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("removes only the authenticated device subscription", async () => {
    mocks.unsubscribe.mockResolvedValue(true);

    const response = await DELETE(new Request("https://erp.example/api/mobile/notifications/subscription", {
      method: "DELETE",
      headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
      body: JSON.stringify({ channel: "expo", endpoint })
    }));

    expect(response.status).toBe(200);
    expect(mocks.unsubscribe).toHaveBeenCalledWith(user, { channel: "expo", endpoint });
    expect(await response.json()).toEqual({ ok: true, removed: true });
  });
});
