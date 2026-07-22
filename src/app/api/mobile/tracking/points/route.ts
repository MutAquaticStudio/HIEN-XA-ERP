import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";
import { mobileError, requireMobileContext } from "@/server/mobile/mobile-api";

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
    const { actor } = await requireMobileContext(request);
    const input = schema.parse(await request.json());
    return NextResponse.json({ ok: true, session: await deliveryTrackingService.recordPoint(actor, input) });
  } catch (error) {
    return mobileError(error, "Khong the gui vi tri giao hang.");
  }
}
