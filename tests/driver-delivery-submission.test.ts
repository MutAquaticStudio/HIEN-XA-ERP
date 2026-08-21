import { describe, expect, it } from "vitest";
import { createRoleActor } from "@/modules/operations/identity";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import { runOperation } from "@/modules/operations/commands";
import type { OperationsActor, OperationsState } from "@/modules/operations/types";

const now = "2026-07-29T05:00:00.000Z";

function run(state: OperationsState, operation: Parameters<typeof runOperation>[0]["operation"], actor: OperationsActor, targetId?: string, options?: Parameters<typeof runOperation>[0]["options"]) {
  return runOperation({
    state,
    operation,
    actor,
    now,
    idempotencyKey: `driver-native-${operation}-${targetId ?? "workspace"}`,
    targetId,
    options
  }).state;
}

describe("driver mobile delivery submission", () => {
  it("allows an assigned driver to submit photo evidence for approval without posting delivery or receivables", () => {
    let state = createInitialOperationsState();
    const owner = createRoleActor("owner");
    state = run(state, "confirmSalesOrder", owner, "so-001");
    state = run(state, "allocateSalesSources", owner, "so-001");
    state = run(state, "postGoodsReceipt", owner, "po-001-line-cement", { quantity: 120 });
    state = run(state, "startDeliveryLoading", owner, "dj-001");
    state = run(state, "dispatchDelivery", owner, "dj-001");

    const employee = state.employees.find((item) => item.roleType === "driver");
    expect(employee).toBeDefined();
    const driver: OperationsActor = {
      id: "user-driver-native",
      displayName: employee!.displayName,
      employeeId: employee!.id,
      role: "driver",
      permissions: ["delivery.submit_completion"]
    };

    state = run(state, "submitDeliveryCompletion", driver, "dj-001", {
      recipientName: "Người nhận UAT",
      evidence: "Ảnh giao nhận từ ứng dụng Android",
      attachments: [{
        id: "delivery-native-photo-001",
        fileName: "delivery.jpg",
        contentType: "image/jpeg",
        size: 1024,
        sha256: "a".repeat(64),
        uploadedBy: driver.id,
        uploadedAt: now
      }]
    });

    expect(state.deliveryJobs.find((job) => job.id === "dj-001")?.status).toBe("in_transit");
    expect(state.approvalRequests).toHaveLength(1);
    expect(state.approvalRequests[0]).toMatchObject({ type: "delivery_completion", status: "pending", submittedBy: driver.id });
    expect(state.inventoryMovements.filter((movement) => movement.movementType === "issue")).toHaveLength(0);
    expect(state.customerLedgerEntries).toHaveLength(0);
    expect(() => run(state, "completeDelivery", driver, "dj-001")).toThrow();
  });
});
