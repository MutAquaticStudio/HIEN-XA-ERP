import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";
import { requireMobileContext, mobileError } from "@/server/mobile/mobile-api";
import { assertTrackingMutationOrigin } from "@/server/delivery-tracking/request-security";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), sessionId: z.string().uuid() }),
  z.object({ action: z.literal("revoke"), sessionId: z.string().uuid() })
]);

export async function POST(request: Request) {
  try {
    assertTrackingMutationOrigin(request);
    const { actor } = await requireMobileContext(request);
    const input = schema.parse(await request.json());
    if (input.action === "revoke") return NextResponse.json({ ok: true, session: await deliveryTrackingService.revokePublicShare(actor, input.sessionId) });
    const result = await deliveryTrackingService.createPublicShare(actor, input.sessionId);
    return NextResponse.json({ ok: true, session: result.session, publicUrl: new URL(`/track/${result.publicToken}`, request.url).toString() });
  } catch (error) {
    return mobileError(error, "Không thể quản lý liên kết theo dõi khách hàng.");
  }
}
