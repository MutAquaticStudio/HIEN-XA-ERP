import { describe, expect, it } from "vitest";
import { assertAndMigrateOperationsStateToErpV2, migrateOperationsStateToErpV2 } from "../src/modules/operations/erp-v2-migration";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";

describe("ERP V2 source-allocation migration", () => {
  it("deterministically migrates an existing single warehouse source and delivery job", () => {
    const state = createInitialOperationsState();
    const order = state.salesOrders[0]!;
    order.status = "allocated";
    order.lines[0]!.sourceType = "warehouse";
    order.lines[0]!.warehouseId = "wh-main";
    order.lines[1]!.sourceType = "direct_supplier";
    order.lines[1]!.purchaseOrderLineId = "po-002-line-sand";

    const result = migrateOperationsStateToErpV2(state);

    expect(result.issues).toEqual([]);
    expect(result.migratedSalesLines).toBe(2);
    expect(result.state.salesOrders[0]?.lines[0]?.allocations).toEqual([expect.objectContaining({
      id: "so-001-line-cement-allocation-1",
      warehouseId: "wh-main",
      allocatedQuantity: 120
    })]);
    expect(result.state.deliveryJobs[0]?.allocationIds).toEqual(["so-001-line-cement-allocation-1"]);
    expect(state.salesOrders[0]?.lines[0]?.allocations).toBeUndefined();
  });

  it("is idempotent after the versioned transformation", () => {
    const state = createInitialOperationsState();
    state.salesOrders[0]!.status = "allocated";
    state.salesOrders[0]!.lines[0]!.sourceType = "warehouse";
    state.salesOrders[0]!.lines[0]!.warehouseId = "wh-main";
    state.salesOrders[0]!.lines[1]!.sourceType = "direct_supplier";
    state.salesOrders[0]!.lines[1]!.purchaseOrderLineId = "po-002-line-sand";
    const first = assertAndMigrateOperationsStateToErpV2(state);
    const second = migrateOperationsStateToErpV2(first);
    expect(second.migratedSalesLines).toBe(0);
    expect(second.migratedDeliveryJobs).toBe(0);
    expect(second.state).toEqual(first);
  });

  it("blocks cutover when an active record cannot be mapped with certainty", () => {
    const state = createInitialOperationsState();
    state.salesOrders[0]!.status = "allocated";
    expect(() => assertAndMigrateOperationsStateToErpV2(state)).toThrow("ERP_V2_MIGRATION_BLOCKED");
  });
});
