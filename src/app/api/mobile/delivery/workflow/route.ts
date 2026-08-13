import { NextResponse } from "next/server";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { runMobileDeliveryWorkflow } from "@/server/mobile/mobile-inventory-delivery-service";

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await runMobileDeliveryWorkflow(user, actor, await request.json())) });
  } catch (error) {
    return mobileError(error, "Không thể cập nhật trạng thái chuyến giao.");
  }
}
