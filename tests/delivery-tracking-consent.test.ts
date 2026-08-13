import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsActor } from "@/modules/operations/types";
import { DeliveryTrackingService } from "@/server/delivery-tracking/service";
import { nativeTrackingConsentPolicyVersion } from "@/server/delivery-tracking/types";
import { MemoryDeliveryTrackingStore } from "@/server/infrastructure/file-delivery-tracking-store";

const now = new Date("2026-08-01T08:00:00.000Z");

describe("delivery tracking consent", () => {
  it("records one versioned consent and audit event when concurrent retries use the same request key", async () => {
    const { service, actor, job, store } = fixture();
    const input = { deliveryJobId: job.id, policyVersion: nativeTrackingConsentPolicyVersion, idempotencyKey: "gps-consent-retry-0001" };
    const [first, retry] = await Promise.all([service.grantConsent(actor, input), service.grantConsent(actor, input)]);

    expect([first.created, retry.created].filter(Boolean)).toHaveLength(1);
    const snapshot = await store.getSnapshot();
    expect(snapshot.consents).toHaveLength(1);
    expect(snapshot.events.filter((event) => event.action === "tracking_consent_granted")).toHaveLength(1);
    await expect(service.start(actor, job.id)).resolves.toMatchObject({ created: true });
  });

  it("allows only the assigned driver to grant consent for an in-transit job", async () => {
    const { service, job } = fixture();
    const worker: OperationsActor = { id: "worker-actor", employeeId: "emp-worker-nam", displayName: "Thợ khác", role: "worker", permissions: ["delivery.submit_completion"] };

    await expect(service.grantConsent(worker, {
      deliveryJobId: job.id,
      policyVersion: nativeTrackingConsentPolicyVersion,
      idempotencyKey: "gps-consent-worker-0001"
    })).rejects.toMatchObject({ status: 403 });
  });

  it("uses optimistic versioning and one audit event when a consent is revoked then retried", async () => {
    const { service, actor, job, store } = fixture();
    const granted = await service.grantConsent(actor, {
      deliveryJobId: job.id,
      policyVersion: nativeTrackingConsentPolicyVersion,
      idempotencyKey: "gps-consent-revoke-0001"
    });
    const input = { consentId: granted.consent.id, expectedVersion: granted.consent.version, idempotencyKey: "gps-consent-revoke-0002" };
    const first = await service.revokeConsent(actor, input);
    const retry = await service.revokeConsent(actor, input);

    expect(first.consent).toMatchObject({ status: "revoked", version: 2 });
    expect(retry.replayed).toBe(true);
    expect((await store.getSnapshot()).events.filter((event) => event.action === "tracking_consent_revoked")).toHaveLength(1);
    await expect(service.start(actor, job.id)).rejects.toMatchObject({ status: 412 });
  });
});

function fixture() {
  const state = createInitialOperationsState();
  const job = state.deliveryJobs[0];
  if (!job) throw new Error("Missing delivery fixture.");
  job.status = "in_transit";
  const driver = state.employees.find((employee) => employee.id === job.driverId);
  if (!driver) throw new Error("Missing delivery driver fixture.");
  const actor: OperationsActor = {
    id: "driver-actor",
    employeeId: driver.id,
    displayName: driver.displayName,
    role: "driver",
    permissions: ["delivery.dispatch"]
  };
  const store = new MemoryDeliveryTrackingStore();
  return { service: new DeliveryTrackingService(store, async () => state, () => now), actor, job, store };
}
