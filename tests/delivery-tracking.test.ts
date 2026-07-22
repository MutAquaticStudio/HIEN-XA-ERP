import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsActor } from "@/modules/operations/types";
import { DeliveryTrackingService } from "@/server/delivery-tracking/service";
import { MemoryDeliveryTrackingStore } from "@/server/infrastructure/file-delivery-tracking-store";

const now = new Date("2026-07-22T08:00:00.000Z");

describe("delivery live tracking", () => {
  it("allows an assigned driver to start and record idempotent GPS points", async () => {
    const { service, actor, job } = createFixture();
    const started = await service.start(actor, job.id);
    expect(started.publicToken).toMatch(/^[A-Za-z0-9_-]{30,}$/);

    const first = await service.recordPoint(actor, {
      sessionId: started.session.id,
      clientPointId: "point-0001-driver",
      recordedAt: now.toISOString(),
      latitude: 10.762622,
      longitude: 106.660172,
      accuracyMeters: 8
    });
    const retry = await service.recordPoint(actor, {
      sessionId: started.session.id,
      clientPointId: "point-0001-driver",
      recordedAt: now.toISOString(),
      latitude: 10.762622,
      longitude: 106.660172,
      accuracyMeters: 8
    });

    expect(first.points).toHaveLength(1);
    expect(retry.points).toHaveLength(1);
    const publicView = await service.getPublicTracking(started.publicToken!);
    expect(publicView?.documentNo).toBe(job.documentNo);
    expect(publicView?.session.driverLabel).toBe("Tai xe dang giao hang");
  });

  it("rejects non-assigned users and stops customer sharing after the session ends", async () => {
    const { service, actor, job } = createFixture();
    const started = await service.start(actor, job.id);
    const intruder: OperationsActor = { id: "other", displayName: "Nguoi khac", role: "worker", permissions: ["delivery.submit_completion"] };

    await expect(service.recordPoint(intruder, {
      sessionId: started.session.id,
      clientPointId: "point-0002-other",
      recordedAt: now.toISOString(),
      latitude: 10.7,
      longitude: 106.6
    })).rejects.toThrow("phan cong");

    const stopped = await service.stop(actor, started.session.id);
    expect(stopped.status).toBe("stopped");
  });
});

function createFixture() {
  const state = createInitialOperationsState();
  const job = state.deliveryJobs[0];
  if (!job) throw new Error("Missing delivery fixture.");
  job.status = "in_transit";
  const driver = state.employees.find((employee) => employee.id === job.driverId);
  if (!driver) throw new Error("Missing delivery driver fixture.");
  const actor: OperationsActor = {
    id: "user-driver-test",
    displayName: driver.displayName,
    role: "driver",
    permissions: ["delivery.start_loading", "delivery.dispatch"]
  };
  return {
    service: new DeliveryTrackingService(new MemoryDeliveryTrackingStore(), async () => state, () => now),
    actor,
    job
  };
}
