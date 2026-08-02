import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";
import { requireMobileContext, mobileError } from "@/server/mobile/mobile-api";
import { assertTrackingMutationOrigin } from "@/server/delivery-tracking/request-security";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), deliveryJobId: z.string().uuid() }),
  z.object({ action: z.literal("stop"), sessionId: z.string().uuid() })
]);

export async function GET(request: Request) {
  try {
    const { actor } = await requireMobileContext(request);
    return NextResponse.json({ ok: true, ...(await deliveryTrackingService.getOverview(actor)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return mobileError(error, "Không thể tải theo dõi giao hàng trên web.");
  }
}

export async function POST(request: Request) {
  try {
    assertTrackingMutationOrigin(request);
    const { actor } = await requireMobileContext(request);
    const input = schema.parse(await request.json());
    if (input.action === "stop") return NextResponse.json({ ok: true, session: await deliveryTrackingService.stop(actor, input.sessionId) });
    return NextResponse.json({ ok: true, ...(await deliveryTrackingService.start(actor, input.deliveryJobId)) });
  } catch (error) {
    return mobileError(error, "Không thể cập nhật theo dõi giao hàng trên web.");
  }
}
