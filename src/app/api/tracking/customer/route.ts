import { NextResponse } from "next/server";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";
import { requireMobileContext, mobileError } from "@/server/mobile/mobile-api";

export async function GET(request: Request) {
  try {
    const { actor } = await requireMobileContext(request);
    return NextResponse.json({ ok: true, ...(await deliveryTrackingService.getCustomerOverview(actor)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return mobileError(error, "Không thể tải hành trình giao hàng của bạn.");
  }
}
