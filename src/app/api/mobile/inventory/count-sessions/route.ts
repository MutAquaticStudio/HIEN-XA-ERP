import { NextResponse } from "next/server";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { getMobileInventoryCountSessions, runMobileInventoryCountSession, submitMobileInventoryCountLine } from "@/server/mobile/mobile-inventory-delivery-service";

export async function GET(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await getMobileInventoryCountSessions(user, actor)) });
  } catch (error) { return mobileError(error, "Không thể tải phiếu kiểm kê."); }
}

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    if (request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) return NextResponse.json({ ok: true, ...(await submitMobileInventoryCountLine(user, actor, await request.formData() as never)) });
    return NextResponse.json({ ok: true, ...(await runMobileInventoryCountSession(user, actor, await request.json())) });
  } catch (error) { return mobileError(error, "Không thể cập nhật phiếu kiểm kê."); }
}
