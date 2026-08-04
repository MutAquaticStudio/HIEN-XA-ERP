import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicApiError } from "@/server/shared/public-api-error";

const mocks = vi.hoisted(() => ({
  requireNativeMobileContext: vi.fn(),
  getMobileInventoryCountSessions: vi.fn(),
  runMobileInventoryCountSession: vi.fn(),
  submitMobileInventoryCountLine: vi.fn()
}));

vi.mock("@/server/mobile/mobile-api", () => ({
  requireNativeMobileContext: mocks.requireNativeMobileContext,
  mobileError: (error: unknown, fallback: string) => NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : fallback },
    { status: error instanceof PublicApiError ? error.status : 500 }
  )
}));

vi.mock("@/server/mobile/mobile-inventory-delivery-service", () => ({
  getMobileInventoryCountSessions: mocks.getMobileInventoryCountSessions,
  runMobileInventoryCountSession: mocks.runMobileInventoryCountSession,
  submitMobileInventoryCountLine: mocks.submitMobileInventoryCountLine
}));

import { GET, POST } from "@/app/api/mobile/inventory/count-sessions/route";

const context = { user: { id: "warehouse-user", role: "warehouse" }, actor: { id: "warehouse-user", role: "warehouse", permissions: ["inventory.create_count_session"], warehouseIds: ["wh-main"] } };

describe("mobile inventory count-session route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireNativeMobileContext.mockResolvedValue(context);
  });

  it("returns 401 before calling the service when bearer authentication is missing", async () => {
    mocks.requireNativeMobileContext.mockRejectedValue(new PublicApiError(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn."));
    const response = await GET(new Request("https://erp.test/api/mobile/inventory/count-sessions"));
    expect(response.status).toBe(401);
    expect(mocks.getMobileInventoryCountSessions).not.toHaveBeenCalled();
  });

  it("uses the bounded JSON command service", async () => {
    mocks.runMobileInventoryCountSession.mockResolvedValue({ summary: "Đã tạo phiếu kiểm kê." });
    const response = await POST(new Request("https://erp.test/api/mobile/inventory/count-sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create" }) }));
    expect(response.status).toBe(200);
    expect(mocks.runMobileInventoryCountSession).toHaveBeenCalledWith(context.user, context.actor, { action: "create" });
  });

  it("routes multipart line evidence to the private upload command", async () => {
    mocks.submitMobileInventoryCountLine.mockResolvedValue({ summary: "Đã lưu số đếm." });
    const data = new FormData();
    data.set("sessionId", "kks-1");
    const response = await POST(new Request("https://erp.test/api/mobile/inventory/count-sessions", { method: "POST", body: data }));
    expect(response.status).toBe(200);
    expect(mocks.submitMobileInventoryCountLine).toHaveBeenCalledOnce();
  });
});
