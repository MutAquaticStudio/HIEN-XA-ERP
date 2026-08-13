import { NextResponse } from "next/server";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { runMobileDeliveryCompletionApproval } from "@/server/mobile/mobile-inventory-delivery-service";

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await runMobileDeliveryCompletionApproval(user, actor, await request.json())) });
  } catch (error) {
    return mobileError(error, "Không thể duyệt xác nhận giao hàng.");
  }
}
