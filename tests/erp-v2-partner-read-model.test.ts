import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { buildCustomerPortalReadModel, buildSupplierPortalReadModel } from "../src/server/erp-v2/partner-portal-read-model";

describe("ERP V2 partner portal read models", () => {
  it("projects customer fulfillment without warehouse, supplier, COGS, or allocation details", () => {
    const state = createInitialOperationsState();
    state.salesOrders[0]!.lines[0]!.allocations = [{
      id: "private-allocation",
      sourceType: "warehouse",
      warehouseId: "wh-main",
      purchaseOrderLineId: "private-purchase-line",
      allocatedQuantity: 120,
      deliveredQuantity: 20,
      version: 2,
      status: "allocated",
      negativeStockOverrideRequestId: "private-override"
    }];
    state.salesOrders[0]!.lines[0]!.deliveredQuantity = 20;

    const model = buildCustomerPortalReadModel(state, "cus-minh-anh");
    const line = model?.orders[0]?.lines[0];
    const serialized = JSON.stringify(model);

    expect(line).toMatchObject({ orderedQuantity: 120, deliveredQuantity: 20, remainingQuantity: 100 });
    expect(serialized).not.toContain("private-allocation");
    expect(serialized).not.toContain("wh-main");
    expect(serialized).not.toContain("private-purchase-line");
    expect(serialized).not.toContain("private-override");
    expect(serialized).not.toContain("unitCost");
  });

  it("fails closed for another customer identity", () => {
    const model = buildCustomerPortalReadModel(createInitialOperationsState(), "cus-other");
    expect(model).toBeUndefined();
  });

  it("projects only the supplier's own POs, purchase terms, receipt progress, and payments", () => {
    const state = createInitialOperationsState();
    state.purchaseOrders[0]!.supplierAcknowledgements = [{ id: "response-own", status: "available", proposedDeliveryDate: "2026-08-24", note: "Giao buổi sáng", submittedBy: "supplier-a", submittedAt: "2026-08-21T08:00:00.000Z", version: 2 }];
    state.purchaseOrders[0]!.supplierDeliveryNotices = [{ id: "notice-own", lineQuantities: { "po-001-line-cement": 12 }, note: "Xe đang tới", attachments: [], submittedBy: "supplier-a", submittedAt: "2026-08-22T08:00:00.000Z", version: 3 }];
    const supplierA = buildSupplierPortalReadModel(state, "sup-hoang-thach");
    const supplierB = buildSupplierPortalReadModel(state, "sup-cat-da-hai-an");

    expect(supplierA?.orders.every((order) => order.documentNo !== "PO-2026-0002")).toBe(true);
    expect(supplierB?.orders.every((order) => order.documentNo !== "PO-2026-0001")).toBe(true);
    expect(supplierA?.orders[0]?.lines[0]).toHaveProperty("unitCost");
    expect(supplierA?.orders[0]?.latestResponse).toMatchObject({ status: "available", proposedDeliveryDate: "2026-08-24" });
    expect(supplierA?.orders[0]?.deliveryNotices).toMatchObject([{ id: "notice-own", lineQuantities: { "po-001-line-cement": 12 } }]);
    expect(JSON.stringify(supplierA)).not.toContain("unitPrice");
    expect(JSON.stringify(supplierA)).not.toContain("customerLedgerEntries");
  });
});
