import { PublicApiError } from "@/server/shared/public-api-error";
import type { PushChannel, PushSubscriptionRecord } from "./types";

export const maximumPushSubscriptionsPerUserAndChannel = 5;

const supportedWebPushHosts = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com"
]);

/**
 * A Web Push subscription is browser-provided input, but its endpoint becomes
 * a server-side outbound request later. Limit that request to the vendors our
 * supported browsers use instead of accepting arbitrary HTTPS destinations.
 */
export function isSupportedWebPushEndpoint(value: string) {
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:"
      && endpoint.username === ""
      && endpoint.password === ""
      && endpoint.port === ""
      && supportedWebPushHosts.has(endpoint.hostname.toLocaleLowerCase("en-US"));
  } catch {
    return false;
  }
}

export function assertPushSubscriptionCapacity(
  subscriptions: PushSubscriptionRecord[],
  userId: string,
  channel: PushChannel
) {
  const count = subscriptions.filter((subscription) => subscription.userId === userId && subscription.channel === channel).length;
  if (count >= maximumPushSubscriptionsPerUserAndChannel) {
    const channelLabel = channel === "web" ? "web" : "ứng dụng";
    throw new PublicApiError(400, `Mỗi tài khoản chỉ được đăng ký tối đa ${maximumPushSubscriptionsPerUserAndChannel} thiết bị ${channelLabel}.`);
  }
}
