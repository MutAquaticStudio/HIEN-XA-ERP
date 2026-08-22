import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runCreateCommand } from "@/modules/operations/create-commands";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import { getSelectableProducts } from "@/modules/operations/selectors";
import { buildCustomerOrderCatalog } from "@/modules/operations/customer-order-catalog";
import { createRoleActor, runOperation } from "@/modules/operations/commands";
import type { CreateCommand, OperationsState } from "@/modules/operations/types";

const now = "2026-08-22T10:00:00.000+07:00";
const owner = createRoleActor("owner");
const viewer = createRoleActor("viewer");
const kinds = ["customers", "suppliers", "products", "warehouses", "vehicles", "employees"] as const;

function create(state: OperationsState, command: CreateCommand, key: string) {
  return runCreateCommand({ state, command, actor: owner, now, idempotencyKey: "master-data-" + key + "-12345" });
}

describe("ERP V2 master-data CRUD gap closure", () => {
  it("creates all six master-data families and returns the authoritative ID", () => {
    const state = createInitialOperationsState();
    const unit = state.unitDefinitions.find((item) => item.status === "active");
    if (!unit) throw new Error("Missing active base unit fixture.");
    const supplierId = state.suppliers[0]!.id;
    const cases: Array<{ command: CreateCommand; collection: keyof OperationsState }> = [
      { command: { type: "createCustomer", displayName: "Khách hàng CRUD", phone: "0900000001", creditLimit: 1000000 }, collection: "customers" },
      { command: { type: "createSupplier", displayName: "Nhà cung cấp CRUD", phone: "0900000002" }, collection: "suppliers" },
      { command: { type: "createProductUnit", productCode: "VT-CRUD-01", productName: "Vật tư CRUD", unitName: unit.name, preferredSupplierId: supplierId, salePrice: 125000, saleTaxRate: 0.08, visibleOnCustomerPortal: true, orderableOnline: true }, collection: "productUnits" },
      { command: { type: "createWarehouse", code: "WH-CRUD", name: "Kho CRUD" }, collection: "warehouses" },
      { command: { type: "createVehicle", code: "XE-CRUD", plateNumber: "29C-CRUD", capacityTons: 5 }, collection: "vehicles" },
      { command: { type: "createEmployee", displayName: "Nhân sự CRUD", roleType: "worker" }, collection: "employees" }
    ];
    for (const [index, testCase] of cases.entries()) {
      const result = create(state, testCase.command, String(index));
      expect(result.createdEntityId).toBeTruthy();
      const rows = result.state[testCase.collection];
      expect(Array.isArray(rows)).toBe(true);
      expect((rows as Array<{ id: string }>).some((row) => row.id === result.createdEntityId)).toBe(true);
    }
    const product = create(state, cases[2]!.command, "product-propagation");
    const productId = product.createdEntityId!;
    expect(getSelectableProducts(product.state).some((item) => item.id === productId)).toBe(true);
    expect(buildCustomerOrderCatalog(product.state).find((item) => item.id === productId)).toMatchObject({ id: productId, code: "VT-CRUD-01", salePrice: 125000, taxRate: 0.08, orderableOnline: true });
  });

  it("keeps create actions idempotent and rejects unauthorized actors", () => {
    const state = createInitialOperationsState();
    const command: CreateCommand = { type: "createWarehouse", code: "WH-IDEM", name: "Kho idempotent" };
    const first = create(state, command, "idempotency");
    const retry = runCreateCommand({ state: first.state, command, actor: owner, now, idempotencyKey: "master-data-idempotency-12345" });
    expect(retry.createdEntityId).toBe(first.createdEntityId);
    expect(retry.state.warehouses.filter((item) => item.code === "WH-IDEM")).toHaveLength(1);
    expect(() => runCreateCommand({ state, command, actor: viewer, now, idempotencyKey: "master-data-unauthorized-12345" })).toThrow("không có quyền");
  });

  it("updates master data with optimistic version protection and audit", () => {
    const state = createInitialOperationsState();
    const record = state.customers[0]!;
    const updated = runOperation({ state, operation: "updateCatalogRecord", targetId: record.id, actor: owner, now, idempotencyKey: "master-data-update-12345", options: { catalogKind: "customers", expectedVersion: 1, displayName: record.displayName + " đã sửa", status: "inactive" } });
    expect(updated.state.customers.find((item) => item.id === record.id)).toMatchObject({ displayName: record.displayName + " đã sửa", status: "inactive", version: 2 });
    expect(updated.state.auditLogs[0]?.action).toBe("updateCatalogRecord");
    expect(() => runOperation({ state: updated.state, operation: "updateCatalogRecord", targetId: record.id, actor: owner, now, idempotencyKey: "master-data-update-stale-12345", options: { catalogKind: "customers", expectedVersion: 1, displayName: "Stale update" } })).toThrow("đã được người khác cập nhật");
  });

  it("ships guarded new and edit routes for every master-data family", () => {
    const root = resolve(process.cwd());
    for (const kind of kinds) {
      const list = resolve(root, "src/app/(erp)/catalog/" + kind + "/page.tsx");
      const detail = resolve(root, "src/app/(erp)/catalog/" + kind + "/[id]/page.tsx");
      const createRoute = resolve(root, "src/app/(erp)/catalog/" + kind + "/new/page.tsx");
      const editRoute = resolve(root, "src/app/(erp)/catalog/" + kind + "/[id]/edit/page.tsx");
      expect(existsSync(list)).toBe(true);
      expect(existsSync(detail)).toBe(true);
      expect(existsSync(createRoute)).toBe(true);
      expect(existsSync(editRoute)).toBe(true);
      expect(readFileSync(createRoute, "utf8")).toContain("requireCatalogCreateAccess");
      expect(readFileSync(editRoute, "utf8")).toContain("requireCatalogEditAccess");
      expect(readFileSync(editRoute, "utf8")).toContain("findCatalogRecord");
    }
  });
});
