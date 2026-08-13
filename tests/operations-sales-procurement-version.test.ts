import { describe, expect, it } from "vitest";
import { createRoleActor } from "../src/modules/operations/identity";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { runOperation } from "../src/modules/operations/service";

function expectOperationError(operation: () => unknown, code: string, status: number) {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code, status });
}

describe("sales and procurement optimistic versions", () => {
  it("guards sales confirmation and allocation while preserving append-only audit correlation", () => {
    const initial = createInitialOperationsState();
    const salesOrder = initial.salesOrders.find((item) => item.status === "draft");
    expect(salesOrder).toBeDefined();

    const confirmed = runOperation({
      state: initial,
      operation: "confirmSalesOrder",
      actor: createRoleActor("owner"),
      now: "2026-07-30T01:00:00.000Z",
      idempotencyKey: "mobile-sales-version-confirm-0001",
      targetId: salesOrder?.id,
      options: { expectedVersion: salesOrder?.version }
    });

    const updated = confirmed.state.salesOrders.find((item) => item.id === salesOrder?.id);
    expect(updated?.version).toBe((salesOrder?.version ?? 0) + 1);
    expect(confirmed.state.auditLogs[0]).toMatchObject({
      correlationId: "mobile-sales-version-confirm-0001",
      targetId: salesOrder?.id
    });

    expectOperationError(() => runOperation({
      state: confirmed.state,
      operation: "allocateSalesSources",
      actor: createRoleActor("owner"),
      now: "2026-07-30T01:01:00.000Z",
      idempotencyKey: "mobile-sales-version-stale-0002",
      targetId: salesOrder?.id,
      options: { expectedVersion: salesOrder?.version }
    }), "VERSION_CONFLICT", 409);
  });

  it("uses a backward-compatible default version for purchase orders and increments it on confirmation", () => {
    const initial = createInitialOperationsState();
    const purchaseOrder = initial.purchaseOrders[0];
    if (purchaseOrder) {
      purchaseOrder.status = "draft";
      purchaseOrder.version = undefined;
    }
    expect(purchaseOrder).toBeDefined();

    const confirmed = runOperation({
      state: initial,
      operation: "confirmPurchaseOrder",
      actor: createRoleActor("owner"),
      now: "2026-07-30T01:02:00.000Z",
      idempotencyKey: "mobile-purchase-version-confirm-0001",
      targetId: purchaseOrder?.id,
      options: { expectedVersion: purchaseOrder?.version ?? 1 }
    });

    const updated = confirmed.state.purchaseOrders.find((item) => item.id === purchaseOrder?.id);
    expect(updated?.version).toBe((purchaseOrder?.version ?? 1) + 1);
    expectOperationError(() => runOperation({
      state: confirmed.state,
      operation: "confirmPurchaseOrder",
      actor: createRoleActor("owner"),
      now: "2026-07-30T01:03:00.000Z",
      idempotencyKey: "mobile-purchase-version-stale-0002",
      targetId: purchaseOrder?.id,
      options: { expectedVersion: purchaseOrder?.version ?? 1 }
    }), "VERSION_CONFLICT", 409);
  });
});
