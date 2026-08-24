import { describe, expect, it } from "vitest";
import { buildInventoryStockRows } from "@/modules/operations/inventory-read-model";
import { createRoleActor, runOperation } from "@/modules/operations/commands";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsAttachment } from "@/modules/operations/types";

const now = "2026-08-24T09:00:00.000+07:00";
const owner = createRoleActor("owner");
const evidence: OperationsAttachment = {
  id: "11111111-1111-4111-8111-111111111111",
  fileName: "bien-ban-kiem-ke.pdf",
  contentType: "application/pdf",
  size: 256,
  sha256: "a".repeat(64),
  uploadedBy: owner.id,
  uploadedAt: now
};

describe("ERP V2 consolidated inventory", () => {
  it("keeps every active product visible with an unknown balance when no warehouse exists", () => {
    const state = createInitialOperationsState();
    state.productUnits.push(
      { ...state.productUnits[0]!, id: "pu-extra-1", productCode: "VT-EXTRA-1", productName: "Vật tư bổ sung 1" },
      { ...state.productUnits[0]!, id: "pu-extra-2", productCode: "VT-EXTRA-2", productName: "Vật tư bổ sung 2" }
    );
    state.warehouses = [];
    state.inventoryMovements = [];

    const rows = buildInventoryStockRows(state, owner);

    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.warehouseId === undefined && row.quantity === undefined)).toBe(true);
  });

  it("projects every product-warehouse pair with zero until a movement is posted", () => {
    const state = createInitialOperationsState();
    const warehouse = state.warehouses[0]!;
    state.warehouses = [warehouse];
    state.inventoryMovements = [];

    const rows = buildInventoryStockRows(state, owner);

    expect(rows).toHaveLength(state.productUnits.filter((product) => product.status === "active").length);
    expect(rows.every((row) => row.warehouseId === warehouse.id && row.quantity === 0)).toBe(true);
  });

  it("submits a one-line quick count without changing stock before approval and posts exactly once", () => {
    const state = createInitialOperationsState();
    const warehouse = state.warehouses[0]!;
    const product = state.productUnits[0]!;
    state.inventoryMovements = state.inventoryMovements.filter(
      (movement) => movement.warehouseId !== warehouse.id || movement.productUnitId !== product.id
    );
    const beforeMovementCount = state.inventoryMovements.length;
    const submitted = runOperation({
      state,
      operation: "submitQuickInventoryCount",
      actor: owner,
      now,
      idempotencyKey: "quick-count-submit-0001",
      options: {
        warehouseId: warehouse.id,
        productUnitId: product.id,
        countedQuantity: 3,
        expectedBookQuantity: 0,
        reason: "Đối chiếu kiểm kê tại kho",
        attachments: [evidence]
      }
    });
    const session = submitted.state.inventoryCountSessions?.at(-1);

    expect(session).toMatchObject({ warehouseId: warehouse.id, status: "submitted", version: 3 });
    expect(session?.lines).toHaveLength(1);
    expect(submitted.state.inventoryMovements).toHaveLength(beforeMovementCount);

    const approved = runOperation({
      state: submitted.state,
      operation: "approveInventoryCountSession",
      actor: owner,
      now,
      idempotencyKey: "quick-count-approve-0001",
      targetId: session?.id,
      options: { expectedVersion: session?.version }
    });
    expect(approved.state.inventoryMovements).toHaveLength(beforeMovementCount + 1);
    expect(approved.state.inventoryMovements.at(-1)).toMatchObject({ movementType: "adjustment", quantity: 3 });

    const retry = runOperation({
      state: approved.state,
      operation: "approveInventoryCountSession",
      actor: owner,
      now,
      idempotencyKey: "quick-count-approve-0001",
      targetId: session?.id,
      options: { expectedVersion: session?.version }
    });
    expect(retry.state.inventoryMovements).toHaveLength(beforeMovementCount + 1);
  });

  it("rejects a quick count when the authoritative book balance changed", () => {
    const state = createInitialOperationsState();
    const warehouse = state.warehouses[0]!;
    const product = state.productUnits[0]!;

    expect(() => runOperation({
      state,
      operation: "submitQuickInventoryCount",
      actor: owner,
      now,
      idempotencyKey: "quick-count-stale-0001",
      options: {
        warehouseId: warehouse.id,
        productUnitId: product.id,
        countedQuantity: 1,
        expectedBookQuantity: -999,
        reason: "Đối chiếu kiểm kê tại kho",
        attachments: [evidence]
      }
    })).toThrow("đã thay đổi");
  });

  it("requires evidence for a difference and enforces all quick-count permissions and warehouse scope", () => {
    const state = createInitialOperationsState();
    const warehouse = state.warehouses[0]!;
    const product = state.productUnits[0]!;
    const bookQuantity = buildInventoryStockRows(state, owner).find((row) => row.warehouseId === warehouse.id && row.productUnitId === product.id)?.quantity ?? 0;
    const options = { warehouseId: warehouse.id, productUnitId: product.id, countedQuantity: bookQuantity + 1, expectedBookQuantity: bookQuantity, reason: "Chênh lệch khi kiểm kho" };

    expect(() => runOperation({ state, operation: "submitQuickInventoryCount", actor: owner, now, idempotencyKey: "quick-count-no-evidence-0001", options })).toThrow("ảnh hoặc biên bản");
    expect(() => runOperation({ state, operation: "submitQuickInventoryCount", actor: { ...owner, permissions: ["inventory.create_count_session", "inventory.record_count_line"] }, now, idempotencyKey: "quick-count-no-submit-0001", options: { ...options, attachments: [evidence] } })).toThrow("không có quyền");
    expect(() => runOperation({ state, operation: "submitQuickInventoryCount", actor: { ...owner, role: "warehouse", permissions: ["inventory.create_count_session", "inventory.record_count_line", "inventory.submit_count_session"], warehouseIds: ["warehouse-outside-scope"] }, now, idempotencyKey: "quick-count-scope-0001", options: { ...options, attachments: [evidence] } })).toThrow("ngoài phạm vi");
  });
});
