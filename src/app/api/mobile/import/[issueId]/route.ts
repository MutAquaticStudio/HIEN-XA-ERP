import { NextResponse } from "next/server";
import { runMobileImportAction } from "@/server/mobile/mobile-import-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function POST(request: Request, context: { params: Promise<{ issueId: string }> }) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    const { issueId } = await context.params;
    return NextResponse.json({ ok: true, ...(await runMobileImportAction(user, actor, issueId, await request.json())) });
  } catch (error) { return mobileError(error, "Không thể cập nhật lỗi import."); }
}
