import { NextResponse } from "next/server";
import { z } from "zod";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { notificationService } from "@/server/notifications/runtime";

const subscriptionSchema = z.object({
  channel: z.literal("expo"),
  endpoint: z.string().regex(/^(Expo|Exponent)PushToken\[[^\]]+\]$/, "Expo Push Token không hợp lệ.")
});

export async function POST(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    const input = subscriptionSchema.parse(await request.json());
    const subscription = await notificationService.subscribe(user, input);
    return NextResponse.json({ ok: true, subscription: { id: subscription.id, channel: "expo" } });
  } catch (error) {
    return mobileError(error, "Không thể bật thông báo trên thiết bị này.");
  }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    const input = subscriptionSchema.parse(await request.json());
    const removed = await notificationService.unsubscribe(user, input);
    return NextResponse.json({ ok: true, removed });
  } catch (error) {
    return mobileError(error, "Không thể tắt thông báo trên thiết bị này.");
  }
}
