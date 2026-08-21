import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../src/server/notifications/bounded-concurrency";
import { isSupportedWebPushEndpoint } from "../src/server/notifications/push-subscription-policy";

describe("notification security controls", () => {
  it("allows only configured Web Push vendor origins", () => {
    expect(isSupportedWebPushEndpoint("https://fcm.googleapis.com/fcm/send/device")).toBe(true);
    expect(isSupportedWebPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/device")).toBe(true);
    expect(isSupportedWebPushEndpoint("https://web.push.apple.com/QF0000/device")).toBe(true);
    expect(isSupportedWebPushEndpoint("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSupportedWebPushEndpoint("https://fcm.googleapis.com:8443/fcm/send/device")).toBe(false);
  });

  it("never runs more deliveries than the configured concurrency limit", async () => {
    let active = 0;
    let maximumActive = 0;
    const output = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 2;
    });

    expect(output).toEqual([2, 4, 6, 8, 10]);
    expect(maximumActive).toBe(2);
  });
});
