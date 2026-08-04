import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { createOwnerActor, createRoleActor, runOperation } from "../src/modules/operations/service";
import type { OperationName, OperationOptions, OperationsActor, OperationsState } from "../src/modules/operations/types";

const now = "2026-08-04T10:00:00.000+07:00";
function command(state: OperationsState, operation: OperationName, key: string, targetId?: string, options?: OperationOptions, actor: OperationsActor = createOwnerActor()) { return runOperation({ state, operation, actor, now, idempotencyKey: `inventory-count-${key}-12345`, targetId, options }); }
function recordAllLines(state: OperationsState, sessionId: string) {
  let next = state; let session = next.inventoryCountSessions!.find((item) => item.id === sessionId)!;
  for (const [index, line] of session.lines.entries()) {
    const countedQuantity = index === 0 ? line.bookQuantity + 1 : line.bookQuantity;
    const attachments = countedQuantity !== line.bookQuantity ? [{ id: `evidence-${index}`, fileName: "kiem-ke.jpg", contentType: "image/jpeg" as const, size: 12, sha256: "a".repeat(64), uploadedBy: "user-owner-local", uploadedAt: now }] : [];
    next = command(next, "recordInventoryCountLine", `record-${index}`, session.id, { expectedVersion: session.version, productUnitId: line.id, countedQuantity, reason: "Chênh lệch khi kiểm kho", attachments }).state;
    session = next.inventoryCountSessions!.find((item) => item.id === sessionId)!;
  }
  return next;
}
describe("inventory count sessions", () => {
  it("creates, submits and posts each discrepancy exactly once", () => {
    let state = createInitialOperationsState(); state = command(state, "createInventoryCountSession", "create", undefined, { warehouseId: "wh-main" }).state;
    const sessionId = state.inventoryCountSessions![0].id; state = recordAllLines(state, sessionId); let session = state.inventoryCountSessions![0]; state = command(state, "submitInventoryCountSession", "submit", session.id, { expectedVersion: session.version }).state; session = state.inventoryCountSessions![0]; state = command(state, "approveInventoryCountSession", "approve", session.id, { expectedVersion: session.version }).state; session = state.inventoryCountSessions![0];
    expect(session.status).toBe("posted"); expect(state.inventoryMovements.filter((movement) => movement.sourceDocument === session.documentNo && movement.movementType === "adjustment")).toHaveLength(1);
    const replay = command(state, "approveInventoryCountSession", "approve", session.id, { expectedVersion: session.version }); expect(replay.severity).toBe("warning"); expect(replay.state.inventoryMovements).toHaveLength(state.inventoryMovements.length);
  });
  it("requires a recount instead of posting when relevant stock changes", () => {
    let state = createInitialOperationsState(); state = command(state, "createInventoryCountSession", "stale-create", undefined, { warehouseId: "wh-main" }).state; const sessionId = state.inventoryCountSessions![0].id; state = recordAllLines(state, sessionId); let session = state.inventoryCountSessions![0]; state = command(state, "submitInventoryCountSession", "stale-submit", session.id, { expectedVersion: session.version }).state; const firstLine = state.inventoryCountSessions![0].lines[0]; state.inventoryMovements.push({ id: "im-count-stale", movementType: "receipt", sourceDocument: "PO-STALE", postingKey: "receipt-count-stale", warehouseId: state.inventoryCountSessions![0].warehouseId, productUnitId: firstLine.productUnitId, quantity: 1, unitCost: 1, postedAt: now }); session = state.inventoryCountSessions![0]; const result = command(state, "approveInventoryCountSession", "stale-approve", session.id, { expectedVersion: session.version });
    expect(result.severity).toBe("warning"); expect(result.state.inventoryCountSessions![0].status).toBe("needs_recount"); expect(result.state.inventoryMovements.filter((movement) => movement.sourceDocument === session.documentNo)).toHaveLength(0);
  });
  it("does not allow warehouse staff to post or reverse a count session", () => { const state = createInitialOperationsState(); expect(() => command(state, "approveInventoryCountSession", "warehouse-denied", "missing", { expectedVersion: 1 }, createRoleActor("warehouse"))).toThrow("không có quyền"); });
});
