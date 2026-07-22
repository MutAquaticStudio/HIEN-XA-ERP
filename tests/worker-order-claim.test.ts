import { describe, expect, it } from "vitest";
import { createRoleActor } from "../src/modules/operations/identity";
import { createOwnerActor } from "../src/modules/operations/service";
import { runCreateCommand } from "../src/modules/operations/create-commands";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { runOperation } from "../src/modules/operations/service";
import { projectOperationsState } from "../src/server/identity/operations-projection";
import { OperationsCommandService } from "../src/server/application/operations-command-service";
import { MemoryOperationsBackend } from "../src/server/infrastructure/memory-operations-backend";
import type { SafeIdentityUser } from "../src/server/identity/types";

const now = "2026-07-22T10:00:00.000+07:00";

describe("worker open-order claim workflow", () => {
  it("creates one claimable open-order task once and shows it to eligible workers", async () => {
    const { backend, openTask, confirmResult } = await createOpenOrderState({
      confirmIdempotencyKey: "claim-open-task-on-confirm"
    });

    expect(openTask).toMatchObject({
      salesOrderId: "so-001",
      sourceDocument: "SO-2026-0001",
      participants: [],
      outputs: [],
      version: 1
    });
    expect(
      backend
        .getState()
        .workOrders.filter((order) => order.status === "open" && order.salesOrderId === "so-001")
    ).toHaveLength(1);
    expect(confirmResult.state.auditLogs.filter((log) => log.action === "confirmSalesOrder")).toHaveLength(1);

    const projected = projectOperationsState(
      backend.getState(),
      workerIdentity("Nguyen Van Nam")
    );

    expect(projected.workOrders).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: openTask.id, status: "open", salesOrderId: "so-001" })])
    );
  });

  it("allows an eligible worker to claim successfully and stores assignee, status, and claim timestamp", async () => {
    const { service, openTask, backend } = await createOpenOrderState({
      confirmIdempotencyKey: "claim-workflow-success"
    });

    const result = await service.execute({
      operation: "claimOpenSalesWorkOrder",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: { expectedVersion: openTask.version },
      idempotencyKey: "claim-workflow-success-worker-1"
    });

    const assigned = result.state.workOrders.find((order) => order.id === openTask.id);
    expect(result.severity).toBe("success");
    expect(assigned).toMatchObject({
      status: "assigned",
      claimedByEmployeeId: "emp-worker-nam",
      claimedAt: now,
      version: 2,
      participants: [{ employeeId: "emp-worker-nam", shareFactor: 1 }]
    });
    expect(backend.getState().workOrders.find((order) => order.id === openTask.id)).toMatchObject({
      status: "assigned",
      claimedByEmployeeId: "emp-worker-nam"
    });
  });

  it("lets the claimed worker record GPS location for the assigned work order", async () => {
    const { service, openTask } = await createOpenOrderState({
      confirmIdempotencyKey: "claim-record-location-success-confirm"
    });

    await service.execute({
      operation: "claimOpenSalesWorkOrder",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: { expectedVersion: openTask.version },
      idempotencyKey: "claim-record-location-success-claim"
    });

    const result = await service.execute({
      operation: "recordWorkOrderLocation",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: {
        location: {
          latitude: 10.762622,
          longitude: 106.660172,
          recordedAt: now,
          accuracyMeters: 6.5,
          source: "gps"
        }
      },
      idempotencyKey: "claim-record-location-success"
    });

    const assigned = result.state.workOrders.find((order) => order.id === openTask.id);
    expect(result.severity).toBe("success");
    expect(assigned?.locationHistory).toHaveLength(1);
    expect(assigned?.locationHistory?.[0]).toMatchObject({
      employeeId: "emp-worker-nam",
      latitude: 10.762622,
      longitude: 106.660172,
      source: "gps"
    });
  });

  it("prevents non-workers from recording work order location", async () => {
    const { service, openTask } = await createOpenOrderState({
      confirmIdempotencyKey: "record-location-block-non-worker"
    });

    await service.execute({
      operation: "claimOpenSalesWorkOrder",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: { expectedVersion: openTask.version },
      idempotencyKey: "record-location-block-non-worker-claim"
    });

    await expect(
      service.execute({
        operation: "recordWorkOrderLocation",
        actor: createOwnerActor(),
        now,
        targetId: openTask.id,
        options: {
          location: {
            latitude: 10.1,
            longitude: 106.6
          }
        },
        idempotencyKey: "record-location-block-non-worker-action"
      })
    ).rejects.toThrow();
  });

  it("prevents already assigned non-owner workers from recording another worker location", async () => {
    const { service, openTask } = await createOpenOrderState({
      confirmIdempotencyKey: "record-location-block-other-worker"
    });

    await service.execute({
      operation: "claimOpenSalesWorkOrder",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: { expectedVersion: openTask.version },
      idempotencyKey: "record-location-block-other-worker-claim"
    });

    await expect(
      service.execute({
        operation: "recordWorkOrderLocation",
        actor: workerActor("Pham Van Hai"),
        now,
        targetId: openTask.id,
        options: {
          location: {
            latitude: 10.1,
            longitude: 106.6
          }
        },
        idempotencyKey: "record-location-block-other-worker-action"
      })
    ).rejects.toThrow();
  });

  it("keeps location history stable with idempotent retry for location recording", async () => {
    const { service, openTask } = await createOpenOrderState({
      confirmIdempotencyKey: "record-location-retry"
    });

    await service.execute({
      operation: "claimOpenSalesWorkOrder",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: { expectedVersion: openTask.version },
      idempotencyKey: "record-location-retry-claim"
    });

    const first = await service.execute({
      operation: "recordWorkOrderLocation",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: {
        location: {
          latitude: 10.1,
          longitude: 106.6,
          source: "manual"
        }
      },
      idempotencyKey: "record-location-retry-key"
    });

    const retry = await service.execute({
      operation: "recordWorkOrderLocation",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: {
        location: {
          latitude: 10.1,
          longitude: 106.6,
          source: "manual"
        }
      },
      idempotencyKey: "record-location-retry-key"
    });

    const assigned = first.state.workOrders.find((order) => order.id === openTask.id);
    expect(first.severity).toBe("success");
    expect(retry.severity).toBe("warning");
    expect(assigned?.locationHistory).toHaveLength(1);
  });

  it("adds the first worker who claims an already assigned delivery job as its helper", async () => {
    const { backend, openTask } = await createOpenOrderState({
      confirmIdempotencyKey: "claim-existing-delivery"
    });
    const preparedState = backend.getState();
    const order = preparedState.salesOrders.find((item) => item.id === "so-001");
    if (!order) {
      throw new Error("Missing sales order.");
    }
    order.status = "allocated";
    preparedState.deliveryJobs = [];
    preparedState.deliveryJobs.push({
      id: "dj-claim-link",
      documentNo: "GH-CLAIM-LINK",
      salesOrderId: order.id,
      driverId: "emp-driver-dung",
      vehicleId: "vehicle-truck-01",
      helperIds: [],
      plannedDate: "2026-07-22",
      status: "assigned"
    });
    const linkedBackend = new MemoryOperationsBackend(preparedState);
    const linkedService = new OperationsCommandService(linkedBackend);

    await linkedService.execute({
      operation: "claimOpenSalesWorkOrder",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: { expectedVersion: openTask.version },
      idempotencyKey: "claim-existing-delivery-worker"
    });

    expect(linkedBackend.getState().deliveryJobs.find((job) => job.id === "dj-claim-link")?.helperIds).toEqual(["emp-worker-nam"]);
  });

  it("assigns the first claimant as helper when a dispatcher creates the delivery later", () => {
    let state = createInitialOperationsState();
    state.deliveryJobs = [];
    state = runOperation({
      state,
      operation: "confirmSalesOrder",
      actor: createOwnerActor(),
      now,
      idempotencyKey: "claim-before-delivery-confirm"
    }).state;
    const openTask = state.workOrders.find((order) => order.status === "open" && order.salesOrderId === "so-001");
    if (!openTask) {
      throw new Error("Missing open task.");
    }
    state = runOperation({
      state,
      operation: "claimOpenSalesWorkOrder",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: { expectedVersion: openTask.version },
      idempotencyKey: "claim-before-delivery-worker"
    }).state;
    const order = state.salesOrders.find((item) => item.id === "so-001");
    if (!order) {
      throw new Error("Missing sales order.");
    }
    order.status = "allocated";
    order.lines[0] = { ...order.lines[0]!, sourceType: "warehouse", warehouseId: "wh-main" };

    const result = runCreateCommand({
      state,
      command: {
        type: "createDeliveryJob",
        salesOrderId: order.id,
        driverId: "emp-driver-dung",
        vehicleId: "vehicle-truck-01",
        plannedDate: "2026-07-22"
      },
      actor: createOwnerActor(),
      now,
      idempotencyKey: "claim-before-delivery-create"
    });

    expect(result.state.deliveryJobs.at(-1)?.helperIds).toEqual(["emp-worker-nam"]);
  });

  it("blocks non-workers from claiming open orders", async () => {
    const { service, openTask } = await createOpenOrderState({
      confirmIdempotencyKey: "claim-workflow-block-non-worker"
    });

    await expect(
      service.execute({
        operation: "claimOpenSalesWorkOrder",
        actor: createOwnerActor(),
        now,
        targetId: openTask.id,
        options: { expectedVersion: openTask.version },
        idempotencyKey: "claim-workflow-owner-blocked"
      })
    ).rejects.toThrow();
  });

  it("blocks worker users who are not mapped to an active worker profile", async () => {
    const { service, openTask } = await createOpenOrderState({
      confirmIdempotencyKey: "claim-workflow-block-mapped"
    });

    await expect(
      service.execute({
        operation: "claimOpenSalesWorkOrder",
        actor: workerActor("Other Person"),
        now,
        targetId: openTask.id,
        options: { expectedVersion: openTask.version },
        idempotencyKey: "claim-workflow-unmapped-blocked"
      })
    ).rejects.toThrow();
  });

  it("records ORDER_ALREADY_CLAIMED when another worker tries to take an already assigned order", async () => {
    const { service, openTask, backend } = await createOpenOrderState({
      confirmIdempotencyKey: "claim-workflow-already-assigned"
    });

    const winner = await service.execute({
      operation: "claimOpenSalesWorkOrder",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: { expectedVersion: openTask.version },
      idempotencyKey: "claim-workflow-winner"
    });

    const second = await service.execute({
      operation: "claimOpenSalesWorkOrder",
      actor: workerActor("Pham Van Hai"),
      now,
      targetId: openTask.id,
      options: { expectedVersion: openTask.version },
      idempotencyKey: "claim-workflow-loser"
    });

    expect(second.severity).toBe("warning");
    expect(second.summary).toContain("ORDER_ALREADY_CLAIMED");
    expect(winner.state.workOrders.find((order) => order.id === openTask.id)).toMatchObject({
      status: "assigned",
      claimedByEmployeeId: "emp-worker-nam",
      participants: [{ employeeId: "emp-worker-nam", shareFactor: 1 }]
    });

    expect(winner.state.auditLogs.filter((log) => log.action === "claimOpenSalesWorkOrder")).toHaveLength(1);
    expect(second.summary).toContain("ORDER_ALREADY_CLAIMED");
    expect(second.state.auditLogs.filter((log) => log.action === "claimOpenSalesWorkOrder")).toHaveLength(2);
    expect(second.state.auditLogs[0].summary).toContain("ORDER_ALREADY_CLAIMED");
  });

  it("handles near-simultaneous claims atomically: one success, one ORDER_ALREADY_CLAIMED", async () => {
    const { service, openTask } = await createOpenOrderState({
      confirmIdempotencyKey: "claim-workflow-concurrent"
    });

    const first = service.execute({
      operation: "claimOpenSalesWorkOrder",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: { expectedVersion: openTask.version },
      idempotencyKey: "claim-workflow-concurrent-nam"
    });
    const second = service.execute({
      operation: "claimOpenSalesWorkOrder",
      actor: workerActor("Pham Van Hai"),
      now,
      targetId: openTask.id,
      options: { expectedVersion: openTask.version },
      idempotencyKey: "claim-workflow-concurrent-hai"
    });

    const [namResult, haiResult] = await Promise.all([first, second]);
    const successCount = [namResult, haiResult].filter((result) => result.severity === "success").length;
    const warningCount = [namResult, haiResult].filter((result) => result.severity === "warning").length;

    expect(successCount).toBe(1);
    expect(warningCount).toBe(1);
  });

  it("is idempotent on retry request and updates wait-list visibility correctly", async () => {
    const { service, openTask } = await createOpenOrderState({
      confirmIdempotencyKey: "claim-workflow-idempotent"
    });

    const first = await service.execute({
      operation: "claimOpenSalesWorkOrder",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: { expectedVersion: openTask.version },
      idempotencyKey: "claim-workflow-retry"
    });

    const retry = await service.execute({
      operation: "claimOpenSalesWorkOrder",
      actor: workerActor("Nguyen Van Nam"),
      now,
      targetId: openTask.id,
      options: { expectedVersion: openTask.version },
      idempotencyKey: "claim-workflow-retry"
    });

    const winnerProjection = projectOperationsState(first.state, workerIdentity("Nguyen Van Nam"));
    const loserProjection = projectOperationsState(first.state, workerIdentity("Pham Van Hai"));

    expect(first.severity).toBe("success");
    expect(retry.severity).toBe("warning");
    expect(winnerProjection.workOrders.some((order) => order.id === openTask.id && order.status === "assigned")).toBe(true);
    expect(loserProjection.workOrders.some((order) => order.id === openTask.id)).toBe(false);

    expect(first.state.auditLogs.filter((log) => log.action === "claimOpenSalesWorkOrder")).toHaveLength(1);
  });
});

async function createOpenOrderState(input: { confirmIdempotencyKey: string }) {
  const backend = new MemoryOperationsBackend();
  const service = new OperationsCommandService(backend);

  const confirmResult = await service.execute({
    operation: "confirmSalesOrder",
    actor: createOwnerActor(),
    now,
    idempotencyKey: input.confirmIdempotencyKey
  });

  const openTask = backend.getState().workOrders.find((order) => order.status === "open");
  if (!openTask) {
    throw new Error("Missing open worker task.");
  }

  return { backend, service, openTask, confirmResult };
}

function workerActor(name: string) {
  return { ...createRoleActor("worker"), displayName: name };
}

function workerIdentity(name: string): SafeIdentityUser {
  return {
    id: "user-worker-claim",
    email: "worker-claim@hienxa.test",
    normalizedEmail: "worker-claim@hienxa.test",
    displayName: name,
    role: "worker",
    moduleIds: ["overview", "procurement", "delivery", "workforce"],
    status: "active",
    createdAt: now,
    updatedAt: now,
    failedLoginAttempts: 0,
    sessionVersion: 1
  };
}
