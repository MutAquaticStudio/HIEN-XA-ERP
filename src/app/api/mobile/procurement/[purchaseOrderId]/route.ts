import { NextResponse } from "next/server";
import { getMobilePurchaseOrderDetail, runMobileProcurementAction } from "@/server/mobile/mobile-procurement-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request, context: { params: Promise<{ purchaseOrderId: string }> }) {
  try {
    const { user } = await requireNativeMobileContext(request);
    const { purchaseOrderId } = await context.params;
    return NextResponse.json({ ok: true, ...(await getMobilePurchaseOrderDetail(user, purchaseOrderId)) });
  } catch (error) {
    return mobileError(error, "Không thể tải chi tiết phiếu mua trên điện thoại.");
  }
}

export async function POST(request: Request, context: { params: Promise<{ purchaseOrderId: string }> }) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    const { purchaseOrderId } = await context.params;
    return NextResponse.json({ ok: true, ...(await runMobileProcurementAction(user, actor, purchaseOrderId, await request.json())) });
  } catch (error) {
    return mobileError(error, "Không thể cập nhật phiếu mua ở trạng thái hiện tại.");
  }
}
