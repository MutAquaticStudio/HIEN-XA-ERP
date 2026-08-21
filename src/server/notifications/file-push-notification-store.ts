import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  PushDeliveryLog,
  PushNotificationEvent,
  PushSubscriptionInput,
  PushSubscriptionRecord
} from "./types";
import type { SafeIdentityUser } from "@/server/identity/types";
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

const maximumEvents = 500;
const maximumDeliveries = 2000;

export class FilePushNotificationStore {
  private queue = Promise.resolve();
  private readonly filePath: string;

  constructor(filePath = process.env.VLXD_PUSH_DATA_FILE) {
    this.filePath = filePath?.trim() || join(process.cwd(), ".data", "push-notifications.json");
  }

  async getOwnSubscriptions(userId: string) {
    const data = await this.getSnapshot();
    return data.subscriptions.filter((subscription) => subscription.userId === userId);
  }

  async upsertSubscription(user: SafeIdentityUser, input: PushSubscriptionInput) {
    return this.transaction((data) => {
      const now = new Date().toISOString();
      const existing = data.subscriptions.find((subscription) =>
        subscription.userId === user.id
        && subscription.channel === input.channel
        && subscription.endpoint === input.endpoint
      );
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
        id: randomUUID(),
        userId: user.id,
        role: user.role,
        customerId: user.customerId,
        supplierId: user.supplierId,
        channel: input.channel,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now
      };
      data.subscriptions.push(record);
      return record;
    });
  }

  async removeSubscription(userId: string, channel: PushSubscriptionRecord["channel"], endpoint: string) {
    return this.transaction((data) => {
      const before = data.subscriptions.length;
      data.subscriptions = data.subscriptions.filter((subscription) => !(
        subscription.userId === userId
        && subscription.channel === channel
        && subscription.endpoint === endpoint
      ));
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
        id: randomUUID(),
        eventKey: input.eventKey,
        audience: input.audience,
        payload: input.payload,
        status: "pending",
        attempts: 0,
        deliveredSubscriptionIds: [],
        createdAt: new Date().toISOString()
      };
      data.events.unshift(event);
      data.events = data.events.slice(0, maximumEvents);
      return event;
    });
  }

  async getDeliverableEvents() {
    const data = await this.getSnapshot();
    return data.events.filter((event) =>
      event.status === "pending" || (event.status === "failed" && event.attempts < 3)
    );
  }

  async getSubscriptions() {
    return (await this.getSnapshot()).subscriptions;
  }

  async recordAttempts(eventId: string, attempts: DeliveryAttempt[]) {
    return this.transaction((data) => {
      const event = data.events.find((candidate) => candidate.id === eventId);
      if (!event) return undefined;
      const attemptedAt = new Date().toISOString();
      const deliveredIds = attempts
        .filter((attempt) => attempt.status === "sent")
        .map((attempt) => attempt.subscriptionId);
      event.deliveredSubscriptionIds = Array.from(new Set([...event.deliveredSubscriptionIds, ...deliveredIds]));
      event.attempts += 1;
      event.lastAttemptAt = attemptedAt;
      const failedAttempt = attempts.find((attempt) => attempt.status === "failed");
      event.lastError = failedAttempt?.detail;
      event.status = failedAttempt
        ? "failed"
        : event.deliveredSubscriptionIds.length > 0
          ? "sent"
          : "skipped";
      data.deliveries.unshift(...attempts.map((attempt) => ({
        id: randomUUID(),
        eventId,
        subscriptionId: attempt.subscriptionId,
        channel: attempt.channel,
        status: attempt.status,
        attemptedAt,
        detail: attempt.detail
      })));
      data.deliveries = data.deliveries.slice(0, maximumDeliveries);
      return event;
    });
  }

  private async getSnapshot(): Promise<PushNotificationData> {
    await this.queue;
    return structuredClone(await this.readData());
  }

  private async transaction<T>(mutator: (data: PushNotificationData) => T | Promise<T>) {
    const task = this.queue.then(async () => {
      const data = await this.readData();
      const result = await mutator(data);
      data.revision += 1;
      await this.writeData(data);
      return structuredClone(result);
    });
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  private async readData(): Promise<PushNotificationData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PushNotificationData>;
      if (parsed.schemaVersion !== 1) return createEmptyData();
      return {
        schemaVersion: 1,
        revision: typeof parsed.revision === "number" && Number.isInteger(parsed.revision) ? parsed.revision : 0,
        subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
        events: Array.isArray(parsed.events) ? parsed.events : [],
        deliveries: Array.isArray(parsed.deliveries) ? parsed.deliveries : []
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return createEmptyData();
      throw error;
    }
  }

  private async writeData(data: PushNotificationData) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

function createEmptyData(): PushNotificationData {
  return { schemaVersion: 1, revision: 0, subscriptions: [], events: [], deliveries: [] };
}
