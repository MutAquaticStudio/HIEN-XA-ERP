export const nativeTrackingConsentPolicyVersion = "2026-07-29";

export function canStartNativeBackgroundTracking(input: {
  role: string | undefined;
  deliveryStatus: string;
  trackingEligible: boolean;
}) {
  return input.role === "driver" && input.deliveryStatus === "in_transit" && input.trackingEligible;
}
