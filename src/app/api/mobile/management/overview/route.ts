import { NextResponse } from "next/server";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { getMobileManagementOverview } from "@/server/mobile/mobile-management-service";

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await getMobileManagementOverview(user)) });
  } catch (error) {
    return mobileError(error, "Không thể tải bảng điều hành trên điện thoại.");
  }
}
