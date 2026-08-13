import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { assertTrackingMutationOrigin } from "@/server/delivery-tracking/request-security";

const schema = z.object({
  sessionId: z.string().uuid(),
  clientPointId: z.string().min(8).max(160),
  recordedAt: z.string().datetime(),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  accuracyMeters: z.number().finite().optional(),
  headingDegrees: z.number().finite().optional(),
  speedMetersPerSecond: z.number().finite().optional()
});

export async function POST(request: Request) {
  try {
    const { actor } = await requireNativeMobileContext(request);
    assertTrackingMutationOrigin(request);
    const input = schema.parse(await request.json());
    return NextResponse.json({ ok: true, session: await deliveryTrackingService.recordPoint(actor, input) });
  } catch (error) {
    return mobileError(error, "Không thể gửi vị trí giao hàng.");
  }
}
