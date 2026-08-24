import { describe, expect, it } from "vitest";
import { runCreateCommand } from "@/modules/operations/create-commands";
import { buildCustomerOrderCatalog } from "@/modules/operations/customer-order-catalog";
import { createRoleActor } from "@/modules/operations/identity";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import { configuredDocumentUnits } from "@/modules/operations/unit-settings";
import type { CreateCommand, OperationsState } from "@/modules/operations/types";

const now = "2026-08-24T09:00:00.000+07:00";
const owner = createRoleActor("owner");

function execute(state: OperationsState, command: CreateCommand, suffix: string, actor = owner) {
  return runCreateCommand({ state, command, actor, now, idempotencyKey: `document-unit-${suffix}-12345` });
}

function configure(state: OperationsState, name: string, mode: "fixed" | "variable", factorToBase?: number) {
  const unitResult = execute(state, { type: "createUnitDefinition", name }, `${name}-unit`);
  const unit = unitResult.state.unitDefinitions.at(-1)!;
  return execute(unitResult.state, {
    type: "upsertPurchaseUnitConversion",
    productUnitId: "pu-cement-bag",
    unitId: unit.id,
    conversionMode: mode,
    factorToBase
  }, `${name}-conversion`).state;
}

describe("shared document-unit contexts", () => {
  it("offers fixed units to purchase, sales and customer portal but variable units only to purchase", () => {
    let state = configure(createInitialOperationsState(), "Tấn", "fixed", 20);
    state = configure(state, "Xe", "variable");

    expect(configuredDocumentUnits(state, "pu-cement-bag", "purchase").map((unit) => unit.unitName)).toEqual(expect.arrayContaining(["bao", "Tấn", "Xe"]));
    expect(configuredDocumentUnits(state, "pu-cement-bag", "sales").map((unit) => unit.unitName)).toEqual(expect.arrayContaining(["bao", "Tấn"]));
    expect(configuredDocumentUnits(state, "pu-cement-bag", "sales").some((unit) => unit.unitName === "Xe")).toBe(false);
    expect(configuredDocumentUnits(state, "pu-cement-bag", "customer_portal").some((unit) => unit.unitName === "Xe")).toBe(false);
  });

  it("uses the authoritative fixed factor for sales and rejects a spoofed client factor", () => {
    const state = configure(createInitialOperationsState(), "Tấn", "fixed", 20);
    const base: CreateCommand = {
      type: "createSalesOrderDraft",
      customerId: "cus-minh-anh",
      lines: [{ productUnitId: "pu-cement-bag", quantity: 2, unitPrice: 3_000_000, taxRate: 0.1, unitName: "Tấn" }]
    };

    const result = execute(state, base, "sales-authoritative");
    expect(result.state.salesOrders.at(-1)?.lines[0]).toMatchObject({
      quantity: 40,
      unitPrice: 150_000,
      documentUnit: { unitName: "Tấn", factorToBase: 20, quantity: 2, unitAmount: 3_000_000 }
    });

    expect(() => execute(state, {
      ...base,
      lines: [{ ...base.lines![0]!, unitFactor: 19 }]
    }, "sales-spoofed")).toThrow("không khớp cấu hình");
  });

  it("publishes fixed unit choices only and snapshots the selected portal unit server-side", () => {
    let state = configure(createInitialOperationsState(), "Tấn", "fixed", 20);
    state = configure(state, "Xe", "variable");
    const catalogProduct = buildCustomerOrderCatalog(state).find((product) => product.id === "pu-cement-bag")!;
    expect(catalogProduct.units.map((unit) => unit.unitName)).toEqual(expect.arrayContaining(["bao", "Tấn"]));
    expect(catalogProduct.units.some((unit) => unit.unitName === "Xe")).toBe(false);

    const actor = { ...createRoleActor("customer"), id: "customer-portal-user", customerId: "cus-minh-anh" };
    const result = execute(state, {
      type: "createCustomerPortalSalesOrder",
      customerId: "cus-minh-anh",
      deliveryAddress: "12 Đường Lê Lợi, phường 1, TP. Vũng Tàu",
      paymentMethod: "transfer",
      lines: [{ productUnitId: "pu-cement-bag", quantity: 1, unitName: "Tấn" }]
    }, "portal-fixed-unit", actor);
    expect(result.state.salesOrders.at(-1)?.lines[0]?.documentUnit).toMatchObject({ unitName: "Tấn", factorToBase: 20, quantity: 1 });
  });

  it("keeps a sales document snapshot after the current conversion is deleted", () => {
    const state = configure(createInitialOperationsState(), "Tấn", "fixed", 20);
    const sale = execute(state, { type: "createSalesOrderDraft", customerId: "cus-minh-anh", lines: [{ productUnitId: "pu-cement-bag", quantity: 1, unitPrice: 3_000_000, taxRate: 0.1, unitName: "Tấn" }] }, "sales-history");
    const unit = sale.state.unitDefinitions.find((item) => item.name === "Tấn")!;
    const deleted = execute(sale.state, { type: "deleteUnitDefinition", unitId: unit.id }, "sales-history-delete");
    expect(deleted.state.purchaseUnitConversions.some((conversion) => conversion.unitId === unit.id)).toBe(false);
    expect(deleted.state.salesOrders.at(-1)?.lines[0]?.documentUnit).toMatchObject({ unitName: "Tấn", factorToBase: 20, quantity: 1 });
  });
});
