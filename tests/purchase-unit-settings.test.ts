import { describe, expect, it } from "vitest";
import { runCreateCommand } from "../src/modules/operations/create-commands";
import { validateOperationsInvariants } from "../src/modules/operations/invariants";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { createOwnerActor } from "../src/modules/operations/service";
import type { CreateCommand, OperationsState } from "../src/modules/operations/types";

const actor = createOwnerActor();
const now = "2026-07-17T09:30:00.000+07:00";

function execute(state: OperationsState, command: CreateCommand, suffix: string) {
  return runCreateCommand({
    state,
    command,
    actor,
    now,
    idempotencyKey: `unit-settings-${suffix}-12345`
  });
}

function configurePurchaseUnit(
  state: OperationsState,
  input: {
    name: string;
    productUnitId: string;
    conversionMode: "fixed" | "variable";
    factorToBase?: number;
  },
  suffix: string
) {
  const unitResult = execute(state, {
    type: "createUnitDefinition",
    name: input.name
  }, `${suffix}-unit`);
  const unit = unitResult.state.unitDefinitions.at(-1);
  if (!unit) throw new Error("Missing configured unit.");
  const conversionResult = execute(unitResult.state, {
    type: "upsertPurchaseUnitConversion",
    productUnitId: input.productUnitId,
    unitId: unit.id,
    conversionMode: input.conversionMode,
    factorToBase: input.factorToBase
  }, `${suffix}-conversion`);
  return { state: conversionResult.state, unit };
}

describe("purchase unit settings", () => {
  it("starts with stock base units only so the store owns all purchase-unit setup", () => {
    const state = createInitialOperationsState();

    expect(state.unitDefinitions.map((unit) => unit.name)).toEqual(["bao", "m3", "viên"]);
    expect(state.purchaseUnitConversions).toEqual([]);
    expect(validateOperationsInvariants(state)).toEqual([]);
  });

  it("creates a custom unit and a product-specific conversion", () => {
    const unitResult = execute(createInitialOperationsState(), {
      type: "createUnitDefinition",
      name: "Pallet"
    }, "create-pallet");
    const pallet = unitResult.state.unitDefinitions.at(-1);
    if (!pallet) throw new Error("Missing created unit.");

    const conversionResult = execute(unitResult.state, {
      type: "upsertPurchaseUnitConversion",
      productUnitId: "pu-brick-vien",
      unitId: pallet.id,
      conversionMode: "fixed",
      factorToBase: 500
    }, "create-pallet-conversion");

    expect(conversionResult.state.purchaseUnitConversions.at(-1)).toMatchObject({
      productUnitId: "pu-brick-vien",
      unitId: pallet.id,
      factorToBase: 500,
      version: 1
    });
    expect(conversionResult.state.auditLogs[0]?.action).toBe("upsertPurchaseUnitConversion");
  });

  it("rejects duplicate unit names and blocks deleting a stock base unit", () => {
    const state = createInitialOperationsState();

    expect(() => execute(state, { type: "createUnitDefinition", name: "BAO" }, "duplicate-bao"))
      .toThrow("Đơn vị đã tồn tại");
    expect(() => execute(state, { type: "deleteUnitDefinition", unitId: "unit-bao" }, "delete-base"))
      .toThrow("đang là đơn vị tồn kho");
  });

  it("uses optimistic locking when a conversion is updated", () => {
    const configured = configurePurchaseUnit(createInitialOperationsState(), {
      name: "Tấn",
      productUnitId: "pu-cement-bag",
      conversionMode: "fixed",
      factorToBase: 20
    }, "locking-tan");
    const conversion = configured.state.purchaseUnitConversions[0];
    if (!conversion) throw new Error("Missing configured conversion.");
    const updated = execute(configured.state, {
      type: "upsertPurchaseUnitConversion",
      productUnitId: "pu-cement-bag",
      unitId: configured.unit.id,
      conversionMode: "fixed",
      factorToBase: 21,
      expectedVersion: 1
    }, "update-tan");

    expect(updated.state.purchaseUnitConversions.find((item) => item.id === conversion.id))
      .toMatchObject({ factorToBase: 21, version: 2 });
    expect(() => execute(updated.state, {
      type: "upsertPurchaseUnitConversion",
      productUnitId: "pu-cement-bag",
      unitId: configured.unit.id,
      conversionMode: "fixed",
      factorToBase: 22,
      expectedVersion: 1
    }, "stale-tan")).toThrow("đã được người khác cập nhật");
  });

  it("rejects a purchase factor that differs from server configuration", () => {
    const configured = configurePurchaseUnit(createInitialOperationsState(), {
      name: "Tấn",
      productUnitId: "pu-cement-bag",
      conversionMode: "fixed",
      factorToBase: 20
    }, "spoof-tan");
    expect(() => execute(configured.state, {
      type: "createPurchaseOrderDraft",
      supplierId: "sup-hoang-thach",
      lines: [{
        productUnitId: "pu-cement-bag",
        orderedQuantity: 1,
        unitCost: 1500000,
        taxRate: 0.08,
        unitName: "Tấn",
        unitFactor: 19,
        destinationType: "warehouse"
      }]
    }, "spoof-factor")).toThrow("không khớp cấu hình");
  });

  it("uses the server fixed factor when the order omits a manual factor", () => {
    const configured = configurePurchaseUnit(createInitialOperationsState(), {
      name: "Táº¥n",
      productUnitId: "pu-cement-bag",
      conversionMode: "fixed",
      factorToBase: 20
    }, "server-factor-config");
    const serverConfigured = execute(configured.state, {
      type: "createPurchaseOrderDraft",
      supplierId: "sup-hoang-thach",
      lines: [{
        productUnitId: "pu-cement-bag",
        orderedQuantity: 1,
        unitCost: 1500000,
        taxRate: 0.08,
        unitName: "Táº¥n",
        destinationType: "warehouse"
      }]
    }, "server-factor");
    expect(serverConfigured.state.purchaseOrders.at(-1)?.lines[0]?.documentUnit).toMatchObject({
      factorToBase: 20,
      conversionMode: "fixed"
    });
  });

  it("requires actual stock quantity for a variable vehicle unit", () => {
    const configured = configurePurchaseUnit(createInitialOperationsState(), {
      name: "Xe",
      productUnitId: "pu-sand-m3",
      conversionMode: "variable"
    }, "variable-vehicle");
    const baseCommand: CreateCommand = {
      type: "createPurchaseOrderDraft",
      supplierId: "sup-cat-da-hai-an",
      lines: [{
        productUnitId: "pu-sand-m3",
        orderedQuantity: 1,
        unitCost: 1400000,
        taxRate: 0.1,
        unitName: "Xe",
        destinationType: "warehouse"
      }]
    };

    expect(() => execute(configured.state, baseCommand, "vehicle-missing-actual"))
      .toThrow("thực nhận");
    expect(() => execute(configured.state, {
      ...baseCommand,
      lines: [{ ...baseCommand.lines![0]!, unitFactor: 7, actualBaseQuantity: 6.5 }]
    }, "vehicle-spoofed-factor")).toThrow("không nhận hệ số cố định");

    const result = execute(configured.state, {
      ...baseCommand,
      lines: [{ ...baseCommand.lines![0]!, actualBaseQuantity: 6.5 }]
    }, "vehicle-actual-quantity");
    expect(result.state.purchaseOrders.at(-1)?.lines[0]).toMatchObject({
      orderedQuantity: 6.5,
      documentUnit: {
        unitName: "Xe",
        baseUnitName: "m3",
        conversionMode: "variable",
        factorToBase: 6.5,
        quantity: 1
      }
    });
    expect(validateOperationsInvariants(result.state)).toEqual([]);
  });

  it("deletes current configuration without changing historical snapshots", () => {
    const configured = configurePurchaseUnit(createInitialOperationsState(), {
      name: "Tấn",
      productUnitId: "pu-cement-bag",
      conversionMode: "fixed",
      factorToBase: 20
    }, "historical-tan");
    const purchase = execute(configured.state, {
      type: "createPurchaseOrderDraft",
      supplierId: "sup-hoang-thach",
      lines: [{
        productUnitId: "pu-cement-bag",
        orderedQuantity: 1,
        unitCost: 1520000,
        taxRate: 0.08,
        unitName: "Tấn",
        unitFactor: 20,
        destinationType: "warehouse"
      }]
    }, "historical-snapshot");
    const deleted = execute(purchase.state, {
      type: "deleteUnitDefinition",
      unitId: configured.unit.id
    }, "delete-tan");

    expect(deleted.state.unitDefinitions.some((unit) => unit.id === configured.unit.id)).toBe(false);
    expect(deleted.state.purchaseUnitConversions.some((conversion) => conversion.unitId === configured.unit.id)).toBe(false);
    expect(deleted.state.purchaseOrders.at(-1)?.lines[0]?.documentUnit).toMatchObject({
      unitName: "Tấn",
      factorToBase: 20,
      quantity: 1
    });
  });

  it("resets all purchase-unit settings with optimistic counts and keeps stock units", () => {
    const configured = configurePurchaseUnit(createInitialOperationsState(), {
      name: "Pallet",
      productUnitId: "pu-brick-vien",
      conversionMode: "fixed",
      factorToBase: 500
    }, "reset-pallet");

    expect(() => execute(configured.state, {
      type: "resetPurchaseUnitSettings",
      expectedCustomUnitCount: 0,
      expectedConversionCount: 1
    }, "stale-reset")).toThrow("đã thay đổi");

    const reset = execute(configured.state, {
      type: "resetPurchaseUnitSettings",
      expectedCustomUnitCount: 1,
      expectedConversionCount: 1
    }, "reset-all");
    expect(reset.state.unitDefinitions.map((unit) => unit.name)).toEqual(["bao", "m3", "viên"]);
    expect(reset.state.purchaseUnitConversions).toEqual([]);
    expect(reset.state.auditLogs[0]?.action).toBe("resetPurchaseUnitSettings");
    expect(validateOperationsInvariants(reset.state)).toEqual([]);
  });
});
