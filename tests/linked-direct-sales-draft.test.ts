import { describe, expect, it } from "vitest";
import { runCreateCommand } from "@/modules/operations/create-commands";
import { validateOperationsInvariants } from "@/modules/operations/invariants";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import { configuredPurchaseUnits } from "@/modules/operations/unit-settings";
import type { OperationsActor } from "@/modules/operations/types";

const actor: OperationsActor = {
  id: "owner-linked-direct-test",
  displayName: "Owner test",
  role: "owner",
  permissions: ["procurement.create", "sales.create"]
};

function directPurchaseFixture() {
  const state = createInitialOperationsState();
  const product = state.productUnits.find((item) => item.status === "active" && item.salePrice !== undefined && item.saleTaxRate !== undefined);
  const supplier = state.suppliers.find((item) => item.status === "active");
  const customer = state.customers.find((item) => item.status === "active");
  if (!product || !supplier || !customer) throw new Error("Missing direct-delivery fixture data.");
  const purchaseUnitDefinition = { id: "unit-linked-direct-test", name: "Don vi mua test", status: "active" as const };
  state.unitDefinitions.push(purchaseUnitDefinition);
  state.purchaseUnitConversions.push({
    id: `puc-${product.id}-${purchaseUnitDefinition.id}`,
    productUnitId: product.id,
    unitId: purchaseUnitDefinition.id,
    conversionMode: "fixed",
    factorToBase: 1,
    version: 1,
    updatedAt: "2026-08-02T08:00:00.000Z"
  });
  const purchaseUnit = configuredPurchaseUnits(state, product.id)[0]!;
  return { state, product, supplier, customer, purchaseUnit };
}

describe("linked direct sales draft", () => {
  it("creates one linked sales draft with server catalog price", () => {
    const { state, product, supplier, customer, purchaseUnit } = directPurchaseFixture();
    const result = runCreateCommand({
      state,
      command: {
        type: "createPurchaseOrderDraft",
        supplierId: supplier.id,
        createLinkedSalesDraft: true,
        lines: [{
          productUnitId: product.id,
          orderedQuantity: 2,
          unitCost: 70_000,
          taxRate: 0.08,
          unitName: purchaseUnit.unitName,
          unitFactor: purchaseUnit.conversionMode === "fixed" ? purchaseUnit.factorToBase ?? undefined : undefined,
          actualBaseQuantity: purchaseUnit.conversionMode === "variable" ? 2 : undefined,
          destinationType: "customer_direct",
          customerId: customer.id
        }]
      },
      actor,
      now: "2026-08-02T08:00:00.000Z",
      idempotencyKey: "linked-direct-sales-draft-0001"
    });

    const purchaseOrder = result.state.purchaseOrders.at(-1)!;
    const salesOrder = result.state.salesOrders.at(-1)!;
    const purchaseLine = purchaseOrder.lines[0]!;
    const salesLine = salesOrder.lines[0]!;
    expect(salesOrder.status).toBe("draft");
    expect(salesOrder.customerId).toBe(customer.id);
    expect(salesLine.unitPrice).toBe(product.salePrice);
    expect(salesLine.taxRate).toBe(product.saleTaxRate);
    expect(salesLine.purchaseOrderLineId).toBe(purchaseLine.id);
    expect(purchaseLine.salesOrderLineId).toBe(salesLine.id);
    expect(validateOperationsInvariants(result.state)).toEqual([]);

    const replay = runCreateCommand({
      state: result.state,
      command: {
        type: "createPurchaseOrderDraft",
        supplierId: supplier.id,
        createLinkedSalesDraft: true,
        lines: []
      },
      actor,
      now: "2026-08-02T08:01:00.000Z",
      idempotencyKey: "linked-direct-sales-draft-0001"
    });
    expect(replay.state.purchaseOrders).toHaveLength(result.state.purchaseOrders.length);
    expect(replay.state.salesOrders).toHaveLength(result.state.salesOrders.length);
  });

  it("requires sales permission when creating the linked draft", () => {
    const { state, product, supplier, customer, purchaseUnit } = directPurchaseFixture();
    expect(() => runCreateCommand({
      state,
      command: {
        type: "createPurchaseOrderDraft",
        supplierId: supplier.id,
        createLinkedSalesDraft: true,
        lines: [{
          productUnitId: product.id,
          orderedQuantity: 1,
          unitCost: 70_000,
          taxRate: 0.08,
          unitName: purchaseUnit.unitName,
          unitFactor: purchaseUnit.conversionMode === "fixed" ? purchaseUnit.factorToBase ?? undefined : undefined,
          actualBaseQuantity: purchaseUnit.conversionMode === "variable" ? 1 : undefined,
          destinationType: "customer_direct",
          customerId: customer.id
        }]
      },
      actor: { ...actor, permissions: ["procurement.create"] },
      now: "2026-08-02T08:00:00.000Z",
      idempotencyKey: "linked-direct-sales-permission-0001"
    })).toThrow("Người dùng không có quyền thực hiện thao tác này.");
  });
});
