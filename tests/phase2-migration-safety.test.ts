import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "@/modules/operations/sample-data";

describe("R-018 Phase 2 migration safety", () => {
  it("persists portal policy fields and historical unit snapshots through the runtime JSON contract", () => {
    const state = createInitialOperationsState();
    state.productUnits[0]!.visibleOnCustomerPortal = false;
    state.productUnits[0]!.orderableOnline = false;
    state.purchaseOrders[0]!.lines[0]!.documentUnit = {
      unitName: "Pallet",
      baseUnitName: state.productUnits[0]!.unitName,
      factorToBase: 20,
      quantity: 1,
      unitAmount: 1_500_000,
      conversionMode: "fixed"
    };

    const roundTrip = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(roundTrip.productUnits[0]).toMatchObject({ visibleOnCustomerPortal: false, orderableOnline: false });
    expect(roundTrip.purchaseOrders[0]?.lines[0]?.documentUnit).toMatchObject({ factorToBase: 20, conversionMode: "fixed" });
  });
});
