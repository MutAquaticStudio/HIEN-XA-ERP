import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import {\n  getAssignableWorkers,\n  getAvailableVehicles,\n  getCustomerPortalCatalog,\n  getSelectableCustomers,\n  getSelectableProducts,\n  getSelectableSuppliers,\n  getSelectableWarehouses,\n  productLabel\n} from "../src/modules/operations/selectors";

describe("operations selectors", () => {
  it("shows product code, product name, and unit in product labels", () => {
    const state = createInitialOperationsState();

    expect(productLabel(state, "pu-cement-bag")).toBe("XM-HOLCIM-BAO · Xi măng Holcim (bao)");
    expect(productLabel(state, "missing-product")).toBe("missing-product");
  });

  it("centralizes active master-data selectors and warehouse/vehicle scope", () => {
    const state = createInitialOperationsState();
    state.customers[1]!.status = "inactive";
    state.suppliers[1]!.status = "inactive";
    state.productUnits[1]!.status = "inactive";
    state.warehouses[1]!.status = "inactive";
    state.vehicles[1]!.status = "inactive";
    state.deliveryJobs[0]!.status = "in_transit";

    expect(getSelectableCustomers(state)).toEqual([state.customers[0]]);
    expect(getSelectableSuppliers(state)).toEqual([state.suppliers[0]]);
    expect(getSelectableProducts(state)).toEqual([state.productUnits[0], state.productUnits[2]]);
    expect(getSelectableWarehouses(state)).toEqual([state.warehouses[0]]);
    expect(getAssignableWorkers(state).map((employee) => employee.id)).toEqual(["emp-worker-nam", "emp-worker-hai"]);
    expect(getAvailableVehicles(state)).toEqual([]);
    expect(getCustomerPortalCatalog(state).map((product) => product.id)).toEqual(["pu-cement-bag", "pu-sand-m3", "pu-brick-vien"]);
  });
});
