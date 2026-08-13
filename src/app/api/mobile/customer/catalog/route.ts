import { NextResponse } from "next/server";
import { getMobileCustomerCatalog } from "@/server/mobile/mobile-portal-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, catalog: await getMobileCustomerCatalog(user) });
  } catch (error) {
    return mobileError(error, "Không thể tải giá bán hiện hành.");
  }
}
