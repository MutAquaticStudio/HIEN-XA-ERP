import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { assertTrackingMutationOrigin } from "@/server/delivery-tracking/request-security";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), deliveryJobId: z.string().min(1) }),
  z.object({ action: z.literal("stop"), sessionId: z.string().uuid() })
]);

export async function GET(request: Request) {
  try {
    const { actor } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await deliveryTrackingService.getOverview(actor)) });
  } catch (error) {
    return mobileError(error, "Không thể tải thông tin theo dõi giao hàng.");
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await requireNativeMobileContext(request);
    assertTrackingMutationOrigin(request);
    const input = schema.parse(await request.json());
    if (input.action === "stop") {
      return NextResponse.json({ ok: true, session: await deliveryTrackingService.stop(actor, input.sessionId) });
    }
    const result = await deliveryTrackingService.start(actor, input.deliveryJobId);
    return NextResponse.json({ ok: true, session: result.session, created: result.created });
  } catch (error) {
    return mobileError(error, "Không thể cập nhật phiên theo dõi giao hàng.");
  }
}
