import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { createRoleActor } from "../src/modules/operations/commands";
import { runOperation } from "../src/modules/operations/commands";

function expectOperationError(operation: () => unknown, code: string, status: number) {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code, status });
}

describe("workforce version lock", () => {
  it("rejects a stale approval and increments the work-order version after approval", () => {
    const state = createInitialOperationsState();
    const workOrder = state.workOrders[0]!;
    workOrder.status = "submitted";
    workOrder.version = 3;
    workOrder.outputs = [{
      id: "output-lock",
      productUnitId: state.productUnits[0]!.id,
      actualQuantity: 1,
      approvedQuantity: 0,
      status: "submitted"
    }];

    expectOperationError(() => runOperation({
      state,
      operation: "approveWorkOutput",
      actor: createRoleActor("supervisor"),
      now: "2026-07-30T00:00:00.000Z",
      idempotencyKey: "workforce-stale-approval",
      targetId: workOrder.id,
      options: { expectedVersion: 2 }
    }), "VERSION_CONFLICT", 409);

    const approved = runOperation({
      state,
      operation: "approveWorkOutput",
      actor: createRoleActor("supervisor"),
      now: "2026-07-30T00:00:00.000Z",
      idempotencyKey: "workforce-current-approval",
      targetId: workOrder.id,
      options: { expectedVersion: 3 }
    });

    expect(approved.state.workOrders.find((item) => item.id === workOrder.id)?.version).toBe(4);
    expect(approved.state.workOrders.find((item) => item.id === workOrder.id)?.status).toBe("approved");
  });
});
