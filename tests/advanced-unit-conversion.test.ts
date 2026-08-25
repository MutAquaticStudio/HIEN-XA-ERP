import { describe, expect, it } from "vitest";
import {
  isVariableActualMode,
  resolveProductUnitConversions
} from "@/modules/operations/advanced-unit-conversion";
import { runCreateCommand } from "@/modules/operations/create-commands";
import { buildCustomerOrderCatalog } from "@/modules/operations/customer-order-catalog";
import { createRoleActor, runOperation } from "@/modules/operations/commands";
import { validateOperationsInvariants } from "@/modules/operations/invariants";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { CreateCommand, OperationsState } from "@/modules/operations/types";

const now = "2026-08-24T18:00:00.000+07:00";
const owner = createRoleActor("owner");

function execute(state: OperationsState, command: CreateCommand, suffix: string, actor = owner) {
  return runCreateCommand({ state, command, actor, now, idempotencyKey: `advanced-unit-${suffix}-0001` });
}

function createUnit(state: OperationsState, name: string, suffix: string) {
  const result = execute(state, { type: "createUnitDefinition", name }, `${suffix}-unit`);
  return { state: result.state, unitId: result.state.unitDefinitions.at(-1)!.id };
}

function createKgProduct() {
  let state = createInitialOperationsState();
  const kg = createUnit(state, "kg", "kg-base");
  state = kg.state;
  const product = execute(state, {
    type: "createProductUnit",
    productCode: "VT-KG-ADV",
    productName: "Vật tư quy đổi kg",
    unitName: "kg",
    purchasePrice: 2_000,
    markupRate: 15,
    salePrice: 2_300,
    saleTaxRate: 0.08
  }, "kg-product");
  return { state: product.state, productId: product.createdEntityId! };
}

describe("advanced product unit conversion graph", () => {
  it("supports canonical fixed ratios and derives a multi-level chain without a redundant direct mapping", () => {
    let { state, productId } = createKgProduct();
    const bag = createUnit(state, "Bao 50 kg", "bag");
    state = bag.state;
    state = execute(state, {
      type: "upsertPurchaseUnitConversion",
      productUnitId: productId,
      unitId: bag.unitId,
      conversionMode: "FIXED_RATIO",
      factorToBase: 50
    }, "bag-fixed").state;
    const pallet = createUnit(state, "Pallet", "pallet");
    state = pallet.state;
    state = execute(state, {
      type: "upsertPurchaseUnitConversion",
      productUnitId: productId,
      unitId: pallet.unitId,
      conversionMode: "MULTI_LEVEL",
      parentUnitId: bag.unitId,
      factorToParent: 40
    }, "pallet-chain").state;

    const resolved = resolveProductUnitConversions(state, productId);
    expect(resolved.find((item) => item.unitId === pallet.unitId)).toMatchObject({
      canonicalMode: "MULTI_LEVEL",
      parentUnitId: bag.unitId,
      factorToParent: 40,
      factorToBase: 2_000
    });
    expect(validateOperationsInvariants(state)).toEqual([]);
  });

  it("rejects cycles, duplicate paths, and non-positive factors", () => {
    let { state, productId } = createKgProduct();
    const bag = createUnit(state, "Sack cycle", "cycle-bag"); state = bag.state;
    const pallet = createUnit(state, "Pallet", "cycle-pallet"); state = pallet.state;
    state = execute(state, { type: "upsertPurchaseUnitConversion", productUnitId: productId, unitId: bag.unitId, conversionMode: "FIXED_RATIO", factorToBase: 50 }, "cycle-bag-fixed").state;
    state = execute(state, { type: "upsertPurchaseUnitConversion", productUnitId: productId, unitId: pallet.unitId, conversionMode: "MULTI_LEVEL", parentUnitId: bag.unitId, factorToParent: 40 }, "cycle-pallet-parent").state;
    const bagConversion = state.purchaseUnitConversions.find((item) => item.unitId === bag.unitId)!;

    expect(() => execute(state, {
      type: "upsertPurchaseUnitConversion",
      productUnitId: productId,
      unitId: bag.unitId,
      conversionMode: "MULTI_LEVEL",
      parentUnitId: pallet.unitId,
      factorToParent: 1,
      expectedVersion: bagConversion.version
    }, "cycle-reject")).toThrow(/vòng lặp/i);
    expect(() => execute(state, { type: "upsertPurchaseUnitConversion", productUnitId: productId, unitId: bag.unitId, conversionMode: "FIXED_RATIO", factorToBase: 0, expectedVersion: bagConversion.version }, "zero-reject")).toThrow(/lớn hơn 0/i);

    const corrupted = structuredClone(state);
    corrupted.purchaseUnitConversions.push({ ...bagConversion, id: "duplicate-path" });
    expect(() => resolveProductUnitConversions(corrupted, productId)).toThrow(/hai đường quy đổi/i);
  });

  it("derives typed dimension and density factors only from validated metadata", () => {
    let state = createInitialOperationsState();
    const m2 = createUnit(state, "m²", "m2-base"); state = m2.state;
    const tileProduct = execute(state, { type: "createProductUnit", productCode: "TILE-600", productName: "Gạch 600 × 600", unitName: "m²", purchasePrice: 100_000, markupRate: 15, salePrice: 115_000, saleTaxRate: 0.08 }, "tile-product");
    state = tileProduct.state;
    const tileId = tileProduct.createdEntityId!;
    state = execute(state, { type: "updateProductUnitPhysicalProfile", productUnitId: tileId, inventoryDimension: "AREA", expectedVersion: 1 }, "tile-profile").state;
    const piece = createUnit(state, "Viên 600 × 600", "tile-piece"); state = piece.state;
    state = execute(state, {
      type: "upsertPurchaseUnitConversion",
      productUnitId: tileId,
      unitId: piece.unitId,
      conversionMode: "DIMENSION_BASED",
      dimensionMetadata: { sourceDimension: "COUNT", targetDimension: "AREA", lengthMeters: 0.6, widthMeters: 0.6 }
    }, "tile-dimension").state;
    expect(resolveProductUnitConversions(state, tileId)[0]?.factorToBase).toBeCloseTo(0.36);

    const kg = createUnit(state, "kg", "density-kg-base"); state = kg.state;
    const liquid = execute(state, { type: "createProductUnit", productCode: "LIQ-125", productName: "Chất lỏng 1,25 kg/L", unitName: "kg", purchasePrice: 10_000, markupRate: 15, salePrice: 11_500, saleTaxRate: 0.08 }, "density-product");
    state = liquid.state;
    const liquidId = liquid.createdEntityId!;
    state = execute(state, { type: "updateProductUnitPhysicalProfile", productUnitId: liquidId, inventoryDimension: "MASS", densityKgPerLiter: 1.25, expectedVersion: 1 }, "density-profile").state;
    const liter = createUnit(state, "Lít", "density-liter"); state = liter.state;
    state = execute(state, {
      type: "upsertPurchaseUnitConversion",
      productUnitId: liquidId,
      unitId: liter.unitId,
      conversionMode: "DENSITY_BASED",
      densityMetadata: { sourceDimension: "VOLUME", targetDimension: "MASS", sourceToMetricFactor: 1, baseToMetricFactor: 1 }
    }, "density-conversion").state;
    expect(resolveProductUnitConversions(state, liquidId)[0]?.factorToBase).toBeCloseTo(1.25);

    const noDensity = structuredClone(state);
    delete noDensity.productUnits.find((item) => item.id === liquidId)!.densityKgPerLiter;
    expect(() => resolveProductUnitConversions(noDensity, liquidId)).toThrow(/Khối lượng riêng/i);
  });

  it("keeps variable actual units in purchase/logistics and snapshots the actual factor", () => {
    let { state, productId } = createKgProduct();
    const truck = createUnit(state, "Xe", "variable-truck"); state = truck.state;
    state = execute(state, { type: "upsertPurchaseUnitConversion", productUnitId: productId, unitId: truck.unitId, conversionMode: "VARIABLE_ACTUAL" }, "variable-config").state;
    const variable = resolveProductUnitConversions(state, productId)[0]!;
    expect(variable.allowedContexts).toEqual(["PURCHASE", "LOGISTICS"]);
    expect(isVariableActualMode(variable.conversionMode)).toBe(true);

    const purchase = execute(state, {
      type: "createPurchaseOrderDraft",
      supplierId: state.suppliers[0]!.id,
      lines: [{ productUnitId: productId, orderedQuantity: 1, unitCost: 12_500_000, taxRate: 0.08, unitName: "Xe", actualBaseQuantity: 6_250, destinationType: "warehouse", warehouseId: state.warehouses[0]!.id }]
    }, "variable-purchase");
    expect(purchase.state.purchaseOrders.at(-1)?.lines[0]?.documentUnit).toMatchObject({
      unitName: "Xe",
      baseUnitName: "kg",
      factorToBase: 6_250,
      convertedBaseQuantity: 6_250,
      conversionMode: "VARIABLE_ACTUAL"
    });
  });

  it("uses the authoritative context policy, factor, price, and mode for Sales snapshots", () => {
    let { state, productId } = createKgProduct();
    const bag = createUnit(state, "Bao bán 50 kg", "sales-bag"); state = bag.state;
    state = execute(state, {
      type: "upsertPurchaseUnitConversion",
      productUnitId: productId,
      unitId: bag.unitId,
      conversionMode: "FIXED_RATIO",
      factorToBase: 50,
      allowedContexts: ["PURCHASE"]
    }, "sales-context-purchase-only").state;

    const salesCommand: CreateCommand = {
      type: "createSalesOrderDraft",
      customerId: state.customers[0]!.id,
      lines: [{ productUnitId: productId, quantity: 2, unitPrice: 1, taxRate: 0, unitName: "Bao bán 50 kg", unitFactor: 50 }]
    };
    expect(() => execute(state, salesCommand, "sales-context-reject")).toThrow(/không dùng được cho bán hàng/i);

    const current = state.purchaseUnitConversions.find((item) => item.unitId === bag.unitId)!;
    state = execute(state, {
      type: "upsertPurchaseUnitConversion",
      productUnitId: productId,
      unitId: bag.unitId,
      conversionMode: "FIXED_RATIO",
      factorToBase: 50,
      allowedContexts: ["PURCHASE", "SALES"],
      expectedVersion: current.version
    }, "sales-context-enable").state;
    expect(() => execute(state, { ...salesCommand, lines: [{ ...salesCommand.lines![0]!, unitFactor: 49 }] }, "sales-factor-tamper")).toThrow(/không khớp cấu hình máy chủ/i);

    const sale = execute(state, salesCommand, "sales-converted");
    expect(sale.state.salesOrders.at(-1)?.lines[0]).toMatchObject({
      quantity: 100,
      unitPrice: 2_300,
      documentUnit: {
        unitName: "Bao bán 50 kg",
        baseUnitName: "kg",
        quantity: 2,
        factorToBase: 50,
        convertedBaseQuantity: 100,
        unitAmount: 115_000,
        conversionMode: "FIXED_RATIO"
      }
    });
  });

  it("uses authoritative converted prices, posts receipt stock only in base units, and preserves snapshots", () => {
    let { state, productId } = createKgProduct();
    const bag = createUnit(state, "Bao 50 kg", "flow-bag"); state = bag.state;
    state = execute(state, { type: "upsertPurchaseUnitConversion", productUnitId: productId, unitId: bag.unitId, conversionMode: "FIXED_RATIO", factorToBase: 50 }, "flow-config").state;
    const purchase = execute(state, {
      type: "createPurchaseOrderDraft",
      supplierId: state.suppliers[0]!.id,
      lines: [{ productUnitId: productId, orderedQuantity: 2, unitCost: 100_000, taxRate: 0.08, unitName: "Bao 50 kg", destinationType: "warehouse", warehouseId: state.warehouses[0]!.id }]
    }, "flow-purchase");
    const order = purchase.state.purchaseOrders.at(-1)!;
    const confirmed = runOperation({ state: purchase.state, operation: "confirmPurchaseOrder", actor: owner, now, idempotencyKey: "advanced-unit-confirm-po-0001", targetId: order.id });
    const received = runOperation({ state: confirmed.state, operation: "postGoodsReceipt", actor: owner, now, idempotencyKey: "advanced-unit-receipt-0001", targetId: order.lines[0]!.id, options: { quantity: 100 } });
    const movement = received.state.inventoryMovements.at(-1)!;
    expect(movement).toMatchObject({ quantity: 100, unitCost: 2_000, documentUnit: { unitName: "Bao 50 kg", quantity: 2, convertedBaseQuantity: 100, factorToBase: 50, conversionMode: "FIXED_RATIO" } });

    const snapshot = structuredClone(order.lines[0]!.documentUnit);
    const conversion = state.purchaseUnitConversions.find((item) => item.unitId === bag.unitId)!;
    const changed = execute(received.state, { type: "upsertPurchaseUnitConversion", productUnitId: productId, unitId: bag.unitId, conversionMode: "FIXED_RATIO", factorToBase: 60, expectedVersion: conversion.version }, "flow-edit");
    expect(changed.state.purchaseOrders.find((item) => item.id === order.id)?.lines[0]?.documentUnit).toEqual(snapshot);
  });

  it("publishes customer-safe deterministic units without factors or internal pricing", () => {
    let { state, productId } = createKgProduct();
    const bag = createUnit(state, "Bao 50 kg", "portal-bag"); state = bag.state;
    state = execute(state, { type: "upsertPurchaseUnitConversion", productUnitId: productId, unitId: bag.unitId, conversionMode: "FIXED_RATIO", factorToBase: 50, allowedContexts: ["PURCHASE", "SALES", "PORTAL"] }, "portal-config").state;
    const truck = createUnit(state, "Xe", "portal-truck"); state = truck.state;
    state = execute(state, { type: "upsertPurchaseUnitConversion", productUnitId: productId, unitId: truck.unitId, conversionMode: "VARIABLE_ACTUAL" }, "portal-variable").state;

    const product = buildCustomerOrderCatalog(state).find((item) => item.id === productId)!;
    expect(product.units).toContainEqual({ unitName: "Bao 50 kg", salePrice: 115_000, taxRate: 0.08 });
    expect(product.units.some((unit) => unit.unitName === "Xe")).toBe(false);
    expect(JSON.stringify(product)).not.toMatch(/factorToBase|purchasePrice|markupRate|profit|density|parentUnit/);
  });

  it("enforces server RBAC and idempotency and returns the new revision state without F5", () => {
    const { state, productId } = createKgProduct();
    const bag = createUnit(state, "Bao RBAC", "rbac-bag");
    const command: CreateCommand = { type: "upsertPurchaseUnitConversion", productUnitId: productId, unitId: bag.unitId, conversionMode: "FIXED_RATIO", factorToBase: 50 };
    expect(() => execute(bag.state, command, "rbac-deny", createRoleActor("worker"))).toThrow(/không có quyền/i);

    const first = execute(bag.state, command, "idempotent");
    const retry = runCreateCommand({ state: first.state, command, actor: owner, now, idempotencyKey: "advanced-unit-idempotent-0001" });
    expect(retry.severity).toBe("warning");
    expect(retry.state.purchaseUnitConversions.filter((item) => item.productUnitId === productId && item.unitId === bag.unitId)).toHaveLength(1);
    expect(first.state.purchaseUnitConversions.some((item) => item.unitId === bag.unitId)).toBe(true);
  });
});
