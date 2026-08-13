import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicApiError } from "@/server/shared/public-api-error";

const mocks = vi.hoisted(() => ({
  requireNativeMobileContext: vi.fn(),
  getMobileInventoryOverview: vi.fn(),
  getMobileInventoryStockDetail: vi.fn(),
  runMobileGoodsReceiptAction: vi.fn(),
  submitMobileGoodsReceipt: vi.fn(),
  runMobileInventoryTransfer: vi.fn(),
  runMobileInventoryCountAdjustment: vi.fn(),
  runMobileInventoryMovementReversal: vi.fn(),
  getMobileDeliveryOverview: vi.fn(),
  runMobileDeliveryWorkflow: vi.fn(),
  runMobileDeliveryQuantityChange: vi.fn(),
  runMobileDeliveryQuantityChangeApproval: vi.fn(),
  runMobileDeliveryCompletionApproval: vi.fn()
}));

vi.mock("@/server/mobile/mobile-api", () => ({
  requireNativeMobileContext: mocks.requireNativeMobileContext,
  mobileError: (error: unknown, fallback: string) => NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : fallback },
    { status: error instanceof PublicApiError ? error.status : 400 }
  )
}));

vi.mock("@/server/mobile/mobile-inventory-delivery-service", () => ({
  getMobileInventoryOverview: mocks.getMobileInventoryOverview,
  getMobileInventoryStockDetail: mocks.getMobileInventoryStockDetail,
  runMobileGoodsReceiptAction: mocks.runMobileGoodsReceiptAction,
  submitMobileGoodsReceipt: mocks.submitMobileGoodsReceipt,
  runMobileInventoryTransfer: mocks.runMobileInventoryTransfer,
  runMobileInventoryCountAdjustment: mocks.runMobileInventoryCountAdjustment,
  runMobileInventoryMovementReversal: mocks.runMobileInventoryMovementReversal,
  getMobileDeliveryOverview: mocks.getMobileDeliveryOverview,
  runMobileDeliveryWorkflow: mocks.runMobileDeliveryWorkflow,
  runMobileDeliveryQuantityChange: mocks.runMobileDeliveryQuantityChange,
  runMobileDeliveryQuantityChangeApproval: mocks.runMobileDeliveryQuantityChangeApproval,
  runMobileDeliveryCompletionApproval: mocks.runMobileDeliveryCompletionApproval
}));

import { GET as inventoryOverview } from "@/app/api/mobile/inventory/overview/route";
import { POST as inventoryTransfer } from "@/app/api/mobile/inventory/transfers/route";
import { GET as deliveryJob } from "@/app/api/mobile/delivery/jobs/route";
import { POST as deliveryWorkflow } from "@/app/api/mobile/delivery/workflow/route";
import { POST as quantityChange } from "@/app/api/mobile/delivery/quantity-change/route";

const context = {
  user: { id: "warehouse-user", role: "warehouse", moduleIds: ["inventory", "delivery"] },
  actor: { id: "warehouse-user", role: "warehouse", permissions: ["inventory.post_transfer", "delivery.start_loading"] }
};

describe("bounded mobile inventory and delivery routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireNativeMobileContext.mockResolvedValue(context);
  });

  it("loads inventory overview only through the native context", async () => {
    mocks.getMobileInventoryOverview.mockResolvedValue({ revision: 7, stock: [] });
    const response = await inventoryOverview(new Request("https://erp.example.test/api/mobile/inventory/overview", { headers: { authorization: "Bearer native" } }));
    expect(response.status).toBe(200);
    expect(mocks.getMobileInventoryOverview).toHaveBeenCalledWith(context.user);
    await expect(response.json()).resolves.toEqual({ ok: true, revision: 7, stock: [] });
  });

  it("passes a bounded transfer request to the inventory service", async () => {
    mocks.runMobileInventoryTransfer.mockResolvedValue({ summary: "Đã chuyển kho." });
    const payload = { idempotencyKey: "native-transfer-0001", sourceWarehouseId: "wh-a", destinationWarehouseId: "wh-b", productUnitId: "product-a", quantity: 4, reason: "Điều chuyển phục vụ giao hàng" };
    const response = await inventoryTransfer(new Request("https://erp.example.test/api/mobile/inventory/transfers", { method: "POST", headers: { authorization: "Bearer native", "content-type": "application/json" }, body: JSON.stringify(payload) }));
    expect(mocks.runMobileInventoryTransfer).toHaveBeenCalledWith(context.user, context.actor, payload);
    await expect(response.json()).resolves.toEqual({ ok: true, summary: "Đã chuyển kho." });
  });

  it("loads only the requested delivery job detail", async () => {
    mocks.getMobileDeliveryOverview.mockResolvedValue({ jobs: [{ id: "job-1" }] });
    const response = await deliveryJob(new Request("https://erp.example.test/api/mobile/delivery/jobs?jobId=job-1", { headers: { authorization: "Bearer native" } }));
    expect(mocks.getMobileDeliveryOverview).toHaveBeenCalledWith(context.user, "job-1");
    await expect(response.json()).resolves.toEqual({ ok: true, jobs: [{ id: "job-1" }] });
  });

  it("keeps workflow transitions and discrepancy requests as separate bounded commands", async () => {
    mocks.runMobileDeliveryWorkflow.mockResolvedValue({ summary: "Đã xuất bến." });
    mocks.runMobileDeliveryQuantityChange.mockResolvedValue({ summary: "Đã báo chênh lệch." });
    const workflowPayload = { action: "start_loading", idempotencyKey: "native-loading-0001", deliveryJobId: "job-1" };
    const workflowResponse = await deliveryWorkflow(new Request("https://erp.example.test/api/mobile/delivery/workflow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(workflowPayload) }));
    expect(mocks.runMobileDeliveryWorkflow).toHaveBeenCalledWith(context.user, context.actor, workflowPayload);
    expect(workflowResponse.status).toBe(200);

    const discrepancyPayload = { idempotencyKey: "native-discrepancy-0001", deliveryJobId: "job-1", reason: "Thiếu hàng tại điểm giao", reportedLines: [{ lineId: "line-1", quantity: 0 }] };
    const discrepancyResponse = await quantityChange(new Request("https://erp.example.test/api/mobile/delivery/quantity-change", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(discrepancyPayload) }));
    expect(mocks.runMobileDeliveryQuantityChange).toHaveBeenCalledWith(context.user, context.actor, discrepancyPayload);
    expect(mocks.runMobileDeliveryQuantityChangeApproval).not.toHaveBeenCalled();
    expect(discrepancyResponse.status).toBe(200);
  });

  it("returns the native authentication boundary status without invoking a service", async () => {
    mocks.requireNativeMobileContext.mockRejectedValue(new PublicApiError(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn."));
    const response = await inventoryOverview(new Request("https://erp.example.test/api/mobile/inventory/overview"));
    expect(response.status).toBe(401);
    expect(mocks.getMobileInventoryOverview).not.toHaveBeenCalled();
  });
});
