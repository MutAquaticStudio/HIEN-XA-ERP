import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";
import { requireMobileContext, mobileError } from "@/server/mobile/mobile-api";
import { assertTrackingMutationOrigin } from "@/server/delivery-tracking/request-security";

const schema = z.object({
  sessionId: z.string().uuid(),
  clientPointId: z.string().regex(/^[A-Za-z0-9_-]{8,160}$/),
  recordedAt: z.string().datetime(),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  accuracyMeters: z.number().finite().optional(),
  headingDegrees: z.number().finite().optional(),
  speedMetersPerSecond: z.number().finite().optional()
});

export async function POST(request: Request) {
  try {
    assertTrackingMutationOrigin(request);
    const { actor } = await requireMobileContext(request);
    return NextResponse.json({ ok: true, session: await deliveryTrackingService.recordPoint(actor, schema.parse(await request.json())) });
  } catch (error) {
    return mobileError(error, "Không thể gửi vị trí giao hàng trên web.");
  }
}
