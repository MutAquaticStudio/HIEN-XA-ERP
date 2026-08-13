import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import {
  createCatalogOrderCutoverPlan,
  type CreateCatalogOrderCutoverPlanInput
} from "../src/server/infrastructure/operations-catalog-order-cutover-plan";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CASH_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";

function createInput(): CreateCatalogOrderCutoverPlanInput {
  const state = createInitialOperationsState();
  const sourceDocuments = new Set([
    ...state.customerLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.supplierLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.employeeLedgerEntries.map((entry) => entry.sourceDocument),
    ...state.inventoryMovements.map((entry) => entry.sourceDocument),
    ...state.cashTransactions.map((entry) => entry.sourceDocument),
    ...state.workOrders.map((entry) => entry.sourceDocument)
  ]);
  return {
    namespace: "operations",
    sourceRevision: 77,
    stateSchemaVersion: 1,
    cutoverDate: "2026-07-28",
    generatedAt: "2026-07-28T00:00:00.000Z",
    mappingOverrides: {
      identityAliases: {
        ...Object.fromEntries(state.auditLogs.map((entry) => [entry.actorId, USER_ID])),
        "owner-1": USER_ID
      },
      sourceDocuments: Object.fromEntries([...sourceDocuments].map((sourceDocument) => [sourceDocument, {
        entityType: "sales_order" as const,
        targetLegacyId: state.salesOrders[0].id
      }])),
      cashAccounts: Object.fromEntries([...new Set([
        ...state.cashTransactions.map((entry) => entry.accountName),
        ...state.cashVouchers.map((entry) => entry.accountName)
      ])].map((accountName) => [accountName, CASH_ACCOUNT_ID])),
      paymentMetadata: Object.fromEntries([
        ...state.customerPayments.map((payment) => [`customer_payment:${payment.id}`, paymentOverride()]),
        ...state.supplierPayments.map((payment) => [`supplier_payment:${payment.id}`, paymentOverride()]),
        ...state.employeePayments.map((payment) => [`employee_payment:${payment.id}`, paymentOverride()]),
        ...state.employeeAdvances.map((advance) => [`employee_advance:${advance.id}`, paymentOverride()])
      ]),
      cashVoucherMetadata: Object.fromEntries(state.cashVouchers.map((voucher) => [`cash_voucher:${voucher.id}`, {
        occurredAt: "2026-07-28T00:00:00.000Z",
        actorLegacyId: "owner-1"
      }]))
    }
  };
}

function paymentOverride() {
  return {
    targetCashAccountId: CASH_ACCOUNT_ID,
    method: "bank_transfer" as const,
    postedAt: "2026-07-28T00:00:00.000Z",
    actorLegacyId: "owner-1"
  };
}

describe("catalog, order, and delivery normalized cutover plan", () => {
  it("creates a deterministic dependency-ordered plan while declaring deferred domains", () => {
    const state = createInitialOperationsState();
    const first = createCatalogOrderCutoverPlan(state, createInput());
    const second = createCatalogOrderCutoverPlan(structuredClone(state), createInput());

    expect(first.planChecksum).toBe(second.planChecksum);
    expect(first.isComplete).toBe(false);
    expect(first.deferredCollections).toContain("customerLedgerEntries");
    expect(first.batches.map((batch) => batch.name)).toEqual([
      "master.customers",
      "master.suppliers",
      "master.employees",
      "master.units",
      "master.products",
      "master.product-units",
      "master.price-rules",
      "master.warehouses",
      "master.vehicles",
      "sales.orders",
      "sales.items",
      "procurement.orders",
      "procurement.items",
      "procurement.destinations",
      "sales.items.purchase-links",
      "delivery.jobs",
      "delivery.assignments",
      "delivery.items"
    ]);
    expect(first.batches.find((batch) => batch.name === "sales.items")?.rows[0].values.pricing_snapshot).toMatchObject({
      source: "runtime_cutover",
      conversion_mode: "fixed"
    });
  });

  it("keeps pricing and order totals frozen from the runtime order rather than current catalog price", () => {
    const state = createInitialOperationsState();
    const runtimeLine = state.salesOrders[0].lines[0];
    state.productUnits.find((unit) => unit.id === runtimeLine.productUnitId)!.salePrice = runtimeLine.unitPrice + 999;

    const plan = createCatalogOrderCutoverPlan(state, createInput());
    const item = plan.batches.find((batch) => batch.name === "sales.items")!.rows.find((row) => row.legacyId === runtimeLine.id)!;
    const order = plan.batches.find((batch) => batch.name === "sales.orders")!.rows.find((row) => row.legacyId === state.salesOrders[0].id)!;

    expect(item.values.unit_price).toBe(runtimeLine.unitPrice);
    const expectedGross = state.salesOrders[0].lines.reduce(
      (total, line) => total + line.quantity * line.unitPrice * (1 + line.taxRate),
      0
    );
    expect(order.values.gross_total).toBe(expectedGross);
  });

  it("rejects a variable purchase conversion instead of inventing a numeric product unit", () => {
    const state = createInitialOperationsState();
    state.purchaseUnitConversions.push({
      id: "variable-purchase-conversion",
      productUnitId: state.productUnits[0].id,
      unitId: state.unitDefinitions[1].id,
      conversionMode: "variable",
      factorToBase: null,
      version: 1,
      updatedAt: "2026-07-28T00:00:00.000Z"
    });

    expect(() => createCatalogOrderCutoverPlan(state, createInput())).toThrow("CUTOVER_PURCHASE_UNIT_CONVERSION_FIXED_FACTOR_REQUIRED");
  });

  it("stops when a multi-unit product has no explicit base unit", () => {
    const state = createInitialOperationsState();
    const secondUnit = structuredClone(state.productUnits[0]);
    secondUnit.id = "pu-cement-second";
    secondUnit.unitName = state.unitDefinitions[1].name;
    state.productUnits.push(secondUnit);

    expect(() => createCatalogOrderCutoverPlan(state, createInput())).toThrow("CUTOVER_MAPPING_BLOCKED");
  });
});
