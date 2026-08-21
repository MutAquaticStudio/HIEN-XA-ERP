import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import {
  getAssignableDrivers,
  getAvailableVehicles,
  getEligibleSalesOrdersForDelivery,
  getSelectableCustomers,
  getSelectableProducts,
  getSelectableSuppliers,
  getSelectableCustomerPaymentOrders,
  getSelectableUnitDefinitions,
  getSelectableWarehouses,
  productLabel
} from "../src/modules/operations/selectors";

describe("operations selectors", () => {
  it("shows product code, product name, and unit in product labels", () => {
    const state = createInitialOperationsState();

    expect(productLabel(state, "pu-cement-bag")).toBe("XM-HOLCIM-BAO · Xi măng Holcim (bao)");
    expect(productLabel(state, "missing-product")).toBe("missing-product");
  });

  it("uses actor scope and active eligibility for shared master-data selectors", () => {
    const state = createInitialOperationsState();
    state.customers.push({ id: "cus-inactive", code: "KH-X", displayName: "Đã khóa", phone: "", creditLimit: 0, status: "inactive" });
    state.suppliers.push({ id: "sup-inactive", code: "NCC-X", displayName: "Đã khóa", phone: "", status: "inactive" });
    state.warehouses[1]!.status = "inactive";
    state.vehicles.push({ id: "vehicle-busy", code: "XE-BUSY", plateNumber: "99A-000.00", capacityTons: 4, status: "active" });
    state.deliveryJobs.push({
      id: "dj-busy", documentNo: "GH-BUSY", salesOrderId: "so-001", driverId: "emp-driver-dung",
      vehicleId: "vehicle-busy", helperIds: [], plannedDate: "2026-07-20", status: "in_transit"
    });
    const actor = { id: "warehouse-user", displayName: "Kho", role: "warehouse" as const, permissions: [], warehouseIds: ["wh-main"] };

    expect(getSelectableCustomers(state, actor).every((item) => item.status === "active")).toBe(true);
    expect(getSelectableSuppliers(state, actor).every((item) => item.status === "active")).toBe(true);
    expect(getSelectableProducts(state).every((item) => item.status === "active")).toBe(true);
    expect(getSelectableWarehouses(state, actor).map((item) => item.id)).toEqual(["wh-main"]);
    expect(getAssignableDrivers(state, actor).map((item) => item.id)).toEqual(["emp-driver-dung"]);
    expect(getAvailableVehicles(state).some((item) => item.id === "vehicle-busy")).toBe(false);
    state.unitDefinitions[0]!.status = "inactive";
    expect(getSelectableUnitDefinitions(state).every((item) => item.status === "active")).toBe(true);
  });

  it("keeps portal payment-order choices limited to eligible projected orders", () => {
    const orders = [
      { id: "confirmed-transfer", paymentMethod: "transfer", status: "confirmed" },
      { id: "draft-transfer", paymentMethod: "transfer", status: "draft" },
      { id: "confirmed-credit", paymentMethod: "credit_requested", status: "confirmed" }
    ];
    expect(getSelectableCustomerPaymentOrders(orders).map((order) => order.id)).toEqual(["confirmed-transfer"]);
  });

  it("filters delivery orders to allocated warehouse lines in actor scope", () => {
    const state = createInitialOperationsState();
    const order = state.salesOrders[0]!;
    order.status = "allocated";
    order.lines = order.lines.map((line) => ({ ...line, sourceType: "warehouse", warehouseId: "wh-main" }));
    state.deliveryJobs[0]!.status = "delivered";
    const actor = { id: "dispatcher", displayName: "Điều phối", role: "dispatcher" as const, permissions: [], warehouseIds: ["wh-main"] };
    expect(getEligibleSalesOrdersForDelivery(state, actor).map((item) => item.id)).toEqual(["so-001"]);
    state.deliveryJobs[0]!.status = "assigned";
    expect(getEligibleSalesOrdersForDelivery(state, actor)).toEqual([]);
  });
});
