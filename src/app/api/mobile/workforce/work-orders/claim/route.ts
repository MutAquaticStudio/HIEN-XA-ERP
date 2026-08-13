import { NextResponse } from "next/server";
import { claimMobileWorkOrder } from "@/server/mobile/mobile-portal-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await claimMobileWorkOrder(user, actor, await request.json())) });
  } catch (error) {
    return mobileError(error, "Không thể nhận công việc.");
  }
}
