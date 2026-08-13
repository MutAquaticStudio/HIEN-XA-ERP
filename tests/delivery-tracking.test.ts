import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsActor } from "@/modules/operations/types";
import { DeliveryTrackingService } from "@/server/delivery-tracking/service";
import { MemoryDeliveryTrackingStore } from "@/server/infrastructure/file-delivery-tracking-store";

const now = new Date("2026-07-22T08:00:00.000Z");

describe("delivery live tracking", () => {
  it("allows an assigned driver to start and record idempotent GPS points", async () => {
    const { service, actor, job } = createFixture();
    await service.grantConsent(actor, {
      deliveryJobId: job.id,
      policyVersion: "2026-07-29",
      idempotencyKey: "gps-consent-start-0001"
    });
    const started = await service.start(actor, job.id);
    expect(started.created).toBe(true);

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
    const manager: OperationsActor = {
      id: "user-dispatcher-link-test",
      displayName: "Điều phối giao hàng",
      role: "dispatcher",
      permissions: ["delivery.dispatch"]
    };
    const share = await service.createPublicShare(manager, started.session.id);
    const publicView = await service.getPublicTracking(share.publicToken);
    expect(publicView?.documentNo).toBe(job.documentNo);
    expect(publicView?.session.driverLabel).toBe("Tài xế đang giao hàng");
  });

  it("rejects non-assigned users and stops customer sharing after the session ends", async () => {
    const { service, actor, job } = createFixture();
    await service.grantConsent(actor, {
      deliveryJobId: job.id,
      policyVersion: "2026-07-29",
      idempotencyKey: "gps-consent-start-0002"
    });
    const started = await service.start(actor, job.id);
    const intruder: OperationsActor = { id: "other", displayName: actor.displayName, role: "worker", permissions: ["delivery.submit_completion"] };

    await expect(service.recordPoint(intruder, {
      sessionId: started.session.id,
      clientPointId: "point-0002-other",
      recordedAt: now.toISOString(),
      latitude: 10.7,
      longitude: 106.6
    })).rejects.toThrow("phân công");

    const stopped = await service.stop(actor, started.session.id);
    expect(stopped.status).toBe("stopped");
  });

  it("shows every active trip and its audit trail to an authorized administrator", async () => {
    const { service, actor, job, store } = createFixture();
    await service.grantConsent(actor, {
      deliveryJobId: job.id,
      policyVersion: "2026-07-29",
      idempotencyKey: "gps-consent-start-0003"
    });
    const started = await service.start(actor, job.id);
    await service.recordPoint(actor, {
      sessionId: started.session.id,
      clientPointId: "point-0003-admin-view",
      recordedAt: now.toISOString(),
      latitude: 10.762622,
      longitude: 106.660172
    });

    const administrator: OperationsActor = {
      id: "user-dispatcher-test",
      displayName: "Dieu phoi giao hang",
      role: "administrator",
      permissions: ["delivery.dispatch"]
    };
    const overview = await service.getOverview(administrator);

    expect(overview.canManage).toBe(true);
    expect(overview.sessions).toHaveLength(1);
    expect(overview.sessions[0]).toMatchObject({
      id: started.session.id,
      documentNo: job.documentNo,
      driverLabel: actor.displayName
    });
    expect(overview.sessions[0]?.points).toHaveLength(1);
    expect((await store.getSnapshot()).events.some((event) => event.action === "tracking_started" && event.actorId === actor.id)).toBe(true);
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
      employeeId: driver.id,
      role: "driver",
    permissions: ["delivery.start_loading", "delivery.dispatch"]
  };
  const store = new MemoryDeliveryTrackingStore();
  return {
    service: new DeliveryTrackingService(store, async () => state, () => now),
    actor,
    job,
    store
  };
}
