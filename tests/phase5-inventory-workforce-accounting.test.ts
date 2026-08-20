import { readSheetNames } from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import { createAccountingXlsxExport } from "../src/modules/operations/accounting-export";
import { createAuditIntegrityReport } from "../src/modules/operations/audit-integrity";
import { runCreateCommand } from "../src/modules/operations/create-commands";
import { createRoleActor } from "../src/modules/operations/identity";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { getAssignableWorkers, stockBalance } from "../src/modules/operations/selectors";
import { createOwnerActor, runOperation } from "../src/modules/operations/service";
import { OperationsCommandService } from "../src/server/application/operations-command-service";
import { MemoryOperationsBackend } from "../src/server/infrastructure/memory-operations-backend";

const now = "2026-08-20T10:00:00.000+07:00";

describe("Phase 5 inventory, workforce, and accounting exports", () => {
  it("posts opening stock as one idempotent, audited movement and corrects it by reversal", async () => {
    const backend = new MemoryOperationsBackend(createInitialOperationsState());
    const service = new OperationsCommandService(backend);
    const startingBalance = stockBalance(backend.getState(), "wh-main", "pu-brick-vien");
    const command = {
      operation: "postOpeningInventory" as const,
      actor: createOwnerActor(),
      now,
      idempotencyKey: "phase5-opening-brick-0001",
      options: {
        warehouseId: "wh-main",
        productUnitId: "pu-brick-vien",
        quantity: 25,
        unitCost: 3150,
        reason: "Đối chiếu tồn đầu kỳ kho chính"
      }
    };

    const first = await service.execute(command);
    const retry = await service.execute(command);
    const opening = first.state.inventoryMovements.find((movement) => movement.postingKey.startsWith("opening-TDK-"));

    expect(first.severity).toBe("success");
    expect(retry.severity).toBe("warning");
    expect(opening).toMatchObject({ movementType: "opening", quantity: 25, unitCost: 3150, reason: "Đối chiếu tồn đầu kỳ kho chính" });
    expect(stockBalance(backend.getState(), "wh-main", "pu-brick-vien")).toBe(startingBalance + 25);
    expect(backend.getState().auditLogs.filter((entry) => entry.action === "postOpeningInventory")).toHaveLength(1);

    const reversed = await service.execute({
      operation: "reverseInventoryMovement",
      actor: createOwnerActor(),
      now,
      targetId: opening!.id,
      idempotencyKey: "phase5-opening-brick-reverse-0001",
      options: { reason: "Đảo tồn đầu kỳ do biên bản đối chiếu mới" }
    });
    const reverse = reversed.state.inventoryMovements.find((movement) => movement.postingKey === `reverse-${opening!.id}`);

    expect(reverse).toMatchObject({ movementType: "reverse", quantity: -25, unitCost: 3150 });
    expect(reversed.state.inventoryMovements.find((movement) => movement.id === opening!.id)?.reversedById).toBe(reverse!.id);
    expect(stockBalance(reversed.state, "wh-main", "pu-brick-vien")).toBe(startingBalance);
    expect(createAuditIntegrityReport(reversed.state).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("enforces opening-stock permission and warehouse scope on the server", () => {
    const state = createInitialOperationsState();
    const options = { warehouseId: "wh-main", productUnitId: "pu-brick-vien", quantity: 1, unitCost: 1, reason: "Đối chiếu tồn đầu kỳ" };

    expect(() => runOperation({
      state,
      operation: "postOpeningInventory",
      actor: createRoleActor("worker"),
      now,
      idempotencyKey: "phase5-opening-worker-denied",
      options
    })).toThrow("quyền");
    expect(() => runOperation({
      state,
      operation: "postOpeningInventory",
      actor: { ...createRoleActor("warehouse"), warehouseIds: ["wh-secondary"] },
      now,
      idempotencyKey: "phase5-opening-scope-denied",
      options
    })).toThrow("ngoài phạm vi");
  });

  it("uses the active-worker selector and rejects non-worker submission even when the client is bypassed", () => {
    const state = createInitialOperationsState();
    const owner = createOwnerActor();
    const workerIds = getAssignableWorkers(state, owner).map((employee) => employee.id);
    const nonWorker = state.employees.find((employee) => employee.status === "active" && employee.roleType !== "worker");
    const worker = state.employees.find((employee) => employee.status === "active" && employee.roleType === "worker");

    expect(workerIds).toContain(worker!.id);
    expect(workerIds).not.toContain(nonWorker!.id);
    expect(() => runCreateCommand({
      state,
      actor: owner,
      now,
      idempotencyKey: "phase5-work-output-non-worker",
      command: { type: "createWorkOrderDraft", employeeId: nonWorker!.id, productUnitId: "pu-brick-vien", actualQuantity: 1, totalAmount: 1000 }
    })).toThrow("thợ đang hoạt động");
  });

  it("allows managers to assign an active worker with a version guard and rejects another role", () => {
    let state = createInitialOperationsState();
    state = runOperation({ state, operation: "confirmSalesOrder", actor: createOwnerActor(), now, idempotencyKey: "phase5-manager-assign-confirm" }).state;
    const openOrder = state.workOrders.find((order) => order.status === "open" && order.salesOrderId);
    const worker = state.employees.find((employee) => employee.status === "active" && employee.roleType === "worker");
    const nonWorker = state.employees.find((employee) => employee.status === "active" && employee.roleType !== "worker");

    const assigned = runOperation({
      state,
      operation: "assignSalesWorkOrder",
      actor: createRoleActor("supervisor"),
      now,
      targetId: openOrder!.id,
      idempotencyKey: "phase5-manager-assign-worker",
      options: { employeeId: worker!.id, expectedVersion: openOrder!.version }
    });
    expect(assigned.state.workOrders.find((order) => order.id === openOrder!.id)).toMatchObject({ status: "assigned", claimedByEmployeeId: worker!.id });
    expect(() => runOperation({
      state,
      operation: "assignSalesWorkOrder",
      actor: createRoleActor("supervisor"),
      now,
      targetId: openOrder!.id,
      idempotencyKey: "phase5-manager-assign-non-worker",
      options: { employeeId: nonWorker!.id, expectedVersion: openOrder!.version }
    })).toThrow("Thợ được chỉ định không hợp lệ");
  });

  it("creates a valid, selected-sheet XLSX export from authoritative report data", async () => {
    const state = createInitialOperationsState();
    state.cashTransactions.push({
      id: "cash-phase5-in-range",
      accountName: "Tiền mặt",
      sourceDocument: "PT-PHASE5",
      direction: "in",
      amount: 250000,
      postedAt: "2026-07-15T09:00:00.000+07:00"
    });
    state.cashTransactions.push({
      id: "cash-phase5-out-range",
      accountName: "Tiền mặt",
      sourceDocument: "PT-PHASE5-OLD",
      direction: "in",
      amount: 999999,
      postedAt: "2026-06-30T09:00:00.000+07:00"
    });
    const exported = createAccountingXlsxExport(state, {
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
      datasetIds: ["summary", "cash", "inventory"],
      generatedAt: now
    });
    const sheetNames = await readSheetNames(Buffer.from(exported.bytes));
    const workbookText = new TextDecoder().decode(exported.bytes);

    expect(exported.fileName).toBe("du-lieu-ke-toan-2026-07-01-den-2026-07-31.xlsx");
    expect(Array.from(exported.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(sheetNames).toEqual(["Tổng hợp", "Sổ quỹ", "Phát sinh kho"]);
    expect(workbookText).toContain("PT-PHASE5");
    expect(workbookText).not.toContain("PT-PHASE5-OLD");
  });
});
