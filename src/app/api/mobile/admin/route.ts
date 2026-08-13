import { NextResponse } from "next/server";
import { getMobileAdminOverview, runMobileAdminAction } from "@/server/mobile/mobile-admin-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request) {
  try { const { user } = await requireNativeMobileContext(request); return NextResponse.json({ ok: true, ...(await getMobileAdminOverview(user)) }); }
  catch (error) { return mobileError(error, "Không thể tải quản trị người dùng trên điện thoại."); }
}

export async function POST(request: Request) {
  try { const { user } = await requireNativeMobileContext(request); return NextResponse.json({ ok: true, ...(await runMobileAdminAction(user, await request.json())) }); }
  catch (error) { return mobileError(error, "Không thể cập nhật tài khoản trên điện thoại."); }
}
