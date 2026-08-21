import { NextResponse } from "next/server";
import { getErpV2Snapshot } from "@/server/erp-v2/runtime";
import { communicationService } from "@/server/communications/runtime";
import { mobileError, requireMobileContext } from "@/server/mobile/mobile-api";
import { assertWebMutationOrigin } from "@/server/shared/web-mutation-origin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { user } = await requireMobileContext(request);
    const snapshot = await getErpV2Snapshot();
    return NextResponse.json({ ok: true, ...(await communicationService.listOnlineParties(user, snapshot.state)) });
  } catch (error) {
    return mobileError(error, "Không thể tải trạng thái online.");
  }
}

export async function POST(request: Request) {
  try {
    assertWebMutationOrigin(request, "Yêu cầu cập nhật trạng thái online không hợp lệ.");
    const { user } = await requireMobileContext(request);
    const snapshot = await getErpV2Snapshot();
    return NextResponse.json({ ok: true, ...(await communicationService.touchPartnerPresence(user, snapshot.state)) });
  } catch (error) {
    return mobileError(error, "Không thể cập nhật trạng thái online.");
  }
}
