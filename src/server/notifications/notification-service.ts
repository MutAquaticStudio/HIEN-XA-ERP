import { randomUUID } from "node:crypto";
import * as webPush from "web-push";
import type { DomainCommandName, OperationsState } from "@/modules/operations/types";
import { identityService } from "@/server/identity/runtime";
import type { SafeIdentityUser } from "@/server/identity/types";
import { FilePushNotificationStore } from "./file-push-notification-store";
import { SupabasePushNotificationStore } from "./supabase-push-notification-store";
import { hasSupabaseServerConfig } from "@/server/infrastructure/supabase-server-client";
import { CloudflareRuntimeDocumentStore } from "@/server/infrastructure/cloudflare-runtime-document-store";
import { hasCloudflareRuntimeConfig } from "@/server/infrastructure/cloudflare-bindings";
import { PublicApiError } from "@/server/shared/public-api-error";
import { mapWithConcurrency } from "./bounded-concurrency";
import { isSupportedWebPushEndpoint } from "./push-subscription-policy";
import type { PushAudience, PushNotificationEvent, PushPayload, PushSubscriptionInput, PushSubscriptionRecord } from "./types";

const maximumConcurrentPushDeliveries = 5;

const store = hasCloudflareRuntimeConfig()
  ? new SupabasePushNotificationStore(new CloudflareRuntimeDocumentStore())
  : hasSupabaseServerConfig()
    ? new SupabasePushNotificationStore()
    : new FilePushNotificationStore();

export class NotificationService {
  getWebPushPublicKey() {
    return process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || undefined;
  }

  async getSubscriptionStatus(user: SafeIdentityUser) {
    const subscriptions = await store.getOwnSubscriptions(user.id);
    return {
      webPushConfigured: Boolean(this.getWebPushPublicKey()),
      subscribed: subscriptions.length > 0,
      channels: Array.from(new Set(subscriptions.map((subscription) => subscription.channel)))
    };
  }

  async subscribe(user: SafeIdentityUser, input: PushSubscriptionInput) {
    if (input.channel === "web" && !isSupportedWebPushEndpoint(input.endpoint)) {
      throw new PublicApiError(400, "Web Push endpoint không thuộc nhà cung cấp được hỗ trợ.");
    }
    return store.upsertSubscription(user, input);
  }

  async unsubscribe(user: SafeIdentityUser, input: Pick<PushSubscriptionInput, "channel" | "endpoint">) {
    return store.removeSubscription(user.id, input.channel, input.endpoint);
  }

  async sendTest(user: SafeIdentityUser) {
    await store.ensureEvent({
      eventKey: `push-test:${user.id}:${randomUUID()}`,
      audience: { userId: user.id },
      payload: {
        title: "Thông báo đã sẵn sàng",
        body: "Thiết bị này sẽ nhận cập nhật công việc và giao hàng khi có thay đổi.",
        url: user.role === "customer" ? "/khach-hang" : "/",
        tag: "push-test"
      }
    });
    await this.flushPending();
  }

  async publishOperation(input: {
    operation: DomainCommandName;
    targetId?: string;
    idempotencyKey: string;
    state: OperationsState;
  }) {
    const plan = planOperationNotification(input.operation, input.state, input.targetId);
    if (!plan) return;
    await store.ensureEvent({
      eventKey: `operation:${input.idempotencyKey}`,
      audience: plan.audience,
      payload: plan.payload
    });
    await this.flushPending();
  }

  async publishPartnerMessage(input: {
    partyType: "customer" | "supplier";
    partyId: string;
    senderRole: SafeIdentityUser["role"];
    idempotencyKey: string;
  }) {
    const audience: PushAudience = input.partyType === "customer"
      ? input.senderRole === "customer" ? { roles: ["owner", "administrator", "sales"] } : { customerId: input.partyId }
      : input.senderRole === "supplier" ? { roles: ["owner", "administrator", "warehouse", "dispatcher"] } : { supplierId: input.partyId };
    const senderLabel = input.senderRole === "customer" || input.senderRole === "supplier" ? "đối tác" : "cửa hàng";
    await store.ensureEvent({
      eventKey: `message:${input.idempotencyKey}`,
      audience,
      payload: {
        title: "Có tin nhắn mới",
        body: `Bạn có tin nhắn mới từ ${senderLabel}.`,
        url: input.senderRole === "customer" || input.senderRole === "supplier" ? "/trao-doi" : input.partyType === "customer" ? "/khach-hang" : "/nha-cung-cap",
        tag: `partner-message-${input.partyType}`
      }
    });
    await this.flushPending();
  }

  private async flushPending() {
    try {
      const events = await store.getDeliverableEvents();
      for (const event of events) {
        await this.deliverEvent(event);
      }
    } catch {
      // Push delivery must never fail a financial or operational command.
    }
  }

  private async deliverEvent(event: PushNotificationEvent) {
    const subscriptions = await store.getSubscriptions();
    const candidates = subscriptions.filter((subscription) =>
      matchesAudience(subscription, event.audience)
      && !event.deliveredSubscriptionIds.includes(subscription.id)
    );
    const activeSubscriptions = (await mapWithConcurrency(candidates, maximumConcurrentPushDeliveries, async (subscription) => {
      const user = await identityService.getUserById(subscription.userId);
      if (!user || user.status !== "active" || user.role !== subscription.role || user.customerId !== subscription.customerId || user.supplierId !== subscription.supplierId) {
        return undefined;
      }
      return subscription;
    })).filter((subscription): subscription is PushSubscriptionRecord => Boolean(subscription));

    if (activeSubscriptions.length === 0) {
      await store.recordAttempts(event.id, [{
        subscriptionId: "no-active-recipient",
        channel: "web",
        status: "skipped",
        detail: "Không có thiết bị đang hoạt động phù hợp với người nhận."
      }]);
      return;
    }

    const attempts = await mapWithConcurrency(activeSubscriptions, maximumConcurrentPushDeliveries, async (subscription) => {
      try {
        await sendPush(subscription, event.payload);
        return { subscriptionId: subscription.id, channel: subscription.channel, status: "sent" as const };
      } catch (error) {
        const detail = toSafeErrorDetail(error);
        if (isExpiredSubscriptionError(error)) {
          await store.removeSubscriptionById(subscription.id);
        }
        return { subscriptionId: subscription.id, channel: subscription.channel, status: "failed" as const, detail };
      }
    });
    await store.recordAttempts(event.id, attempts);
  }
}

function planOperationNotification(operation: DomainCommandName, state: OperationsState, targetId?: string) {
  const delivery = targetId ? state.deliveryJobs.find((job) => job.id === targetId) : undefined;
  const customerId = delivery
    ? state.salesOrders.find((order) => order.id === delivery.salesOrderId)?.customerId
    : undefined;

  switch (operation) {
    case "createCustomerPortalSalesOrder":
      return toPlan({ roles: ["owner", "administrator", "sales"] }, "Có đơn đặt hàng mới", "Khách vừa gửi đơn đặt hàng, cần kiểm tra giá và lịch giao.", "/", "customer-order-review");
    case "submitCustomerPaymentProof":
      return toPlan({ roles: ["owner", "administrator", "accountant"] }, "Có minh chứng chuyển khoản", "Khách vừa gửi minh chứng thanh toán để kế toán đối soát.", "/cash/customer-payment-proofs", "customer-payment-proof");    case "submitSupplierPurchaseOrderResponse":
    case "submitSupplierDeliveryNotice":
      return toPlan({ roles: ["owner", "administrator", "warehouse", "dispatcher"] }, "Nhà cung cấp vừa cập nhật", "Có phản hồi hoặc báo giao mới từ nhà cung cấp, cần kiểm tra trước khi ghi nhận.", "/", "supplier-update");
    case "claimOpenSalesWorkOrder":
      return toPlan({ roles: ["owner", "administrator", "supervisor"] }, "Công việc đã có người nhận", "Một công việc hiện trường vừa được thợ nhận xử lý.", "/", "work-claimed");
    case "submitDeliveryCompletion":
      return toPlan({ roles: ["owner", "administrator", "dispatcher"] }, "Chờ duyệt giao hàng", "Tài xế đã gửi xác nhận hoàn tất giao hàng để cửa hàng kiểm tra.", "/", "delivery-review");
    case "approveDeliveryCompletion":
    case "completeDelivery":
      return customerId
        ? toPlan({ customerId }, "Đơn hàng đã giao", "Cửa hàng đã cập nhật đơn hàng của bạn là giao thành công.", "/khach-hang", "delivery-complete")
        : undefined;
    case "dispatchDelivery":
      return customerId
        ? toPlan({ customerId }, "Đơn hàng đang được giao", "Đơn hàng của bạn đang trên đường giao đến.", "/khach-hang", "delivery-dispatched")
        : undefined;
    case "failDelivery":
      return customerId
        ? toPlan({ customerId }, "Cập nhật giao hàng", "Cửa hàng cần sắp xếp lại việc giao hàng. Vui lòng chờ liên hệ.", "/khach-hang", "delivery-follow-up")
        : undefined;
    case "confirmCustomerPayment": {
      const payment = targetId ? state.customerPayments.find((item) => item.id === targetId) : undefined;
      return payment
        ? toPlan({ customerId: payment.customerId }, "Đã ghi nhận thanh toán", "Cửa hàng đã ghi nhận khoản thanh toán của bạn.", "/khach-hang", "customer-payment")
        : undefined;
    }
    case "confirmSalesOrder": {
      const order = targetId ? state.salesOrders.find((item) => item.id === targetId) : undefined;
      return order ? toPlan({ customerId: order.customerId }, "Đơn hàng đã được xác nhận", "Cửa hàng đã xác nhận đơn hàng của bạn. Vui lòng xem phương thức thanh toán hoặc lịch giao.", "/khach-hang", "sales-order-confirmed") : undefined;
    }
    case "confirmPurchaseOrder": {
      const order = targetId ? state.purchaseOrders.find((item) => item.id === targetId) : undefined;
      return order ? toPlan({ supplierId: order.supplierId }, "Có phiếu mua cần phản hồi", "Cửa hàng đã gửi phiếu mua hàng. Vui lòng xác nhận khả năng cung ứng và ngày giao.", "/nha-cung-cap", "supplier-purchase-order") : undefined;
    }
    default:
      return undefined;
  }
}

function toPlan(audience: PushAudience, title: string, body: string, url: string, tag: string) {
  return { audience, payload: { title, body, url, tag } satisfies PushPayload };
}

function matchesAudience(subscription: PushSubscriptionRecord, audience: PushAudience) {
  if (audience.userId) return subscription.userId === audience.userId;
  if (audience.customerId) return subscription.customerId === audience.customerId;
  if (audience.supplierId) return subscription.supplierId === audience.supplierId;
  return Boolean(audience.roles?.includes(subscription.role));
}

async function sendPush(subscription: PushSubscriptionRecord, payload: PushPayload) {
  if (subscription.channel === "expo") {
    return sendExpoPush(subscription, payload);
  }
  return sendWebPush(subscription, payload);
}

async function sendWebPush(subscription: PushSubscriptionRecord, payload: PushPayload) {
  if (!isSupportedWebPushEndpoint(subscription.endpoint)) {
    throw new Error("WEB_PUSH_ENDPOINT_NOT_SUPPORTED");
  }
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject || !subscription.p256dh || !subscription.auth) {
    throw new Error("WEB_PUSH_NOT_CONFIGURED");
  }
  webPush.setVapidDetails(subject, publicKey, privateKey);
  await webPush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
  }, JSON.stringify(payload), { TTL: 60 * 60 });
}

async function sendExpoPush(subscription: PushSubscriptionRecord, payload: PushPayload) {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      to: subscription.endpoint,
      title: payload.title,
      body: payload.body,
      data: { url: payload.url },
      sound: "default",
      priority: "high",
      channelId: "operations"
    })
  });
  const result = await response.json().catch(() => undefined) as { data?: Array<{ status?: string; message?: string }> } | undefined;
  if (!response.ok || result?.data?.[0]?.status === "error") {
    throw new Error(result?.data?.[0]?.message || `EXPO_PUSH_${response.status}`);
  }
}

function isExpiredSubscriptionError(error: unknown) {
  const statusCode = typeof error === "object" && error && "statusCode" in error
    ? Number((error as { statusCode?: number }).statusCode)
    : undefined;
  return statusCode === 404 || statusCode === 410 || error instanceof Error && /DeviceNotRegistered/i.test(error.message);
}

function toSafeErrorDetail(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN_PUSH_ERROR";
  return message.slice(0, 180);
}
