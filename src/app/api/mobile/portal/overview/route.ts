import { NextResponse } from "next/server";
import { getMobilePortalOverview } from "@/server/mobile/mobile-portal-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await getMobilePortalOverview(user)) });
  } catch (error) {
    return mobileError(error, "Không thể tải dữ liệu nghiệp vụ trên ứng dụng.");
  }
}
