import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireNativeMobileContext: vi.fn(),
  getSnapshot: vi.fn(),
  readAttachment: vi.fn()
}));

vi.mock("@/server/mobile/mobile-api", () => ({
  requireNativeMobileContext: mocks.requireNativeMobileContext,
  mobileError: (error: unknown, fallback: string) => {
    const value = error as { status?: number; message?: string };
    return NextResponse.json({ ok: false, error: value.message ?? fallback }, { status: value.status ?? 500 });
  }
}));
vi.mock("@/modules/operations/demo-store", () => ({ getDemoOperationsSnapshot: mocks.getSnapshot }));
vi.mock("@/server/infrastructure/operations-attachment-store", () => ({ readOperationsDocumentImage: mocks.readAttachment }));

import { GET } from "@/app/api/mobile/attachments/[id]/route";

const attachment = {
  id: "11111111-1111-4111-8111-111111111111",
  fileName: "bang-chung.png",
  contentType: "image/png",
  size: 3,
  sha256: "a".repeat(64),
  uploadedBy: "customer-1",
  uploadedAt: "2026-08-01T10:00:00.000Z"
};

function snapshot(financial = false) {
  return { state: {
    approvalRequests: financial ? [] : [{ submittedBy: "customer-1", attachments: [attachment] }],
    salesOrders: [], purchaseOrders: [], deliveryJobs: [],
    bankTransferProofs: financial ? [{ attachments: [attachment] }] : [],
    customerPaymentProofRequests: []
  } };
}

describe("native private attachment route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSnapshot.mockResolvedValue(snapshot());
    mocks.readAttachment.mockResolvedValue(Buffer.from([1, 2, 3]));
  });

  it("returns 401 before it looks up attachment metadata without a Bearer identity", async () => {
    mocks.requireNativeMobileContext.mockRejectedValue({ status: 401, message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
    const response = await request();
    expect(response.status).toBe(401);
    expect(mocks.getSnapshot).not.toHaveBeenCalled();
  });

  it("does not allow a different worker to read an uploader-owned private attachment", async () => {
    mocks.requireNativeMobileContext.mockResolvedValue({ user: { id: "worker-1", role: "worker" } });
    const response = await request();
    expect(response.status).toBe(403);
    expect(mocks.readAttachment).not.toHaveBeenCalled();
  });

  it("allows an uploader to download their own non-financial attachment with no-store headers", async () => {
    mocks.requireNativeMobileContext.mockResolvedValue({ user: { id: "customer-1", role: "customer" } });
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
  });

  it("allows the assigned driver, delivery customer, and dispatcher to view a delivery attachment", async () => {
    mocks.getSnapshot.mockResolvedValue({ state: {
      approvalRequests: [],
      salesOrders: [{ id: "sales-1", customerId: "customer-1" }],
      purchaseOrders: [],
      deliveryJobs: [{ id: "delivery-1", salesOrderId: "sales-1", driverId: "driver-1", helperIds: ["worker-1"], completionAttachments: [attachment] }],
      bankTransferProofs: [],
      customerPaymentProofRequests: []
    } });

    for (const user of [
      { id: "driver-user", role: "driver", employeeId: "driver-1" },
      { id: "customer-user", role: "customer", customerId: "customer-1" },
      { id: "dispatcher-user", role: "dispatcher" }
    ]) {
      mocks.requireNativeMobileContext.mockResolvedValue({ user });
      const response = await request();
      expect(response.status).toBe(200);
    }
  });

  it("keeps financial proofs limited to finance roles", async () => {
    mocks.getSnapshot.mockResolvedValue(snapshot(true));
    mocks.requireNativeMobileContext.mockResolvedValue({ user: { id: "customer-1", role: "customer" } });
    const response = await request();
    expect(response.status).toBe(403);
    expect(mocks.readAttachment).not.toHaveBeenCalled();
  });
});

function request() {
  return GET(new Request("https://erp.example.test/api/mobile/attachments/" + attachment.id, { headers: { authorization: "Bearer native-token" } }), {
    params: Promise.resolve({ id: attachment.id })
  });
}
