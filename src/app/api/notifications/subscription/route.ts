import { NextResponse } from "next/server";
import { z } from "zod";
import { mobileError, requireMobileContext } from "@/server/mobile/mobile-api";
import { notificationService } from "@/server/notifications/runtime";
import { isSupportedWebPushEndpoint } from "@/server/notifications/push-subscription-policy";
import { assertWebMutationOrigin } from "@/server/shared/web-mutation-origin";

const webSubscriptionSchema = z.object({
  channel: z.literal("web"),
  endpoint: z.string().url().max(2048).refine(isSupportedWebPushEndpoint, "Web Push endpoint không thuộc nhà cung cấp được hỗ trợ."),
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256)
  })
});

const expoSubscriptionSchema = z.object({
  channel: z.literal("expo"),
  endpoint: z.string().regex(/^(Expo|Exponent)PushToken\[[^\]]+\]$/, "Expo Push Token không hợp lệ.")
});

const unsubscribeSchema = z.object({
  channel: z.enum(["web", "expo"]),
  endpoint: z.string().min(8).max(2048)
});

export async function GET(request: Request) {
  try {
    const { user } = await requireMobileContext(request);
    return NextResponse.json({ ok: true, ...(await notificationService.getSubscriptionStatus(user)) });
  } catch (error) {
    return mobileError(error, "Không thể tải trạng thái thông báo.");
  }
}

export async function POST(request: Request) {
  try {
    assertWebMutationOrigin(request, "Yêu cầu đăng ký thông báo không hợp lệ.");
    const { user } = await requireMobileContext(request);
    const input = z.discriminatedUnion("channel", [webSubscriptionSchema, expoSubscriptionSchema]).parse(await request.json());
    const subscription = await notificationService.subscribe(user, input.channel === "web"
      ? { channel: "web", endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth }
      : { channel: "expo", endpoint: input.endpoint });
    return NextResponse.json({ ok: true, subscription: { id: subscription.id, channel: subscription.channel } });
  } catch (error) {
    return mobileError(error, "Không thể cập nhật đăng ký thông báo.");
  }
}

export async function DELETE(request: Request) {
  try {
    assertWebMutationOrigin(request, "Yêu cầu đăng ký thông báo không hợp lệ.");
    const { user } = await requireMobileContext(request);
    const input = unsubscribeSchema.parse(await request.json());
    const removed = await notificationService.unsubscribe(user, input);
    return NextResponse.json({ ok: true, removed });
  } catch (error) {
    return mobileError(error, "Không thể cập nhật đăng ký thông báo.");
  }
}
