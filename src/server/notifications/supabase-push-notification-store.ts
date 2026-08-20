import { randomUUID } from "node:crypto";
import type { SafeIdentityUser } from "@/server/identity/types";
import { SupabaseRuntimeDocumentStore } from "@/server/infrastructure/supabase-runtime-document-store";
import type { RuntimeDocumentStore } from "@/server/infrastructure/runtime-document-store";
import type { PushDeliveryLog, PushNotificationEvent, PushSubscriptionInput, PushSubscriptionRecord } from "./types";
import { assertPushSubscriptionCapacity } from "./push-subscription-policy";

type PushNotificationData = {
  schemaVersion: 1;
  revision: number;
  subscriptions: PushSubscriptionRecord[];
  events: PushNotificationEvent[];
  deliveries: PushDeliveryLog[];
};

type DeliveryAttempt = {
  subscriptionId: string;
  channel: PushSubscriptionRecord["channel"];
  status: PushDeliveryLog["status"];
  detail?: string;
};

const namespace = "push_notifications";
const maximumEvents = 500;
const maximumDeliveries = 2_000;
const maximumWriteAttempts = 6;

export class SupabasePushNotificationStore {
  constructor(private readonly documents: RuntimeDocumentStore = new SupabaseRuntimeDocumentStore()) {}

  async getOwnSubscriptions(userId: string) {
    return (await this.getSnapshot()).subscriptions.filter((subscription) => subscription.userId === userId);
  }

  async upsertSubscription(user: SafeIdentityUser, input: PushSubscriptionInput) {
    return this.transaction((data) => {
      const now = new Date().toISOString();
      const existing = data.subscriptions.find((subscription) => subscription.userId === user.id && subscription.channel === input.channel && subscription.endpoint === input.endpoint);
      if (existing) {
        existing.role = user.role;
        existing.customerId = user.customerId;
        existing.supplierId = user.supplierId;
        existing.p256dh = input.p256dh;
        existing.auth = input.auth;
        existing.updatedAt = now;
        existing.lastSeenAt = now;
        return existing;
      }
      assertPushSubscriptionCapacity(data.subscriptions, user.id, input.channel);
      const record: PushSubscriptionRecord = {
        id: randomUUID(), userId: user.id, role: user.role, customerId: user.customerId, supplierId: user.supplierId,
        channel: input.channel, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth,
        createdAt: now, updatedAt: now, lastSeenAt: now
      };
      data.subscriptions.push(record);
      return record;
    });
  }

  async removeSubscription(userId: string, channel: PushSubscriptionRecord["channel"], endpoint: string) {
    return this.transaction((data) => {
      const before = data.subscriptions.length;
      data.subscriptions = data.subscriptions.filter((subscription) => !(subscription.userId === userId && subscription.channel === channel && subscription.endpoint === endpoint));
      return before !== data.subscriptions.length;
    });
  }

  async removeSubscriptionById(subscriptionId: string) {
    return this.transaction((data) => {
      const before = data.subscriptions.length;
      data.subscriptions = data.subscriptions.filter((subscription) => subscription.id !== subscriptionId);
      return before !== data.subscriptions.length;
    });
  }

  async ensureEvent(input: Omit<PushNotificationEvent, "id" | "status" | "attempts" | "deliveredSubscriptionIds" | "createdAt">) {
    return this.transaction((data) => {
      const existing = data.events.find((event) => event.eventKey === input.eventKey);
      if (existing) return existing;
      const event: PushNotificationEvent = {
        id: randomUUID(), eventKey: input.eventKey, audience: input.audience, payload: input.payload,
        status: "pending", attempts: 0, deliveredSubscriptionIds: [], createdAt: new Date().toISOString()
      };
      data.events.unshift(event);
      data.events = data.events.slice(0, maximumEvents);
      return event;
    });
  }

  async getDeliverableEvents() {
    return (await this.getSnapshot()).events.filter((event) => event.status === "pending" || event.status === "failed" && event.attempts < 3);
  }

  async getSubscriptions() {
    return (await this.getSnapshot()).subscriptions;
  }

  async recordAttempts(eventId: string, attempts: DeliveryAttempt[]) {
    return this.transaction((data) => {
      const event = data.events.find((candidate) => candidate.id === eventId);
      if (!event) return undefined;
      const attemptedAt = new Date().toISOString();
      const deliveredIds = attempts.filter((attempt) => attempt.status === "sent").map((attempt) => attempt.subscriptionId);
      event.deliveredSubscriptionIds = Array.from(new Set([...event.deliveredSubscriptionIds, ...deliveredIds]));
      event.attempts += 1;
      event.lastAttemptAt = attemptedAt;
      const failedAttempt = attempts.find((attempt) => attempt.status === "failed");
      event.lastError = failedAttempt?.detail;
      event.status = failedAttempt ? "failed" : event.deliveredSubscriptionIds.length > 0 ? "sent" : "skipped";
      data.deliveries.unshift(...attempts.map((attempt) => ({ id: randomUUID(), eventId, subscriptionId: attempt.subscriptionId, channel: attempt.channel, status: attempt.status, attemptedAt, detail: attempt.detail })));
      data.deliveries = data.deliveries.slice(0, maximumDeliveries);
      return event;
    });
  }

  private async getSnapshot(): Promise<PushNotificationData> {
    const document = await this.documents.read(namespace, emptyData());
    return { ...structuredClone(document.payload), revision: document.revision };
  }

  private async transaction<T>(mutator: (data: PushNotificationData) => T | Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < maximumWriteAttempts; attempt += 1) {
      const document = await this.documents.read(namespace, emptyData());
      const data = { ...structuredClone(document.payload), revision: document.revision };
      const result = await mutator(data);
      data.revision = document.revision + 1;
      const commit = await this.documents.compareAndSwap(namespace, document.revision, data);
      if (commit.committed) return structuredClone(result);
    }
    throw new Error("Không thể cập nhật thông báo vì dữ liệu vừa thay đổi. Vui lòng thử lại.");
  }
}

function emptyData(): PushNotificationData {
  return { schemaVersion: 1, revision: 0, subscriptions: [], events: [], deliveries: [] };
}
