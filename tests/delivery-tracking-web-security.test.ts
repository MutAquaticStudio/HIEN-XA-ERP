import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsActor } from "@/modules/operations/types";
import { DeliveryTrackingService } from "@/server/delivery-tracking/service";
import { MemoryDeliveryTrackingStore } from "@/server/infrastructure/file-delivery-tracking-store";

describe("web-first delivery tracking hardening", () => {
  it("requires an explicit manager-created public link and hides driver identity from customers", async () => {
    const fixture = createFixture();
    const started = await startTrackingWithConsent(fixture);
    expect(started.created).toBe(true);
    expect(await fixture.service.getPublicTracking("a".repeat(32))).toBeUndefined();

    await fixture.service.recordPoint(fixture.driver, point(started.session.id, fixture.clock.current));
    const share = await fixture.service.createPublicShare(fixture.manager, started.session.id);
    const publicView = await fixture.service.getPublicTracking(share.publicToken);
    expect(publicView?.session.driverLabel).toBe("Tài xế đang giao hàng");
    expect(publicView?.session.points[0]?.latitude).not.toBe(10.762622);

    await fixture.service.revokePublicShare(fixture.manager, started.session.id);
    await expect(fixture.service.getPublicTracking(share.publicToken)).resolves.toBeUndefined();
  });

  it("allows only the assigned driver, rate-limits nearby points, and flags implausible travel", async () => {
    const fixture = createFixture();
    const started = await startTrackingWithConsent(fixture);
    await fixture.service.recordPoint(fixture.driver, point(started.session.id, fixture.clock.current));
    fixture.clock.advance(5_000);
    const throttled = await fixture.service.recordPoint(fixture.driver, { ...point(started.session.id, fixture.clock.current), clientPointId: "point-throttle-001", latitude: 10.762623, longitude: 106.660173 });
    expect(throttled.pointAccepted).toBe(false);

    fixture.clock.advance(30_000);
    const suspect = await fixture.service.recordPoint(fixture.driver, { ...point(started.session.id, fixture.clock.current), clientPointId: "point-suspect-001", latitude: 10.9, longitude: 106.9 });
    expect(suspect.points.at(-1)).toMatchObject({ quality: "suspect", suspectReason: "impossible_speed" });

    const intruder: OperationsActor = { id: "intruder", displayName: "Người khác", role: "driver", permissions: ["delivery.dispatch"] };
    await expect(fixture.service.recordPoint(intruder, point(started.session.id, fixture.clock.current))).rejects.toThrow("phân công");
  });

  it("purges raw GPS after 90 days while preserving the session audit", async () => {
    const fixture = createFixture();
    const started = await startTrackingWithConsent(fixture);
    await fixture.service.recordPoint(fixture.driver, point(started.session.id, fixture.clock.current));
    await fixture.service.stop(fixture.driver, started.session.id);
    fixture.clock.advance(91 * 24 * 60 * 60 * 1_000);

    const result = await fixture.service.runRetention();
    expect(result).toMatchObject({ purgedSessions: 1, purgedPoints: 1, dryRun: false });
    const snapshot = await fixture.store.getSnapshot();
    expect(snapshot.sessions[0]?.points).toEqual([]);
    expect(snapshot.events.some((event) => event.action === "tracking_retention_purged")).toBe(true);
  });
});

function createFixture() {
  const state = createInitialOperationsState();
  const job = state.deliveryJobs[0]!;
  job.status = "in_transit";
  const driverEmployee = state.employees.find((employee) => employee.id === job.driverId)!;
  const clock = {
    current: new Date("2026-07-28T08:00:00.000Z"),
    advance(milliseconds: number) { this.current = new Date(this.current.getTime() + milliseconds); }
  };
  const store = new MemoryDeliveryTrackingStore();
  return {
    store,
    clock,
    job,
    driver: { id: "driver-identity", displayName: driverEmployee.displayName, employeeId: driverEmployee.id, role: "driver", permissions: ["delivery.dispatch"] } as OperationsActor,
    manager: { id: "manager-identity", displayName: "Điều phối", role: "dispatcher", permissions: ["delivery.dispatch"] } as OperationsActor,
    service: new DeliveryTrackingService(store, async () => state, () => clock.current)
  };
}

function point(sessionId: string, at: Date) {
  return { sessionId, clientPointId: `point-${at.getTime()}-gps`, recordedAt: at.toISOString(), latitude: 10.762622, longitude: 106.660172, accuracyMeters: 8 };
}

async function startTrackingWithConsent(fixture: ReturnType<typeof createFixture>) {
  await fixture.service.grantConsent(fixture.driver, {
    deliveryJobId: fixture.job.id,
    policyVersion: "2026-07-29",
    idempotencyKey: `web-security-consent-${fixture.job.id}`
  });
  return fixture.service.start(fixture.driver, fixture.job.id);
}
