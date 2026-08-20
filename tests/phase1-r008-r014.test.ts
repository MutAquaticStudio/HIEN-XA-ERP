import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import {
  getAssignableDrivers,
  getAssignableWorkers,
  getSelectableCustomers,
  getSelectableProducts,
  getSelectableSuppliers,
  getSelectableWarehouses
} from "../src/modules/operations/selectors";

describe("Phase 1 core/data connectivity R-008 to R-014", () => {
  it("keeps one authoritative id connected across customer, supplier, warehouse, employee, and vehicle flows", () => {
    const state = createInitialOperationsState();
    const customerId = state.customers[0]!.id;
    const supplierId = state.suppliers[0]!.id;
    const productUnitId = state.productUnits[0]!.id;
    const warehouseId = state.warehouses[0]!.id;
    const employeeId = state.employees[0]!.id;
    const vehicleId = state.vehicles[0]!.id;

    const salesLine = state.salesOrders[0]!.lines[0]!;
    salesLine.productUnitId = productUnitId;
    salesLine.sourceType = "warehouse";
    salesLine.warehouseId = warehouseId;
    state.salesOrders[0]!.customerId = customerId;
    state.purchaseOrders[0]!.supplierId = supplierId;
    state.purchaseOrders[0]!.lines[0]!.productUnitId = productUnitId;
    state.purchaseOrders[0]!.lines[0]!.warehouseId = warehouseId;
    state.inventoryMovements.push({
      id: "movement-connectivity", movementType: "receipt", sourceDocument: state.purchaseOrders[0]!.documentNo,
      postingKey: "posting-connectivity", warehouseId, productUnitId, quantity: 10, unitCost: 1,
      postedAt: "2026-08-20T00:00:00.000Z", sourceLineId: state.purchaseOrders[0]!.lines[0]!.id
    });
    state.deliveryJobs[0]!.driverId = employeeId;
    state.deliveryJobs[0]!.vehicleId = vehicleId;
    state.customerPayments[0]!.customerId = customerId;
    state.supplierPayments[0]!.supplierId = supplierId;
    state.employeePayments[0]!.employeeId = state.employees[1]!.id;

    expect(state.salesOrders[0]!.lines[0]!.productUnitId).toBe(state.purchaseOrders[0]!.lines[0]!.productUnitId);
    expect(state.inventoryMovements.at(-1)!.productUnitId).toBe(productUnitId);
    expect(state.salesOrders[0]!.lines[0]!.warehouseId).toBe(state.inventoryMovements.at(-1)!.warehouseId);
    expect(state.salesOrders[0]!.customerId).toBe(state.customerPayments[0]!.customerId);
    expect(state.purchaseOrders[0]!.supplierId).toBe(state.supplierPayments[0]!.supplierId);
    expect(state.deliveryJobs[0]!.driverId).toBe(employeeId);
    expect(state.deliveryJobs[0]!.vehicleId).toBe(vehicleId);
  });

  it("exposes selectors as the shared read model with positive and negative scope checks", () => {
    const state = createInitialOperationsState();
    const owner = { id: "owner", displayName: "Owner", role: "owner" as const, permissions: [] };
    const customer = { id: "customer", displayName: "Customer", role: "customer" as const, permissions: [], customerId: state.customers[0]!.id };
    const supplier = { id: "supplier", displayName: "Supplier", role: "supplier" as const, permissions: [], supplierId: state.suppliers[0]!.id };
    const worker = { id: "worker", displayName: "Worker", role: "worker" as const, permissions: [], employeeId: state.employees[1]!.id };

    expect(getSelectableCustomers(state, owner).map((item) => item.id)).toContain(state.customers[0]!.id);
    expect(getSelectableCustomers(state, customer).map((item) => item.id)).toEqual([customer.customerId]);
    expect(getSelectableSuppliers(state, supplier).map((item) => item.id)).toEqual([supplier.supplierId]);
    expect(getSelectableProducts(state).map((item) => item.id)).toContain(state.productUnits[0]!.id);
    expect(getSelectableWarehouses(state, { ...owner, role: "warehouse", warehouseIds: ["wh-main"] }).map((item) => item.id)).toEqual(["wh-main"]);
    expect(getAssignableWorkers(state, worker).map((item) => item.id)).toEqual([worker.employeeId]);
    expect(getAssignableDrivers(state, owner).map((item) => item.id)).toEqual(["emp-driver-dung"]);
    expect(getSelectableCustomers(state, { ...customer, customerId: "missing-customer" })).toEqual([]);
  });
});
