import { NextResponse } from "next/server";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { getMobileInventoryOverview } from "@/server/mobile/mobile-inventory-delivery-service";

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await getMobileInventoryOverview(user)) });
  } catch (error) {
    return mobileError(error, "Không thể tải dữ liệu kho.");
  }
}
