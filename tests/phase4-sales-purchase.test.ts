import { describe, expect, it } from "vitest";

import { runCreateCommand } from "../src/modules/operations/create-commands";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { salesOrderTotals } from "../src/modules/operations/selectors";
import { createOwnerActor, runOperation } from "../src/modules/operations/service";
import type { CreateCommand, OperationsState } from "../src/modules/operations/types";
import { configuredPurchaseUnits } from "../src/modules/operations/unit-settings";

const actor = createOwnerActor();
const now = "2026-07-16T12:00:00.000+07:00";

function create(state: OperationsState, command: CreateCommand, key: string, at = now) {
  return runCreateCommand({
    state,
    command,
    actor,
    now: at,
    idempotencyKey: `phase4-${key}-12345`
  });
}

function stateWithCementPurchaseUnit() {
  const initial = createInitialOperationsState();
  const unitResult = create(initial, { type: "createUnitDefinition", name: "Tấn Phase 4" }, "purchase-unit");
  const unit = unitResult.state.unitDefinitions.at(-1);
  if (!unit) throw new Error("Missing Phase 4 purchase unit.");
  return create(unitResult.state, {
    type: "upsertPurchaseUnitConversion",
    productUnitId: "pu-cement-bag",
    unitId: unit.id,
    conversionMode: "fixed",
    factorToBase: 20
  }, "purchase-conversion").state;
}

describe("Phase 4 sales and purchase workflows", () => {
  it("preserves an actual creation timestamp while accepting a backdated sales business date and canonical customer payable total", () => {
    const created = create(createInitialOperationsState(), {
      type: "createSalesOrderDraft",
      customerId: "cus-minh-anh",
      orderDate: "2026-07-10",
      paymentMethod: "transfer",
      commission: { kind: "percentage", value: 5 },
      lines: [{
        productUnitId: "pu-cement-bag",
        quantity: 10,
        unitPrice: 100,
        taxRate: 0.1,
        discount: { kind: "percentage", value: 10 }
      }]
    }, "backdated-sales");
    const order = created.state.salesOrders.at(-1);
    if (!order) throw new Error("Missing sales draft.");

    expect(order).toMatchObject({ orderDate: "2026-07-10", createdAt: now, status: "draft" });
    expect(order.commission).toMatchObject({ amount: 45, baseAmount: 900 });
    expect(salesOrderTotals(order.lines, order.deliveryCharge, order.commission)).toMatchObject({
      net: 900,
      tax: 90,
      gross: 990,
      customerGross: 990,
      discount: 100,
      commission: 45
    });
  });

  it("rejects future business dates without changing the current business date policy", () => {
    expect(() => create(createInitialOperationsState(), {
      type: "createSalesOrderDraft",
      customerId: "cus-minh-anh",
      orderDate: "2026-07-17",
      lines: [{ productUnitId: "pu-cement-bag", quantity: 1, unitPrice: 100, taxRate: 0.1 }]
    }, "future-sales")).toThrow("Ngày chứng từ không được ở tương lai");
  });

  it("offers the stock unit as a safe 1:1 purchase unit when no optional conversion is configured", () => {
    const state = createInitialOperationsState();
    const [baseUnit] = configuredPurchaseUnits(state, "pu-cement-bag");
    expect(baseUnit).toMatchObject({ unitName: "bao", conversionMode: "fixed", factorToBase: 1, isBase: true });

    const created = create(state, {
      type: "createPurchaseOrderDraft",
      supplierId: "sup-hoang-thach",
      orderDate: "2026-07-10",
      lines: [{
        productUnitId: "pu-cement-bag",
        orderedQuantity: 3,
        unitCost: 75_000,
        taxRate: 0.1,
        unitName: baseUnit?.unitName,
        destinationType: "warehouse",
        warehouseId: "wh-main"
      }]
    }, "base-unit-purchase");

    expect(created.state.purchaseOrders.at(-1)?.lines[0]).toMatchObject({
      orderedQuantity: 3,
      destinationType: "warehouse",
      warehouseId: "wh-main"
    });
  });

  it("edits only the current sales draft version and retains the original audit timestamp", () => {
    const created = create(createInitialOperationsState(), {
      type: "createSalesOrderDraft",
      customerId: "cus-minh-anh",
      orderDate: "2026-07-10",
      lines: [{ productUnitId: "pu-cement-bag", quantity: 1, unitPrice: 100, taxRate: 0.1 }]
    }, "sales-edit-create");
    const salesOrder = created.state.salesOrders.at(-1);
    if (!salesOrder) throw new Error("Missing sales draft.");

    const update: CreateCommand = {
      type: "updateSalesOrderDraft",
      salesOrderId: salesOrder.id,
      expectedVersion: salesOrder.version,
      customerId: salesOrder.customerId,
      orderDate: "2026-07-09",
      paymentMethod: "transfer",
      lines: [{ productUnitId: "pu-cement-bag", quantity: 2, unitPrice: 120, taxRate: 0.1, unitName: "bao", unitFactor: 1 }]
    };
    const updated = create(created.state, update, "sales-edit-update", "2026-07-16T13:00:00.000+07:00");
    const saved = updated.state.salesOrders.find((item) => item.id === salesOrder.id);

    expect(saved).toMatchObject({ orderDate: "2026-07-09", createdAt: now, updatedAt: "2026-07-16T13:00:00.000+07:00", version: 2 });
    let staleError: unknown;
    try {
      create(updated.state, { ...update, expectedVersion: 1 }, "sales-edit-stale", "2026-07-16T14:00:00.000+07:00");
    } catch (error) {
      staleError = error;
    }
    expect(staleError).toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
  });

  it("preserves the purchase destination contract while backdating and versioning a purchase draft", () => {
    const created = create(stateWithCementPurchaseUnit(), {
      type: "createPurchaseOrderDraft",
      supplierId: "sup-cat-da-hai-an",
      orderDate: "2026-07-10",
      lines: [{
        productUnitId: "pu-cement-bag",
        orderedQuantity: 2,
        unitCost: 1_500_000,
        taxRate: 0.1,
        unitName: "Tấn Phase 4",
        destinationType: "warehouse",
        warehouseId: "wh-main"
      }]
    }, "backdated-purchase");
    const purchaseOrder = created.state.purchaseOrders.at(-1);
    if (!purchaseOrder) throw new Error("Missing purchase draft.");

    const updated = create(created.state, {
      type: "updatePurchaseOrderDraft",
      purchaseOrderId: purchaseOrder.id,
      expectedVersion: purchaseOrder.version ?? 1,
      supplierId: purchaseOrder.supplierId,
      orderDate: "2026-07-09",
      lines: [{
        productUnitId: "pu-cement-bag",
        orderedQuantity: 3,
        unitCost: 1_500_000,
        taxRate: 0.1,
        unitName: "Tấn Phase 4",
        destinationType: "warehouse",
        warehouseId: "wh-main"
      }]
    }, "purchase-edit", "2026-07-16T13:00:00.000+07:00");
    const saved = updated.state.purchaseOrders.find((item) => item.id === purchaseOrder.id);

    expect(saved).toMatchObject({ orderDate: "2026-07-09", createdAt: now, updatedAt: "2026-07-16T13:00:00.000+07:00", version: 2 });
    expect(saved?.lines[0]).toMatchObject({ destinationType: "warehouse", warehouseId: "wh-main", orderedQuantity: 60 });
  });

  it("keeps source allocation distinct from the existing work-order assignment lifecycle", () => {
    const initial = createInitialOperationsState();
    const confirmed = runOperation({ state: initial, operation: "confirmSalesOrder", actor, now, idempotencyKey: "phase4-confirm-source-work-12345", targetId: "so-001" });
    const workOrder = confirmed.state.workOrders.find((item) => item.salesOrderId === "so-001");

    expect(workOrder).toMatchObject({ salesOrderId: "so-001", status: "open" });
    expect(confirmed.state.salesOrders.find((item) => item.id === "so-001")?.lines.every((line) => line.sourceType === undefined)).toBe(true);

    const allocated = runOperation({ state: confirmed.state, operation: "allocateSalesSources", actor, now, idempotencyKey: "phase4-allocate-source-work-12345", targetId: "so-001" });
    expect(allocated.state.salesOrders.find((item) => item.id === "so-001")?.lines.every((line) => line.sourceType !== undefined)).toBe(true);
    expect(allocated.state.workOrders.filter((item) => item.salesOrderId === "so-001")).toHaveLength(1);
  });
});
