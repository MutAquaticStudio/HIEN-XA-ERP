import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { projectOperationsState } from "../src/server/identity/operations-projection";
import type { SafeIdentityUser } from "../src/server/identity/types";

const now = "2026-07-29T08:00:00.000Z";

function identity(overrides: Partial<SafeIdentityUser>): SafeIdentityUser {
  return {
    id: "pilot-user",
    email: "pilot@example.test",
    normalizedEmail: "pilot@example.test",
    displayName: "Pilot User",
    role: "viewer",
    moduleIds: ["overview"],
    status: "active",
    createdAt: now,
    updatedAt: now,
    failedLoginAttempts: 0,
    sessionVersion: 1,
    ...overrides
  };
}

function expectInternalCommercialFieldsHidden(product: Record<string, unknown>) {
  expect(product).not.toHaveProperty("salePrice");
  expect(product).not.toHaveProperty("saleTaxRate");
  expect(product).not.toHaveProperty("targetMarginRate");
  expect(product).not.toHaveProperty("standardLeadTimeDays");
  expect(product).not.toHaveProperty("reorderPolicies");
  expect(product).not.toHaveProperty("priceHistory");
}

describe("pilot role projection hardening", () => {
  it("does not disclose retail pricing or commercial history to a driver", () => {
    const projected = projectOperationsState(createInitialOperationsState(), identity({
      role: "driver",
      displayName: "Lê Văn Dũng",
      employeeId: "emp-driver-dung",
      moduleIds: ["overview", "delivery"]
    }));

    expect(projected.productUnits.length).toBeGreaterThan(0);
    projected.productUnits.forEach((product) => expectInternalCommercialFieldsHidden(product));
    expect(projected.salesOrders.every((order) => order.lines.every((line) => line.unitPrice === 0))).toBe(true);
  });

  it("does not disclose retail pricing, reorder policy, or price history to a worker", () => {
    const projected = projectOperationsState(createInitialOperationsState(), identity({
      role: "worker",
      displayName: "Nguyễn Văn Nam",
      employeeId: "emp-worker-nam",
      moduleIds: ["overview", "procurement", "delivery", "workforce"]
    }));

    expect(projected.productUnits.length).toBeGreaterThan(0);
    projected.productUnits.forEach((product) => expectInternalCommercialFieldsHidden(product));
    expect(projected.salesOrders.every((order) => order.lines.every((line) => line.unitPrice === 0 && line.taxRate === 0))).toBe(true);
  });

  it("shows a supplier only the agreed purchase-order price, never the store retail price", () => {
    const projected = projectOperationsState(createInitialOperationsState(), identity({
      role: "supplier",
      supplierId: "sup-hoang-thach",
      moduleIds: ["overview"]
    }));

    expect(projected.purchaseOrders.length).toBeGreaterThan(0);
    expect(projected.purchaseOrders.every((order) => order.lines.every((line) => line.unitCost > 0))).toBe(true);
    projected.productUnits.forEach((product) => expectInternalCommercialFieldsHidden(product));
  });

  it("keeps the public sale price available to the customer who is ordering", () => {
    const projected = projectOperationsState(createInitialOperationsState(), identity({
      role: "customer",
      customerId: "cus-minh-anh",
      moduleIds: ["overview"]
    }));

    expect(projected.productUnits.length).toBeGreaterThan(0);
    expect(projected.productUnits.some((product) => product.salePrice !== undefined)).toBe(true);
    projected.productUnits.forEach((product) => {
      expect(product).not.toHaveProperty("targetMarginRate");
      expect(product).not.toHaveProperty("priceHistory");
    });
  });
});
