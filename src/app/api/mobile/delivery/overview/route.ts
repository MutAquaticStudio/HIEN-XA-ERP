import { NextResponse } from "next/server";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { getMobileDeliveryOverview } from "@/server/mobile/mobile-inventory-delivery-service";

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await getMobileDeliveryOverview(user)) });
  } catch (error) {
    return mobileError(error, "Không thể tải danh sách giao hàng.");
  }
}
