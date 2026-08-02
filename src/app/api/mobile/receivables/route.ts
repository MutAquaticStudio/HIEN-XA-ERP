import { NextResponse } from "next/server";
import {
  getMobileReceivablesOverview,
  runMobileReceivablesAction
} from "@/server/mobile/mobile-finance-workforce-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await getMobileReceivablesOverview(user)) });
  } catch (error) {
    return mobileError(error, "Không thể tải công nợ khách hàng trên điện thoại.");
  }
}

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await runMobileReceivablesAction(user, actor, await request.json())) });
  } catch (error) {
    return mobileError(error, "Không thể xử lý công nợ khách hàng.");
  }
}
