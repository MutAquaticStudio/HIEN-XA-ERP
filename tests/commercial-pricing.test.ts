import { describe, expect, it } from "vitest";

import {
  allocateInboundFreightByNetValue,
  calculateMarginAfterDiscount,
  createCommercialTermsSnapshot,
  deriveFulfillmentDueDate,
  derivePromisedDeliveryDate,
  findLatestPostedLandedCost,
  normalizeCommercialDiscount,
  recommendSalePrice,
  requiresMarginOverride,
} from "../src/modules/operations/commercial-pricing";

describe("commercial pricing", () => {
  it("allocates inbound freight by discounted purchase net value with an exact total", () => {
    const allocations = allocateInboundFreightByNetValue([
      { purchaseOrderLineId: "line-a", quantity: 1, unitCost: 100 },
      { purchaseOrderLineId: "line-b", quantity: 1, unitCost: 400, discountAmount: 100 },
    ], 80);

    expect(allocations).toEqual([
      { purchaseOrderLineId: "line-a", allocatedNetAmount: 20 },
      { purchaseOrderLineId: "line-b", allocatedNetAmount: 60 },
    ]);
    expect(allocations.reduce((total, line) => total + line.allocatedNetAmount, 0)).toBe(80);
  });

  it("uses only the latest posted receipt and includes discount plus allocated freight", () => {
    const latest = findLatestPostedLandedCost([
      {
        productUnitId: "product-a",
        sourceDocument: "PO-OLD",
        sourceLineId: "old-line",
        receivedAt: "2026-07-01T00:00:00.000Z",
        receivedQuantity: 10,
        unitPurchasePrice: 80,
        status: "posted",
      },
      {
        productUnitId: "product-a",
        sourceDocument: "PO-DRAFT",
        sourceLineId: "draft-line",
        receivedAt: "2026-07-28T00:00:00.000Z",
        receivedQuantity: 10,
        unitPurchasePrice: 200,
        status: "draft",
      },
      {
        productUnitId: "product-a",
        sourceDocument: "PO-LATEST",
        sourceLineId: "latest-line",
        receivedAt: "2026-07-27T00:00:00.000Z",
        receivedQuantity: 10,
        unitPurchasePrice: 120,
        lineDiscountAmount: 100,
        freightAllocatedAmount: 40,
        status: "posted",
      },
      {
        productUnitId: "product-a",
        sourceDocument: "PO-REVERSED",
        sourceLineId: "reversed-line",
        receivedAt: "2026-07-29T00:00:00.000Z",
        receivedQuantity: 10,
        unitPurchasePrice: 500,
        status: "reversed",
      },
    ], "product-a");

    expect(latest).toMatchObject({
      sourceDocument: "PO-LATEST",
      landedUnitCost: 114,
    });
  });

  it("normalizes discounts and warns only when the achieved margin is below target", () => {
    const discount = normalizeCommercialDiscount({ kind: "percentage", value: 10 }, 150, 2);
    const margin = calculateMarginAfterDiscount(100, 150, 2, discount);

    expect(discount).toMatchObject({ amount: 30, baseAmount: 300 });
    expect(margin).toBeCloseTo((270 - 200) / 270);
    expect(requiresMarginOverride(margin, 0.3)).toBe(true);
    expect(requiresMarginOverride(margin, 0.2)).toBe(false);
  });

  it("calculates a non-rounded suggested net price from target gross margin", () => {
    expect(recommendSalePrice(100, 0.1)).toEqual({
      landedUnitCost: 100,
      targetMarginRate: 0.1,
      suggestedNetUnitPrice: 111.11,
    });
  });

  it("snapshots fulfillment-based terms and derives dates without changing historic snapshots", () => {
    const terms = createCommercialTermsSnapshot({
      paymentTermDays: 30,
      paymentTermsNote: "Chuyen khoan sau giao hang",
      capturedAt: "2026-07-28T08:00:00.000Z",
    });

    expect(terms).toMatchObject({ dueDateBasis: "fulfillment", paymentTermDays: 30 });
    expect(deriveFulfillmentDueDate("2026-07-30", terms)).toBe("2026-08-29");
    expect(derivePromisedDeliveryDate("2026-07-28", 3)).toBe("2026-07-31");
    expect(derivePromisedDeliveryDate("2026-07-28", undefined)).toBeUndefined();
  });
});
