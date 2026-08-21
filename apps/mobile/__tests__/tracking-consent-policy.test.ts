import { canStartNativeBackgroundTracking, nativeTrackingConsentPolicyVersion } from "../lib/tracking-consent-policy";

describe("tracking consent policy", () => {
  it("only allows an assigned driver on an in-transit trip", () => {
    expect(canStartNativeBackgroundTracking({ role: "driver", deliveryStatus: "in_transit", trackingEligible: true })).toBe(true);
    expect(canStartNativeBackgroundTracking({ role: "worker", deliveryStatus: "in_transit", trackingEligible: true })).toBe(false);
    expect(canStartNativeBackgroundTracking({ role: "driver", deliveryStatus: "assigned", trackingEligible: true })).toBe(false);
    expect(canStartNativeBackgroundTracking({ role: "driver", deliveryStatus: "in_transit", trackingEligible: false })).toBe(false);
  });

  it("uses a versioned consent policy", () => {
    expect(nativeTrackingConsentPolicyVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
