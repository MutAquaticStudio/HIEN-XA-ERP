import { NextResponse } from "next/server";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const tracking = await deliveryTrackingService.getPublicTracking(token);
  if (!tracking) {
    return NextResponse.json({ ok: false, error: "Liên kết theo dõi không hợp lệ hoặc đã hết hạn." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...tracking }, {
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" }
  });
}
