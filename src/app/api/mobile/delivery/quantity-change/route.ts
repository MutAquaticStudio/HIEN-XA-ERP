import { NextResponse } from "next/server";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { runMobileDeliveryQuantityChange, runMobileDeliveryQuantityChangeApproval } from "@/server/mobile/mobile-inventory-delivery-service";

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    const payload = await request.json() as { action?: string };
    const result = payload.action === "approve" || payload.action === "reject"
      ? await runMobileDeliveryQuantityChangeApproval(user, actor, payload)
      : await runMobileDeliveryQuantityChange(user, actor, payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return mobileError(error, "Không thể xử lý báo chênh lệch giao hàng.");
  }
}
