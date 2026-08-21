import { describe, expect, it } from "vitest";
import { canStartNativeBackgroundTracking, nativeTrackingConsentPolicyVersion } from "../apps/mobile/lib/tracking-consent-policy";

describe("native tracking consent policy", () => {
  it("allows only an assigned driver during an in-transit delivery", () => {
    expect(nativeTrackingConsentPolicyVersion).toBe("2026-07-29");
    expect(canStartNativeBackgroundTracking({ role: "driver", deliveryStatus: "in_transit", trackingEligible: true })).toBe(true);
  });

  it("denies workers, managers, pre-dispatch jobs, and ineligible jobs", () => {
    expect(canStartNativeBackgroundTracking({ role: "worker", deliveryStatus: "in_transit", trackingEligible: true })).toBe(false);
    expect(canStartNativeBackgroundTracking({ role: "owner", deliveryStatus: "in_transit", trackingEligible: true })).toBe(false);
    expect(canStartNativeBackgroundTracking({ role: "driver", deliveryStatus: "assigned", trackingEligible: true })).toBe(false);
    expect(canStartNativeBackgroundTracking({ role: "driver", deliveryStatus: "in_transit", trackingEligible: false })).toBe(false);
  });
});
