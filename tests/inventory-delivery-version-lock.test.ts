import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import { createRoleActor, runOperation } from "@/modules/operations/service";
import type { OperationsState } from "@/modules/operations/types";

function expectOperationError(operation: () => unknown, code: string, status: number) {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code, status });
}

const now = "2026-07-30T08:00:00.000Z";

function run(state: OperationsState, operation: Parameters<typeof runOperation>[0]["operation"], targetId: string, expectedVersion?: number) {
  return runOperation({
    state,
    operation,
    actor: createRoleActor("owner"),
    now,
    idempotencyKey: `native-inventory-${operation}-${targetId}-${expectedVersion ?? "current"}`,
    targetId,
    options: { quantity: 1, expectedVersion }
  }).state;
}

describe("mobile inventory receipt optimistic locking", () => {
  it("rejects a stale purchase-order version without posting stock or a payable", () => {
    let state = createInitialOperationsState();
    const purchaseOrder = state.purchaseOrders.find((item) => item.id === "po-001");
    const version = purchaseOrder?.version ?? 1;
    const inventoryBefore = state.inventoryMovements.length;
    const payablesBefore = state.supplierLedgerEntries.length;

    expectOperationError(() => run(state, "postGoodsReceipt", "po-001-line-cement", version + 1), "VERSION_CONFLICT", 409);
    expect(state.inventoryMovements).toHaveLength(inventoryBefore);
    expect(state.supplierLedgerEntries).toHaveLength(payablesBefore);
  });

  it("accepts the current version and increments it after the receipt is posted", () => {
    let state = createInitialOperationsState();
    const version = state.purchaseOrders.find((item) => item.id === "po-001")?.version ?? 1;
    const inventoryBefore = state.inventoryMovements.length;

    state = run(state, "postGoodsReceipt", "po-001-line-cement", version);

    expect(state.purchaseOrders.find((item) => item.id === "po-001")?.version).toBe(version + 1);
    expect(state.inventoryMovements).toHaveLength(inventoryBefore + 1);
  });
});
