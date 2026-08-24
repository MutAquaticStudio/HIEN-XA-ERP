import { describe, expect, it } from "vitest";
import { runCreateCommand } from "@/modules/operations/create-commands";
import { createRoleActor, runOperation } from "@/modules/operations/commands";
import { buildCustomerOrderCatalog } from "@/modules/operations/customer-order-catalog";
import {
  assertCompleteProductPricing,
  calculateMarkupRate,
  calculateSalePrice,
  priceForDocumentUnit,
  productProfitAmount
} from "@/modules/operations/product-pricing";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import { projectOperationsState } from "@/server/identity/operations-projection";
import { MutationIntentRegistry } from "@/components/erp-v2/mutation-intent-registry";
import type { SafeIdentityUser } from "@/server/identity/types";

const now = "2026-08-24T10:00:00.000+07:00";
const owner = createRoleActor("owner");

function identity(overrides: Partial<SafeIdentityUser>): SafeIdentityUser {
  return {
    id: "pricing-user",
    email: "pricing@example.test",
    normalizedEmail: "pricing@example.test",
    displayName: "Pricing User",
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

describe("product purchase price, markup, and sale price", () => {
  it("calculates markup as uplift, not gross margin, in both directions", () => {
    expect(calculateSalePrice(100_000, 15)).toBe(115_000);
    expect(calculateMarkupRate(100_000, 115_000)).toBe(15);
    expect(productProfitAmount({ purchasePrice: 100_000, markupRate: 15, salePrice: 115_000 })).toBe(15_000);
  });

  it("handles a zero purchase price without NaN, Infinity, or hidden inconsistency", () => {
    expect(calculateSalePrice(0, 15)).toBe(0);
    expect(calculateMarkupRate(0, 0)).toBeUndefined();
    expect(() => assertCompleteProductPricing({ purchasePrice: 0, markupRate: 15, salePrice: 1 })).toThrow(/giá nhập bằng 0/i);
    expect(assertCompleteProductPricing({ purchasePrice: 0, markupRate: 15, salePrice: 0 })).toEqual({ purchasePrice: 0, markupRate: 15, salePrice: 0 });
  });

  it("converts fixed-unit reference prices and refuses automatic variable-unit selling prices", () => {
    const base = { purchasePrice: 2_000, markupRate: 15, salePrice: 2_300 };
    expect(priceForDocumentUnit(base, { conversionMode: "fixed", factorToBase: 50 })).toEqual({
      purchasePrice: 100_000,
      salePrice: 115_000
    });
    expect(priceForDocumentUnit(base, { conversionMode: "variable", factorToBase: undefined })).toBeUndefined();
  });

  it("rejects negative markup because no loss-pricing policy is authorized", () => {
    expect(() => assertCompleteProductPricing({ purchasePrice: 100_000, markupRate: -1, salePrice: 99_000 })).toThrow(/% lãi không được âm/i);
  });
});

describe("authoritative product pricing commands", () => {
  it("creates a complete product pricing master with immutable initial history", () => {
    const state = createInitialOperationsState();
    const result = runCreateCommand({
      state,
      actor: owner,
      now,
      idempotencyKey: "product-pricing-create-0001",
      command: {
        type: "createProductUnit",
        productCode: "VT-GIA-01",
        productName: "Vật tư có giá",
        unitName: state.unitDefinitions[0]!.name,
        purchasePrice: 100_000,
        markupRate: 15,
        salePrice: 115_000,
        saleTaxRate: 0.08
      }
    });
    const product = result.state.productUnits.find((item) => item.id === result.createdEntityId)!;
    expect(product).toMatchObject({ purchasePrice: 100_000, markupRate: 15, salePrice: 115_000, version: 1 });
    expect(product.priceHistory).toEqual([
      expect.objectContaining({
        version: 1,
        previous: { purchasePrice: undefined, markupRate: undefined, salePrice: undefined, saleTaxRate: undefined, targetMarginRate: undefined, standardLeadTimeDays: undefined },
        next: expect.objectContaining({ purchasePrice: 100_000, markupRate: 15, salePrice: 115_000 }),
        changedBy: owner.id,
        changedAt: now
      })
    ]);
  });

  it("uses the current server product sale price for new sales lines and preserves old snapshots", () => {
    let state = createInitialOperationsState();
    const product = state.productUnits[0]!;
    const historicalLine = state.salesOrders.flatMap((order) => order.lines).find((line) => line.productUnitId === product.id)!;
    const historicalSalePrice = historicalLine.unitPrice;
    const historicalPurchaseLine = state.purchaseOrders.flatMap((order) => order.lines).find((line) => line.productUnitId === product.id)!;
    const historicalPurchasePrice = historicalPurchaseLine.unitCost;

    const updated = runOperation({
      state,
      operation: "updateProductCommercialPolicy",
      actor: owner,
      now,
      idempotencyKey: "product-pricing-update-0001",
      targetId: product.id,
      options: {
        expectedVersion: product.version ?? 1,
        purchasePrice: 78_000,
        markupRate: 12,
        salePrice: 87_360,
        saleTaxRate: product.saleTaxRate,
        reason: "Cập nhật giá chuẩn để kiểm tra snapshot"
      }
    });
    state = updated.state;
    const retry = runOperation({
      state,
      operation: "updateProductCommercialPolicy",
      actor: owner,
      now,
      idempotencyKey: "product-pricing-update-0001",
      targetId: product.id,
      options: { expectedVersion: product.version ?? 1, purchasePrice: 78_000, markupRate: 12, salePrice: 87_360, reason: "Cập nhật giá chuẩn để kiểm tra snapshot" }
    });
    const draft = runCreateCommand({
      state,
      actor: owner,
      now,
      idempotencyKey: "product-pricing-sales-0001",
      command: {
        type: "createSalesOrderDraft",
        customerId: state.customers[0]!.id,
        lines: [{ productUnitId: product.id, quantity: 2, unitName: product.unitName, unitFactor: 1, unitPrice: 1, taxRate: 0 }]
      }
    });

    expect(draft.state.salesOrders.at(-1)?.lines[0]).toMatchObject({ unitPrice: 87_360, taxRate: product.saleTaxRate });
    expect(draft.state.salesOrders.at(-1)?.lines[0]?.documentUnit?.unitAmount).toBe(87_360);
    expect(historicalLine.unitPrice).toBe(historicalSalePrice);
    expect(historicalPurchaseLine.unitCost).toBe(historicalPurchasePrice);
    expect(retry.severity).toBe("warning");
    expect(retry.state.productUnits.find((item) => item.id === product.id)?.priceHistory).toHaveLength((product.priceHistory?.length ?? 0) + 1);
  });

  it("keeps an actual purchase-order price as document data without overwriting the product master", () => {
    const state = createInitialOperationsState();
    const product = state.productUnits[0]!;
    const purchasePrice = product.purchasePrice!;
    const actualUnitCost = purchasePrice + 4_321;
    const result = runCreateCommand({
      state,
      actor: owner,
      now,
      idempotencyKey: "product-pricing-purchase-document-0001",
      command: {
        type: "createPurchaseOrderDraft",
        supplierId: state.suppliers[0]!.id,
        lines: [{
          productUnitId: product.id,
          orderedQuantity: 2,
          unitCost: actualUnitCost,
          taxRate: 0.08,
          unitName: product.unitName,
          destinationType: "warehouse",
          warehouseId: state.warehouses[0]!.id
        }]
      }
    });

    expect(result.state.purchaseOrders.at(-1)?.lines[0]?.unitCost).toBe(actualUnitCost);
    expect(result.state.productUnits.find((item) => item.id === product.id)?.purchasePrice).toBe(purchasePrice);
    expect(result.state.productUnits.find((item) => item.id === product.id)?.priceHistory).toEqual(product.priceHistory);
  });

  it("appends a full immutable history entry through the catalog edit command and rejects a stale revision", () => {
    const state = createInitialOperationsState();
    const product = state.productUnits[0]!;
    const previousHistory = structuredClone(product.priceHistory ?? []);
    const result = runOperation({
      state,
      operation: "updateCatalogRecord",
      actor: owner,
      now,
      idempotencyKey: "product-pricing-catalog-edit-0001",
      targetId: product.id,
      options: {
        catalogKind: "products",
        expectedVersion: product.version ?? 1,
        purchasePrice: 80_000,
        markupRate: 15,
        salePrice: 92_000,
        saleTaxRate: 0.1,
        reason: "Điều chỉnh giá chuẩn tháng mới"
      }
    });
    const changed = result.state.productUnits.find((item) => item.id === product.id)!;

    expect(product.priceHistory ?? []).toEqual(previousHistory);
    expect(changed.priceHistory?.at(-1)).toMatchObject({
      previous: { purchasePrice: product.purchasePrice, markupRate: product.markupRate, salePrice: product.salePrice, saleTaxRate: product.saleTaxRate },
      next: { purchasePrice: 80_000, markupRate: 15, salePrice: 92_000, saleTaxRate: 0.1 },
      changedBy: owner.id,
      changedAt: now,
      reason: "Điều chỉnh giá chuẩn tháng mới"
    });
    expect(() => runOperation({
      state: result.state,
      operation: "updateCatalogRecord",
      actor: owner,
      now,
      idempotencyKey: "product-pricing-catalog-edit-stale-0002",
      targetId: product.id,
      options: { catalogKind: "products", expectedVersion: product.version ?? 1, productName: "Tên stale" }
    })).toThrow(/đã được người khác cập nhật/i);
  });

  it("blocks warehouse pricing writes at the server boundary", () => {
    const state = createInitialOperationsState();
    expect(() => runCreateCommand({
      state,
      actor: createRoleActor("warehouse"),
      now,
      idempotencyKey: "product-pricing-rbac-0001",
      command: {
        type: "createProductUnit",
        productCode: "VT-RBAC",
        productName: "Vật tư RBAC",
        unitName: state.unitDefinitions[0]!.name,
        purchasePrice: 100,
        markupRate: 15,
        salePrice: 115,
        saleTaxRate: 0.08
      }
    })).toThrow(/không có quyền/i);

    expect(() => runOperation({
      state,
      actor: createRoleActor("warehouse"),
      now,
      operation: "updateProductCommercialPolicy",
      idempotencyKey: "product-pricing-rbac-update-0002",
      targetId: state.productUnits[0]!.id,
      options: { expectedVersion: state.productUnits[0]!.version ?? 1, purchasePrice: 100, markupRate: 15, salePrice: 115, reason: "Không đủ quyền" }
    })).toThrow(/không có quyền/i);
  });

  it("deduplicates a rapid browser submit and replays the same server mutation once", () => {
    const registry = new MutationIntentRegistry();
    const payload = { expectedVersion: 1, purchasePrice: 100_000, markupRate: 15, salePrice: 115_000 };
    const first = registry.begin("catalog-edit:products:pu-1", payload, () => "product-pricing-double-submit-0001");
    const second = registry.begin("catalog-edit:products:pu-1", payload, () => "must-not-rotate");
    expect(first.shouldExecute).toBe(true);
    expect(second).toEqual({ idempotencyKey: first.idempotencyKey, shouldExecute: false });
  });
});

describe("customer and supplier pricing privacy", () => {
  it("allow-lists sale information and leaks no purchase, markup, profit, or internal margin fields", () => {
    const product = {
      id: "portal-price-product",
      productCode: "PORTAL-PRICE",
      productName: "Vật tư portal",
      unitName: "Bao",
      status: "active",
      purchasePrice: 100_000,
      markupRate: 15,
      salePrice: 115_000,
      saleTaxRate: 0.08,
      targetMarginRate: 0.2,
      profitAmount: 15_000,
      priceHistory: [{ previous: { purchasePrice: 90_000 }, next: { purchasePrice: 100_000 } }]
    };
    const payload = buildCustomerOrderCatalog({ productUnits: [product] });
    expect(payload[0]).toMatchObject({ id: product.id, salePrice: 115_000 });
    expect(JSON.stringify(payload)).not.toMatch(/purchasePrice|markupRate|profitAmount|targetMarginRate|priceHistory|supplierAcquisitionCost/);
  });

  it("redacts sensitive product pricing from customer and supplier snapshot projections", () => {
    const source = createInitialOperationsState();
    Object.assign(source.productUnits[0]!, { purchasePrice: 78_000, markupRate: 12, salePrice: 87_360 });
    const customer = projectOperationsState(source, identity({ role: "customer", customerId: source.customers[0]!.id, moduleIds: ["overview"] }));
    const supplier = projectOperationsState(source, identity({ role: "supplier", supplierId: source.suppliers[0]!.id, moduleIds: ["overview"] }));
    for (const state of [customer, supplier]) {
      for (const product of state.productUnits) {
        expect(product).not.toHaveProperty("purchasePrice");
        expect(product).not.toHaveProperty("markupRate");
        expect(product).not.toHaveProperty("profitAmount");
        expect(product).not.toHaveProperty("targetMarginRate");
        expect(product).not.toHaveProperty("priceHistory");
      }
    }
  });

  it("publishes fixed converted sale prices but excludes variable conversion from the customer DTO", () => {
    const payload = buildCustomerOrderCatalog({
      productUnits: [{ id: "unit-priced", productCode: "UNIT", productName: "Vật tư quy đổi", unitName: "kg", status: "active", purchasePrice: 2_000, markupRate: 15, salePrice: 2_300, saleTaxRate: 0.08 }],
      unitDefinitions: [{ id: "bag", name: "bao", status: "active" }, { id: "truck", name: "xe", status: "active" }],
      purchaseUnitConversions: [
        { productUnitId: "unit-priced", unitId: "bag", conversionMode: "fixed", factorToBase: 50 },
        { productUnitId: "unit-priced", unitId: "truck", conversionMode: "variable", factorToBase: null }
      ]
    });
    expect(payload[0]?.units).toContainEqual({ unitName: "bao", salePrice: 115_000, taxRate: 0.08 });
    expect(payload[0]?.units.some((unit) => unit.unitName === "xe")).toBe(false);
    expect(JSON.stringify(payload)).not.toMatch(/purchasePrice|markupRate|profitAmount/);
  });
});
