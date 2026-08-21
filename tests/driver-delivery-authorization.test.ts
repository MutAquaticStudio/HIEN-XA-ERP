import { describe, expect, it } from "vitest";
import { runOperation } from "@/modules/operations/commands";
import type { SafeIdentityUser } from "@/server/identity/types";
import { operationsActorForIdentity } from "@/server/identity/auth-context";
import { createUatUxV2OperationsState } from "@/server/testing/uat-ux-v2-fixture";

const now = "2026-08-13T12:00:00.000Z";

function driverUser(suffix = ""): SafeIdentityUser {
  const isolation = suffix === "-b";
  return {
    id: `uat-uxv2-user-driver${suffix}`,
    email: `uat.uxv2.driver${isolation ? ".b" : ""}@example.invalid`,
    normalizedEmail: `uat.uxv2.driver${isolation ? ".b" : ""}@example.invalid`,
    username: `uat.uxv2.driver${isolation ? ".b" : ""}`,
    normalizedUsername: `uat.uxv2.driver${isolation ? ".b" : ""}`,
    displayName: isolation ? "Tài xế đối chứng UAT UXV2" : "Tài xế UAT UXV2",
    role: "driver",
    employeeId: `uat-uxv2-employee-driver${suffix}`,
    moduleIds: ["overview", "delivery"],
    status: "active",
    createdAt: now,
    updatedAt: now,
    failedLoginAttempts: 0,
    sessionVersion: 1
  };
}

describe("assigned driver delivery authorization", () => {
  it("keeps only the narrow deviation permission for an assigned driver", () => {
    const actor = operationsActorForIdentity(driverUser());

    expect(actor.permissions).toContain("delivery.request_quantity_change");
    expect(actor.permissions).not.toContain("delivery.approve_quantity_change");
    expect(actor.permissions).not.toContain("inventory.post_transfer");
    expect(actor.permissions).not.toContain("cash.confirm_receipt");
  });

  it("allows Driver A to report a deviation on the assigned trip without changing delivered quantity", () => {
    const state = createUatUxV2OperationsState();
    const actor = operationsActorForIdentity(driverUser());
    const result = runOperation({
      state,
      operation: "requestDeliveryQuantityChange",
      actor,
      now,
      idempotencyKey: "driver-own-deviation-001",
      targetId: "uat-uxv2-delivery-job",
      options: {
        reason: "Không giao được dòng hàng này trong chuyến thử",
        lineQuantities: { "uat-uxv2-sales-line": 0 }
      }
    });

    expect(result.state.deliveryJobs.find((job) => job.id === "uat-uxv2-delivery-job")?.quantityChangeRequest).toMatchObject({
      status: "pending",
      requestedLineQuantities: { "uat-uxv2-sales-line": 0 },
      submittedBy: "uat-uxv2-user-driver"
    });
    expect(result.state.salesOrders.find((order) => order.id === "uat-uxv2-sales-order")?.lines[0]?.deliveredQuantity).toBe(0);
  });

  it("denies Driver B on Driver A's trip", () => {
    const state = createUatUxV2OperationsState();
    const actor = operationsActorForIdentity(driverUser("-b"));

    expect(() => runOperation({
      state,
      operation: "requestDeliveryQuantityChange",
      actor,
      now,
      idempotencyKey: "driver-cross-deviation-001",
      targetId: "uat-uxv2-delivery-job",
      options: {
        reason: "Yêu cầu truy cập chéo phải bị từ chối",
        lineQuantities: { "uat-uxv2-sales-line": 0 }
      }
    })).toThrow(/không được phân công/i);
  });
});
