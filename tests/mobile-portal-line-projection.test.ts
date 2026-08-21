import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import type { SafeIdentityUser } from "../src/server/identity/types";

const mocks = vi.hoisted(() => ({
  getErpV2Snapshot: vi.fn()
}));

vi.mock("@/server/erp-v2/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/erp-v2/runtime")>()),
  getErpV2Snapshot: mocks.getErpV2Snapshot
}));

import { getMobilePortalOverview } from "@/server/mobile/mobile-portal-service";

const now = "2026-07-29T00:00:00.000Z";

describe("mobile portal document line projection", () => {
  beforeEach(() => {
    mocks.getErpV2Snapshot.mockResolvedValue({
      state: createInitialOperationsState(),
      revision: 1,
      syncedAt: now,
      source: "memory"
    });
  });

  it("adds display-safe catalog labels only to the signed-in customer's own sales-order lines", async () => {
    const overview = await getMobilePortalOverview(identity({
      role: "customer",
      customerId: "cus-minh-anh",
      moduleIds: []
    }));
    const line = overview.state.salesOrders[0]?.lines[0];
    const catalogProduct = overview.state.productUnits.find((product) => product.id === line?.productUnitId);

    expect(overview.state.salesOrders).toHaveLength(1);
    expect(line).toMatchObject({
      productName: catalogProduct?.productName,
      unitName: catalogProduct?.unitName
    });
    expect(line).not.toHaveProperty("unitCost");
    expect(overview.state.productUnits.every((product) => product.targetMarginRate === undefined)).toBe(true);
  });

  it("adds display-safe catalog labels only to the signed-in supplier's own purchase-order lines", async () => {
    const overview = await getMobilePortalOverview(identity({
      role: "supplier",
      supplierId: "sup-hoang-thach",
      moduleIds: []
    }));
    const line = overview.state.purchaseOrders[0]?.lines[0];
    const catalogProduct = overview.state.productUnits.find((product) => product.id === line?.productUnitId);

    expect(overview.state.purchaseOrders).toHaveLength(1);
    expect(line).toMatchObject({
      productName: catalogProduct?.productName,
      unitName: catalogProduct?.unitName
    });
    expect(line).not.toHaveProperty("salePrice");
    expect(overview.state.productUnits.every((product) => product.salePrice === undefined && product.targetMarginRate === undefined)).toBe(true);
  });
});

function identity(overrides: Partial<SafeIdentityUser>): SafeIdentityUser {
  return {
    id: "mobile-portal-user",
    email: "mobile.portal@example.test",
    normalizedEmail: "mobile.portal@example.test",
    displayName: "Mobile Portal",
    role: "customer",
    moduleIds: [],
    status: "active",
    createdAt: now,
    updatedAt: now,
    failedLoginAttempts: 0,
    sessionVersion: 1,
    ...overrides
  };
}
