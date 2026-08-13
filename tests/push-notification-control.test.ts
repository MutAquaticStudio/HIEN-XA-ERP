import { describe, expect, it } from "vitest";
import { canTogglePushSubscription } from "../src/components/push-notification-control";

describe("canTogglePushSubscription", () => {
  it("allows an existing browser subscription to be turned off without a VAPID key", () => {
    expect(canTogglePushSubscription({
      configured: false,
      registrationReady: true,
      subscribed: true,
      pending: false
    })).toBe(true);
  });

  it("requires a ready service worker before changing notification state", () => {
    expect(canTogglePushSubscription({
      configured: true,
      registrationReady: false,
      subscribed: true,
      pending: false
    })).toBe(false);
  });

  it("prevents a second action while the current request is pending", () => {
    expect(canTogglePushSubscription({
      configured: true,
      registrationReady: true,
      subscribed: false,
      pending: true
    })).toBe(false);
  });
});
