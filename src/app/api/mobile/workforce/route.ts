import { NextResponse } from "next/server";
import {
  getMobileWorkforceOverview,
  runMobileWorkforceAction
} from "@/server/mobile/mobile-finance-workforce-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await getMobileWorkforceOverview(user)) });
  } catch (error) {
    return mobileError(error, "Không thể tải nhân công trên điện thoại.");
  }
}

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await runMobileWorkforceAction(user, actor, await request.json())) });
  } catch (error) {
    return mobileError(error, "Không thể xử lý nghiệp vụ nhân công.");
  }
}
