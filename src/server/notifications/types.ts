import type { UserRole } from "@/modules/operations/types";

export type PushChannel = "web" | "expo";

export type PushAudience = {
  userId?: string;
  customerId?: string;
  supplierId?: string;
  roles?: UserRole[];
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export type PushSubscriptionRecord = {
  id: string;
  userId: string;
  role: UserRole;
  customerId?: string;
  supplierId?: string;
  channel: PushChannel;
  endpoint: string;
  p256dh?: string;
  auth?: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
};

export type PushNotificationEvent = {
  id: string;
  eventKey: string;
  audience: PushAudience;
  payload: PushPayload;
  status: "pending" | "sent" | "failed" | "skipped";
  attempts: number;
  deliveredSubscriptionIds: string[];
  createdAt: string;
  lastAttemptAt?: string;
  lastError?: string;
};

export type PushDeliveryLog = {
  id: string;
  eventId: string;
  subscriptionId: string;
  channel: PushChannel;
  status: "sent" | "failed" | "skipped";
  attemptedAt: string;
  detail?: string;
};

export type PushSubscriptionInput = {
  channel: PushChannel;
  endpoint: string;
  p256dh?: string;
  auth?: string;
};
