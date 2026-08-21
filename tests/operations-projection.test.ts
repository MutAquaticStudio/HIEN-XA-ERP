import { describe, expect, it } from "vitest";
import { visibleModulesForRole } from "../src/modules/operations/identity";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { projectOperationsState } from "../src/server/identity/operations-projection";
import type { SafeIdentityUser } from "../src/server/identity/types";

describe("server-side operations projection", () => {
  it("returns only assigned delivery data and removes financial fields for drivers", () => {
    const state = createInitialOperationsState();
    const driver = identityUser("driver", ["overview", "delivery"], "Tài xế QC", "emp-driver-dung");
    state.bankTransferProofs.push({
      id: "ck-001",
      documentNo: "CK-000001",
      direction: "out",
      amount: 500_000,
      counterpartyName: "Nhà cung cấp A",
      transactionReference: "MB-001",
      transferredAt: "2026-07-23T08:00:00.000Z",
      attachments: [],
      archivedBy: "user-accountant",
      archivedAt: "2026-07-23T08:01:00.000Z"
    });
    state.employees[0]!.displayName = driver.displayName;
    const projected = projectOperationsState(state, driver);

    expect(projected.deliveryJobs.length).toBeGreaterThan(0);
    expect(new Set(projected.deliveryJobs.map((job) => job.driverId)).size).toBe(1);
    expect(projected.employees).toHaveLength(1);
    expect(projected.employees[0]?.roleType).toBe("driver");
    expect(projected.salesOrders.every((order) => order.lines.every((line) => line.unitPrice === 0))).toBe(true);
    expect(projected.customers.every((customer) => customer.creditLimit === 0)).toBe(true);
    expect(projected.customerLedgerEntries).toEqual([]);
    expect(projected.supplierLedgerEntries).toEqual([]);
    expect(projected.cashTransactions).toEqual([]);
    expect(projected.bankTransferProofs).toEqual([]);
    expect(projected.supplierPayments).toEqual([]);
    expect(projected.purchaseOrders).toEqual([]);
    expect(projected.processedOperations).toEqual([]);
  });

  it("does not serialize sales data when a user is limited to overview", () => {
    const projected = projectOperationsState(
      createInitialOperationsState(),
      identityUser("sales", ["overview"], "Bán hàng giới hạn")
    );

    expect(projected.salesOrders).toEqual([]);
    expect(projected.customers).toEqual([]);
    expect(projected.deliveryJobs).toEqual([]);
  });

  it("does not fall back to another employee when a restricted identity is not linked", () => {
    const state = createInitialOperationsState();
    const projected = projectOperationsState(
      state,
      identityUser("driver", ["overview", "delivery"], "Tài xế chưa được gán")
    );

    expect(projected.deliveryJobs).toEqual([]);
    expect(projected.salesOrders).toEqual([]);
    expect(projected.employees).toEqual([]);
    expect(projected.vehicles).toEqual([]);
    expect(projected.purchaseOrders).toEqual([]);
    expect(projected.approvalRequests).toEqual([]);
  });

  it("gives a worker only assigned work and redacts cost, price, and financial ledgers", () => {
    const state = createInitialOperationsState();
    const worker = identityUser("worker", ["overview", "procurement", "delivery", "workforce"], "Nguyễn Văn Nam", "emp-worker-nam");
    const ownAttachment = {
      id: "33333333-3333-4333-8333-333333333333",
      fileName: "own.jpg",
      contentType: "image/jpeg" as const,
      size: 1024,
      sha256: "c".repeat(64),
      uploadedBy: worker.id,
      uploadedAt: "2026-07-18T08:00:00.000Z"
    };
    const otherAttachment = { ...ownAttachment, id: "44444444-4444-4444-8444-444444444444", uploadedBy: "user-owner" };
    state.purchaseOrders[0]!.attachments = [ownAttachment, otherAttachment];
    state.salesOrders[0]!.attachments = [ownAttachment, otherAttachment];
    state.approvalRequests.push({
      id: "approval-001",
      documentNo: "APR-NK-000001",
      type: "goods_receipt",
      targetId: "po-001-line-cement",
      status: "pending",
      quantity: 20,
      submittedBy: worker.id,
      submittedByName: worker.displayName,
      submittedAt: "2026-07-18T08:00:00.000Z"
    });
    state.employees[1]!.displayName = worker.displayName;

    const projected = projectOperationsState(state, worker);

    expect(projected.purchaseOrders[0]?.lines[0]?.unitCost).toBe(0);
    expect(projected.purchaseOrders[0]?.lines[0]?.taxRate).toBe(0);
    expect(projected.purchaseOrders[0]?.attachments).toEqual([ownAttachment]);
    expect(projected.salesOrders[0]?.attachments).toEqual([ownAttachment]);
    expect(projected.salesOrders.every((order) => order.lines.every((line) => line.unitPrice === 0))).toBe(true);
    expect(projected.approvalRequests).toHaveLength(1);
    expect(projected.deliveryJobs.every((job) => job.driverId === "emp-worker-nam" || job.helperIds.includes("emp-worker-nam"))).toBe(true);
    expect(projected.inventoryMovements).toEqual([]);
    expect(projected.customerLedgerEntries).toEqual([]);
    expect(projected.supplierLedgerEntries).toEqual([]);
    expect(projected.cashTransactions).toEqual([]);
  });

  it("keeps all business fields for an owner with the complete module scope", () => {
    const state = createInitialOperationsState();
    const projected = projectOperationsState(
      state,
      identityUser("owner", visibleModulesForRole("owner"), "Chủ cửa hàng")
    );

    expect(projected.salesOrders).toEqual(state.salesOrders);
    expect(projected.customerLedgerEntries).toEqual(state.customerLedgerEntries);
    expect(projected.inventoryMovements).toEqual(state.inventoryMovements);
    expect(projected.processedOperations).toEqual([]);
  });

  it("removes commercial policy and inbound freight details from customer and supplier portals", () => {
    const state = createInitialOperationsState();
    state.productUnits[0]!.targetMarginRate = 0.25;
    state.productUnits[0]!.standardLeadTimeDays = 4;
    state.purchaseOrders[0]!.freightCharges = [{
      id: "freight-001",
      supplierId: "sup-cat-da-hai-an",
      netAmount: 100_000,
      taxRate: 0.08,
      status: "draft",
      allocations: [{ purchaseOrderLineId: state.purchaseOrders[0]!.lines[0]!.id, allocatedNetAmount: 100_000 }],
      idempotencyKey: "projection-freight-charge-20260728"
    }];

    const customer = projectOperationsState(state, { ...identityUser("customer", [], "Khach QC"), customerId: "cus-minh-anh" });
    const supplier = projectOperationsState(state, { ...identityUser("supplier", [], "NCC QC"), supplierId: "sup-cat-da-hai-an" });

    expect(customer.productUnits.every((product) => product.targetMarginRate === undefined && product.standardLeadTimeDays === undefined)).toBe(true);
    expect(supplier.productUnits.every((product) => product.targetMarginRate === undefined && product.standardLeadTimeDays === undefined)).toBe(true);
    expect(supplier.purchaseOrders.every((order) => order.freightCharges === undefined)).toBe(true);
  });

  it("never exposes source allocation, warehouse, purchase linkage, or override ids to a customer", () => {
    const state = createInitialOperationsState();
    state.salesOrders[0]!.lines[0]!.allocations = [{
      id: "allocation-private",
      sourceType: "warehouse",
      warehouseId: "wh-main",
      purchaseOrderLineId: "po-private",
      allocatedQuantity: 120,
      deliveredQuantity: 0,
      version: 1,
      status: "allocated",
      negativeStockOverrideRequestId: "approval-private"
    }];
    state.deliveryJobs[0]!.allocationIds = ["allocation-private"];

    const customer = projectOperationsState(state, { ...identityUser("customer", [], "Khách QC"), customerId: "cus-minh-anh" });
    const serialized = JSON.stringify(customer);

    expect(serialized).not.toContain("allocation-private");
    expect(serialized).not.toContain("po-private");
    expect(serialized).not.toContain("approval-private");
    expect(customer.salesOrders[0]?.lines[0]).not.toHaveProperty("warehouseId");
    expect(customer.salesOrders[0]?.lines[0]).not.toHaveProperty("allocations");
  });

  it("keeps a warehouse projection inside assigned warehouse ids", () => {
    const state = createInitialOperationsState();
    state.warehouses.push({ id: "wh-other", code: "KHO-X", name: "Kho khác", status: "active" });
    state.inventoryMovements.push({
      id: "movement-other", movementType: "opening", sourceDocument: "OPEN-X", postingKey: "open-x",
      warehouseId: "wh-other", productUnitId: "pu-cement-bag", quantity: 1, unitCost: 1, postedAt: "2026-07-20T00:00:00.000Z"
    });
    state.inventoryCountSessions?.push({
      id: "count-other", documentNo: "KK-X", warehouseId: "wh-other", status: "draft", version: 1,
      createdBy: "warehouse-user", createdByName: "Kho", createdAt: "2026-07-20T00:00:00.000Z", lines: []
    });

    const projected = projectOperationsState(state, identityUser("warehouse", ["overview", "masterData", "procurement", "delivery", "inventory"], "Kho", undefined, ["wh-main"]));

    expect(projected.warehouses.map((warehouse) => warehouse.id)).toEqual(["wh-main"]);
    expect(projected.inventoryMovements.every((movement) => movement.warehouseId === "wh-main")).toBe(true);
    expect(projected.inventoryCountSessions?.every((session) => session.warehouseId === "wh-main")).toBe(true);
  });

  it("fails closed when a warehouse identity has no assignment", () => {
    const projected = projectOperationsState(
      createInitialOperationsState(),
      identityUser("warehouse", ["overview", "masterData", "procurement", "delivery", "inventory"], "Kho chưa gán")
    );
    expect(projected.warehouses).toEqual([]);
    expect(projected.inventoryMovements).toEqual([]);
    expect(projected.purchaseOrders).toEqual([]);
  });
});

function identityUser(
  role: SafeIdentityUser["role"],
  moduleIds: SafeIdentityUser["moduleIds"],
  displayName: string,
  employeeId?: string,
  warehouseIds?: string[]
): SafeIdentityUser {
  return {
    id: `user-${role}`,
    email: `${role}@hienxa.test`,
    normalizedEmail: `${role}@hienxa.test`,
    displayName,
    employeeId,
    warehouseIds,
    role,
    moduleIds,
    status: "active",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    failedLoginAttempts: 0,
    sessionVersion: 1
  };
}
