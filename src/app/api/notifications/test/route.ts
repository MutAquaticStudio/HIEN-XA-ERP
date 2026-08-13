import { NextResponse } from "next/server";
import { requireMobileContext } from "@/server/mobile/mobile-api";
import { notificationService } from "@/server/notifications/runtime";

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== new URL(request.url).host) {
      throw new Error("Yêu cầu gửi thử thông báo không hợp lệ.");
    }
    const { user } = await requireMobileContext(request);
    await notificationService.sendTest(user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể gửi thông báo thử.";
    return NextResponse.json({ ok: false, error: message }, { status: /phiên|xác thực|bearer/i.test(message) ? 401 : 400 });
  }
}
