import { NextResponse } from "next/server";
import { getMobileSalesOrderDetail, runMobileSalesAction } from "@/server/mobile/mobile-sales-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request, context: { params: Promise<{ salesOrderId: string }> }) {
  try {
    const { user } = await requireNativeMobileContext(request);
    const { salesOrderId } = await context.params;
    return NextResponse.json({ ok: true, ...(await getMobileSalesOrderDetail(user, salesOrderId)) });
  } catch (error) {
    return mobileError(error, "Không thể tải chi tiết đơn bán trên điện thoại.");
  }
}

export async function POST(request: Request, context: { params: Promise<{ salesOrderId: string }> }) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    const { salesOrderId } = await context.params;
    return NextResponse.json({ ok: true, ...(await runMobileSalesAction(user, actor, salesOrderId, await request.json())) });
  } catch (error) {
    return mobileError(error, "Không thể cập nhật đơn bán ở trạng thái hiện tại.");
  }
}
