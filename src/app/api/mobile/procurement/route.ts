import { NextResponse } from "next/server";
import { createMobilePurchaseDraft, getMobileProcurementOverview, reviewMobilePurchaseDraft } from "@/server/mobile/mobile-procurement-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await getMobileProcurementOverview(user)) });
  } catch (error) {
    return mobileError(error, "Không thể tải nghiệp vụ mua hàng trên điện thoại.");
  }
}

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    const body = await request.json();
    if (body?.action === "reviewDraft") {
      const { action: _action, ...input } = body;
      return NextResponse.json({ ok: true, ...(await reviewMobilePurchaseDraft(user, input)) });
    }
    if (body?.action === "createDraft") {
      const { action: _action, ...input } = body;
      return NextResponse.json({ ok: true, ...(await createMobilePurchaseDraft(user, actor, input)) });
    }
    return NextResponse.json({ ok: false, error: "Thao tác mua hàng trên điện thoại không hợp lệ." }, { status: 400 });
  } catch (error) {
    return mobileError(error, "Không thể tạo phiếu mua nháp.");
  }
}
