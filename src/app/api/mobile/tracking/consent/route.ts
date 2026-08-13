import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";
import { nativeTrackingConsentPolicyVersion } from "@/server/delivery-tracking/types";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

const idempotencyKey = z.string().trim().min(8).max(160).regex(/^[A-Za-z0-9_-]+$/);
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("grant"),
    deliveryJobId: z.string().trim().min(1).max(160),
    policyVersion: z.literal(nativeTrackingConsentPolicyVersion),
    acceptedAt: z.string().datetime().optional(),
    idempotencyKey
  }).strict(),
  z.object({
    action: z.literal("revoke"),
    consentId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    idempotencyKey
  }).strict()
]);

export async function POST(request: Request) {
  try {
    const { actor } = await requireNativeMobileContext(request);
    const input = schema.parse(await request.json());
    if (input.action === "grant") {
      return NextResponse.json({ ok: true, ...(await deliveryTrackingService.grantConsent(actor, input)) });
    }
    return NextResponse.json({ ok: true, ...(await deliveryTrackingService.revokeConsent(actor, input)) });
  } catch (error) {
    return mobileError(error, "Không thể cập nhật xác nhận GPS trên điện thoại.");
  }
}
