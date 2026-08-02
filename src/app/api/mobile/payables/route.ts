import { NextResponse } from "next/server";
import {
  getMobilePayablesOverview,
  runMobilePayablesAction
} from "@/server/mobile/mobile-finance-workforce-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await getMobilePayablesOverview(user)) });
  } catch (error) {
    return mobileError(error, "Không thể tải công nợ nhà cung cấp trên điện thoại.");
  }
}

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await runMobilePayablesAction(user, actor, await request.json())) });
  } catch (error) {
    return mobileError(error, "Không thể xử lý công nợ nhà cung cấp.");
  }
}
