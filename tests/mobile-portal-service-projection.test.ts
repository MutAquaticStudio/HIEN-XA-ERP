import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import type { SafeIdentityUser } from "@/server/identity/types";

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn()
}));

vi.mock("@/modules/operations/demo-store", () => ({
  getDemoOperationsSnapshot: mocks.getSnapshot
}));

import { getMobilePortalOverview } from "@/server/mobile/mobile-portal-service";

function snapshot(state = createInitialOperationsState()) {
  return {
    state,
    revision: 7,
    syncedAt: "2026-07-30T01:00:00.000Z",
    source: "memory" as const
  };
}

function portalUser(role: "customer" | "supplier", partyId: string): SafeIdentityUser {
  return {
    id: `${role}-user`,
    email: `${role}@example.test`,
    normalizedEmail: `${role}@example.test`,
    displayName: role,
    role,
    ...(role === "customer" ? { customerId: partyId } : { supplierId: partyId }),
    moduleIds: ["overview"],
    status: "active",
    createdAt: "2026-07-30T01:00:00.000Z",
    updatedAt: "2026-07-30T01:00:00.000Z",
    failedLoginAttempts: 0,
    sessionVersion: 1
  };
}

type LabeledLine = {
  productUnitId: string;
  productName?: string;
  unitName?: string;
};

describe("mobile portal document line projections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds only safe product and unit labels to the signed-in customer's own order lines", async () => {
    const state = createInitialOperationsState();
    const sourceOrder = state.salesOrders[0];
    const sourceLine = sourceOrder?.lines[0];
    const sourceProduct = state.productUnits.find((product) => product.id === sourceLine?.productUnitId);
    if (!sourceOrder || !sourceLine || !sourceProduct) throw new Error("Sample customer sales order is required for this regression test.");
    mocks.getSnapshot.mockResolvedValue(snapshot(state));

    const overview = await getMobilePortalOverview(portalUser("customer", sourceOrder.customerId));
    const projectedOrder = overview.state.salesOrders.find((order) => order.id === sourceOrder.id);
    const projectedLine = projectedOrder?.lines.find((line) => line.productUnitId === sourceLine.productUnitId) as LabeledLine | undefined;
    const projectedProduct = overview.state.productUnits.find((product) => product.id === sourceProduct.id);

    expect(overview.state.salesOrders.every((order) => order.customerId === sourceOrder.customerId)).toBe(true);
    expect(projectedLine).toMatchObject({
      productUnitId: sourceProduct.id,
      productName: sourceProduct.productName,
      unitName: sourceProduct.unitName
    });
    expect(overview.state.inventoryMovements).toEqual([]);
    expect(projectedProduct).toBeDefined();
    expect(projectedProduct).not.toHaveProperty("targetMarginRate");
    expect(projectedProduct).not.toHaveProperty("priceHistory");
    expect(projectedProduct).not.toHaveProperty("reorderPolicies");
  });

  it("adds only safe product and unit labels to the signed-in supplier's own PO lines", async () => {
    const state = createInitialOperationsState();
    const sourceOrder = state.purchaseOrders[0];
    const sourceLine = sourceOrder?.lines[0];
    const sourceProduct = state.productUnits.find((product) => product.id === sourceLine?.productUnitId);
    if (!sourceOrder || !sourceLine || !sourceProduct) throw new Error("Sample supplier purchase order is required for this regression test.");
    mocks.getSnapshot.mockResolvedValue(snapshot(state));

    const overview = await getMobilePortalOverview(portalUser("supplier", sourceOrder.supplierId));
    const projectedOrder = overview.state.purchaseOrders.find((order) => order.id === sourceOrder.id);
    const projectedLine = projectedOrder?.lines.find((line) => line.productUnitId === sourceLine.productUnitId) as LabeledLine | undefined;
    const projectedProduct = overview.state.productUnits.find((product) => product.id === sourceProduct.id);

    expect(overview.state.purchaseOrders.every((order) => order.supplierId === sourceOrder.supplierId)).toBe(true);
    expect(projectedLine).toMatchObject({
      productUnitId: sourceProduct.id,
      productName: sourceProduct.productName,
      unitName: sourceProduct.unitName
    });
    expect(overview.state.inventoryMovements).toEqual([]);
    expect(projectedProduct).toBeDefined();
    expect(projectedProduct).not.toHaveProperty("salePrice");
    expect(projectedProduct).not.toHaveProperty("targetMarginRate");
    expect(projectedProduct).not.toHaveProperty("priceHistory");
    expect(projectedProduct).not.toHaveProperty("reorderPolicies");
  });
});
