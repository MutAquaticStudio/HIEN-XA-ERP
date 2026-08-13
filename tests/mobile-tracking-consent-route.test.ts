import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireNativeMobileContext: vi.fn(),
  grantConsent: vi.fn(),
  revokeConsent: vi.fn()
}));

vi.mock("@/server/mobile/mobile-api", () => ({
  requireNativeMobileContext: mocks.requireNativeMobileContext,
  mobileError: (error: unknown, fallback: string) => {
    const value = error as { status?: number; message?: string };
    return NextResponse.json({ ok: false, error: value.message ?? fallback }, { status: value.status ?? 500 });
  }
}));
vi.mock("@/server/delivery-tracking/runtime", () => ({
  deliveryTrackingService: { grantConsent: mocks.grantConsent, revokeConsent: mocks.revokeConsent }
}));

import { POST } from "@/app/api/mobile/tracking/consent/route";

describe("native tracking consent route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 before parsing or invoking the consent service when Bearer authentication is absent", async () => {
    mocks.requireNativeMobileContext.mockRejectedValue({ status: 401, message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
    const response = await POST(new Request("https://erp.example.test/api/mobile/tracking/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "grant" })
    }));
    expect(response.status).toBe(401);
    expect(mocks.grantConsent).not.toHaveBeenCalled();
  });

  it("passes a valid grant only for the authenticated native actor", async () => {
    const actor = { id: "driver-1", role: "driver", employeeId: "employee-1" };
    mocks.requireNativeMobileContext.mockResolvedValue({ actor });
    mocks.grantConsent.mockResolvedValue({ created: true, consent: { id: "11111111-1111-4111-8111-111111111111", version: 1 } });
    const input = { action: "grant", deliveryJobId: "delivery-1", policyVersion: "2026-07-29", idempotencyKey: "gps-consent-route-0001" };
    const response = await POST(new Request("https://erp.example.test/api/mobile/tracking/consent", {
      method: "POST",
      headers: { authorization: "Bearer native-token", "content-type": "application/json" },
      body: JSON.stringify(input)
    }));
    expect(response.status).toBe(200);
    expect(mocks.grantConsent).toHaveBeenCalledWith(actor, input);
  });

  it("keeps assignment and role denial at 403 without changing consent", async () => {
    mocks.requireNativeMobileContext.mockResolvedValue({ actor: { id: "worker-1", role: "worker" } });
    mocks.grantConsent.mockRejectedValue({ status: 403, message: "Chỉ tài xế được phân công mới được xác nhận GPS cho chuyến giao này." });
    const response = await POST(new Request("https://erp.example.test/api/mobile/tracking/consent", {
      method: "POST",
      headers: { authorization: "Bearer native-token", "content-type": "application/json" },
      body: JSON.stringify({ action: "grant", deliveryJobId: "delivery-1", policyVersion: "2026-07-29", idempotencyKey: "gps-consent-forbidden-0001" })
    }));
    expect(response.status).toBe(403);
  });
});
