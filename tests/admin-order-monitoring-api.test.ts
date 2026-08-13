import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMobileContext: vi.fn(),
  getOverview: vi.fn(),
  getDemoOperationsSnapshot: vi.fn()
}));

vi.mock("@/server/mobile/mobile-api", () => ({
  requireMobileContext: mocks.requireMobileContext,
  mobileError: (error: unknown, fallback: string) => NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : fallback },
    { status: 400 }
  )
}));
vi.mock("@/server/delivery-tracking/runtime", () => ({
  deliveryTrackingService: { getOverview: mocks.getOverview }
}));
vi.mock("@/modules/operations/demo-store", () => ({
  getDemoOperationsSnapshot: mocks.getDemoOperationsSnapshot
}));

import { GET } from "@/app/api/admin/order-monitoring/route";

const actor = { id: "dispatcher-1", role: "dispatcher", displayName: "Điều phối" };

describe("admin order monitoring API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMobileContext.mockResolvedValue({ actor });
  });

  it("rejects an actor who cannot manage delivery tracking before reading orders", async () => {
    mocks.getOverview.mockResolvedValue({ canManage: false, sessions: [] });

    const response = await GET(new Request("https://erp.example/api/admin/order-monitoring"));

    expect(response.status).toBe(400);
    expect(mocks.getDemoOperationsSnapshot).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it("returns only safe order-monitoring fields for an authorized dispatcher", async () => {
    mocks.getOverview.mockResolvedValue({
      canManage: true,
      sessions: [{
        deliveryJobId: "delivery-1",
        status: "active",
        latestPoint: { latitude: 10.1, longitude: 106.2, recordedAt: "2026-07-28T08:00:00.000Z" }
      }]
    });
    mocks.getDemoOperationsSnapshot.mockResolvedValue({
      state: {
        customers: [{ id: "customer-1", displayName: "Công trình Minh Anh", phone: "0988 123 456" }],
        employees: [{ id: "driver-1", displayName: "Nguyễn Văn Nam" }],
        salesOrders: [{
          id: "order-1", documentNo: "SO-2026-0001", orderDate: "2026-07-28T07:00:00.000Z", status: "allocated",
          customerId: "customer-1", lines: [{ unitPrice: 9000000 }]
        }],
        deliveryJobs: [{
          id: "delivery-1", documentNo: "GH-2026-0001", salesOrderId: "order-1", driverId: "driver-1",
          plannedDate: "2026-07-28T10:00:00.000Z", status: "in_transit"
        }]
      }
    });

    const response = await GET(new Request("https://erp.example/api/admin/order-monitoring?limit=10"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.orders[0]).toMatchObject({
      documentNo: "SO-2026-0001",
      customer: { displayName: "Công trình Minh Anh", phone: "0988 123 456" },
      deliveries: [{ documentNo: "GH-2026-0001", driverName: "Nguyễn Văn Nam", trackingStatus: "active", lastLocationAt: "2026-07-28T08:00:00.000Z" }]
    });
    expect(JSON.stringify(payload)).not.toContain("9000000");
    expect(JSON.stringify(payload)).not.toContain("latitude");
    expect(JSON.stringify(payload)).not.toContain("longitude");
  });
});
