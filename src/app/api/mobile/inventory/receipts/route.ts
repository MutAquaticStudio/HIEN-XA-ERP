import { NextResponse } from "next/server";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { runMobileGoodsReceiptAction, submitMobileGoodsReceipt } from "@/server/mobile/mobile-inventory-delivery-service";
import type { MobileRouteFormData } from "@/server/mobile/mobile-portal-service";

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    const contentType = request.headers.get("content-type") ?? "";
    const result = contentType.includes("multipart/form-data")
      ? await submitMobileGoodsReceipt(user, actor, await request.formData() as unknown as MobileRouteFormData)
      : await runMobileGoodsReceiptAction(user, actor, await request.json());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return mobileError(error, "Không thể xử lý phiếu nhập kho.");
  }
}
