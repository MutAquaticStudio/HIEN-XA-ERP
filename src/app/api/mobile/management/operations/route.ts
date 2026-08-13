import { NextResponse } from "next/server";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { runMobileManagementOperation } from "@/server/mobile/mobile-management-command-service";

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await runMobileManagementOperation(user, actor, await request.json())) });
  } catch (error) {
    return mobileError(error, "Không thể thực hiện thao tác quản trị trên điện thoại.");
  }
}
