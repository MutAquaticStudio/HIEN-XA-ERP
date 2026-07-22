import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";
import { mobileError, requireMobileContext } from "@/server/mobile/mobile-api";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), deliveryJobId: z.string().min(1) }),
  z.object({ action: z.literal("stop"), sessionId: z.string().uuid() })
]);

export async function GET(request: Request) {
  try {
    const { actor } = await requireMobileContext(request);
    return NextResponse.json({ ok: true, ...(await deliveryTrackingService.getOverview(actor)) });
  } catch (error) {
    return mobileError(error, "Khong the tai thong tin theo doi giao hang.");
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await requireMobileContext(request);
    const input = schema.parse(await request.json());
    if (input.action === "stop") {
      return NextResponse.json({ ok: true, session: await deliveryTrackingService.stop(actor, input.sessionId) });
    }
    const result = await deliveryTrackingService.start(actor, input.deliveryJobId);
    const publicUrl = result.publicToken
      ? new URL(`/track/${result.publicToken}`, request.url).toString()
      : undefined;
    return NextResponse.json({ ok: true, session: result.session, publicUrl });
  } catch (error) {
    return mobileError(error, "Khong the cap nhat phien theo doi giao hang.");
  }
}
