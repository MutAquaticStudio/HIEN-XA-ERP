import { describe, expect, it } from "vitest";
import { runCreateCommand } from "../src/modules/operations/create-commands";
import {
  getAssignableDrivers,
  getAssignableWorkers,
  getAvailableVehicles,
  getSelectableCustomers,
  getSelectableProducts,
  getSelectableSuppliers,
  getSelectableWarehouses
} from "../src/modules/operations/selectors";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { createOwnerActor, runOperation } from "../src/modules/operations/service";
import type { CreateCommand, OperationsActor, OperationsState } from "../src/modules/operations/types";

const now = "2026-08-20T00:00:00.000Z";
const owner = createOwnerActor();

function create(state: OperationsState, command: CreateCommand, key: string) {
  return runCreateCommand({
    state,
    command,
    actor: owner,
    now,
    idempotencyKey: `phase1-${key}-12345`
  }).state;
}

function actorFor(role: OperationsActor["role"], overrides: Partial<OperationsActor> = {}): OperationsActor {
  return {
    id: `phase1-${role}`,
    displayName: `Phase 1 ${role}`,
    role,
    permissions: owner.permissions,
    ...overrides
  };
}

describe("Phase 1 core/data connectivity R-008 to R-014", () => {
  it("uses create-once master IDs across sales, purchase, inventory, cash, workforce, and delivery", () => {
    let state = createInitialOperationsState();
    state = create(state, {
      type: "createCustomer",
      displayName: "Phase 1 Customer",
      phone: "0900000001",
      creditLimit: 10000000
    }, "customer");
    const customerId = state.customers.at(-1)!.id;

    state = create(state, {
      type: "createSupplier",
      displayName: "Phase 1 Supplier",
      phone: "0900000002"
    }, "supplier");
    const supplierId = state.suppliers.at(-1)!.id;

    state = create(state, {
      type: "createProductUnit",
      productCode: "PHASE1-PRODUCT",
      productName: "Phase 1 Product",
      unitName: state.productUnits[0]!.unitName,
      preferredSupplierId: supplierId
    }, "product");
    const productUnitId = state.productUnits.at(-1)!.id;
    state = create(state, { type: "createUnitDefinition", name: "Phase1 Pack" }, "purchase-unit");
    const purchaseUnitId = state.unitDefinitions.at(-1)!.id;
    state = create(state, {
      type: "upsertPurchaseUnitConversion",
      productUnitId,
      unitId: purchaseUnitId,
      conversionMode: "fixed",
      factorToBase: 1
    }, "purchase-conversion");

    state = create(state, {
      type: "createWarehouse",
      code: "PHASE1-WH",
      name: "Phase 1 Warehouse"
    }, "warehouse");
    const warehouseId = state.warehouses.at(-1)!.id;

    state = create(state, {
      type: "createEmployee",
      displayName: "Phase 1 Worker",
      roleType: "worker"
    }, "worker");
    const workerId = state.employees.at(-1)!.id;

    state = create(state, {
      type: "createEmployee",
      displayName: "Phase 1 Driver",
      roleType: "driver"
    }, "driver");
    const driverId = state.employees.at(-1)!.id;

    state = create(state, {
      type: "createVehicle",
      code: "PHASE1-TRUCK",
      plateNumber: "51P-00001",
      capacityTons: 5
    }, "vehicle");
    const vehicleId = state.vehicles.at(-1)!.id;

    const warehouseActor = actorFor("warehouse", { warehouseIds: [warehouseId] });
    expect(getSelectableCustomers(state, owner).map((item) => item.id)).toContain(customerId);
    expect(getSelectableSuppliers(state, owner).map((item) => item.id)).toContain(supplierId);
    expect(getSelectableProducts(state).map((item) => item.id)).toContain(productUnitId);
    expect(getSelectableWarehouses(state, warehouseActor).map((item) => item.id)).toEqual([warehouseId]);
    expect(getAssignableWorkers(state, actorFor("worker", { employeeId: workerId })).map((item) => item.id)).toEqual([workerId]);
    expect(getAssignableDrivers(state, owner).map((item) => item.id)).toContain(driverId);
    expect(getAvailableVehicles(state).map((item) => item.id)).toContain(vehicleId);

    state = create(state, {
      type: "createSalesOrderDraft",
      customerId,
      lines: [{
        productUnitId,
        quantity: 5,
        unitPrice: 100,
        taxRate: 0.08,
        unitName: state.productUnits.find((item) => item.id === productUnitId)!.unitName,
        unitFactor: 1
      }]
    }, "sales");
    const salesOrder = state.salesOrders.at(-1)!;

    state = create(state, {
      type: "createPurchaseOrderDraft",
      supplierId,
      lines: [{
        productUnitId,
        orderedQuantity: 5,
        unitCost: 80,
        taxRate: 0.08,
        unitName: "Phase1 Pack",
        unitFactor: 1,
        destinationType: "warehouse",
        warehouseId
      }]
    }, "purchase");
    const purchaseOrder = state.purchaseOrders.at(-1)!;
    expect(purchaseOrder.supplierId).toBe(supplierId);
    expect(purchaseOrder.lines[0]!.productUnitId).toBe(productUnitId);
    expect(purchaseOrder.lines[0]!.warehouseId).toBe(warehouseId);
    expect(() => runCreateCommand({
      state,
      command: {
        type: "createPurchaseOrderDraft",
        supplierId,
        lines: [{
          productUnitId,
          orderedQuantity: 1,
          unitCost: 80,
          taxRate: 0,
          unitName: "Phase1 Pack",
          unitFactor: 1,
          destinationType: "warehouse",
          warehouseId: "missing-warehouse"
        }]
      },
      actor: owner,
      now,
      idempotencyKey: "phase1-invalid-purchase-12345"
    })).toThrow("Kho nhận không hợp lệ");

    state = runOperation({
      state,
      operation: "confirmPurchaseOrder",
      targetId: purchaseOrder.id,
      actor: owner,
      now,
      idempotencyKey: "phase1-confirm-purchase-12345"
    }).state;
    state = runOperation({
      state,
      operation: "postGoodsReceipt",
      targetId: purchaseOrder.lines[0]!.id,
      actor: owner,
      now,
      idempotencyKey: "phase1-receipt-12345",
      options: { quantity: 5 }
    }).state;
    expect(state.inventoryMovements.at(-1)).toMatchObject({ productUnitId, warehouseId });
    state = runOperation({
      state,
      operation: "confirmSalesOrder",
      targetId: salesOrder.id,
      actor: owner,
      now,
      idempotencyKey: "phase1-confirm-sales-12345"
    }).state;
    state = runOperation({
      state,
      operation: "allocateSalesSources",
      targetId: salesOrder.id,
      actor: owner,
      now,
      idempotencyKey: "phase1-allocate-sales-12345"
    }).state;
    expect(state.salesOrders.find((order) => order.id === salesOrder.id)?.lines[0]).toMatchObject({ sourceType: "warehouse", warehouseId });

    state = create(state, { type: "createCustomerPaymentDraft", customerId, amount: 1000 }, "customer-payment");
    state = create(state, { type: "createSupplierPaymentDraft", supplierId, amount: 800 }, "supplier-payment");
    state = create(state, { type: "createWorkOrderDraft", employeeId: workerId, productUnitId, actualQuantity: 1, totalAmount: 100 }, "work-order");
    state = create(state, { type: "createEmployeePaymentDraft", employeeId: workerId, amount: 100 }, "employee-payment");
    state = create(state, {
      type: "createDeliveryJob",
      salesOrderId: salesOrder.id,
      driverId,
      vehicleId,
      plannedDate: "2026-08-21"
    }, "delivery");

    const inventoryResult = runOperation({
      state,
      operation: "postInventoryCountAdjustment",
      actor: owner,
      now,
      idempotencyKey: "phase1-inventory-12345",
      options: { warehouseId, productUnitId, countedQuantity: 5, reason: "Phase 1 connectivity characterization" }
    });
    state = inventoryResult.state;

    expect(state.productUnits.filter((item) => item.id === productUnitId)).toHaveLength(1);
    expect(state.salesOrders.at(-1)!.customerId).toBe(customerId);
    expect(state.salesOrders.at(-1)!.lines[0]!.productUnitId).toBe(productUnitId);
    expect(state.customerPayments.at(-1)!.customerId).toBe(customerId);
    expect(state.purchaseOrders.at(-1)!.supplierId).toBe(supplierId);
    expect(state.supplierPayments.at(-1)!.supplierId).toBe(supplierId);
    expect(state.workOrders.at(-1)!.outputs[0]!.productUnitId).toBe(productUnitId);
    expect(state.employeePayments.at(-1)!.employeeId).toBe(workerId);
    expect(state.deliveryJobs.at(-1)).toMatchObject({ salesOrderId: salesOrder.id, driverId, vehicleId });
    expect(state.inventoryCountSessions!.at(-1)!.warehouseId).toBe(warehouseId);
    expect(state.inventoryCountSessions!.at(-1)!.lines.map((line) => line.productUnitId)).toContain(productUnitId);
  });

  it("keeps shared selectors fail-closed for party and warehouse scope", () => {
    const state = createInitialOperationsState();
    const customerId = state.customers[0]!.id;
    const supplierId = state.suppliers[0]!.id;
    expect(getSelectableCustomers(state, actorFor("customer", { customerId })).map((item) => item.id)).toEqual([customerId]);
    expect(getSelectableCustomers(state, actorFor("customer", { customerId: "missing-customer" }))).toEqual([]);
    expect(getSelectableSuppliers(state, actorFor("supplier", { supplierId })).map((item) => item.id)).toEqual([supplierId]);
    expect(getSelectableSuppliers(state, actorFor("supplier", { supplierId: "missing-supplier" }))).toEqual([]);
    expect(getSelectableWarehouses(state, actorFor("warehouse", { warehouseIds: ["missing-warehouse"] }))).toEqual([]);
    expect(getSelectableWarehouses(state, actorFor("warehouse"))).toEqual([]);
  });
});
