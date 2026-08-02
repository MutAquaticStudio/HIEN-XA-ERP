import { NextResponse } from "next/server";
import { getMobileAuditDetail } from "@/server/mobile/mobile-audit-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request, context: { params: Promise<{ auditId: string }> }) {
  try { const { user } = await requireNativeMobileContext(request); const { auditId } = await context.params; return NextResponse.json({ ok: true, ...(await getMobileAuditDetail(user, auditId)) }); }
  catch (error) { return mobileError(error, "Không thể tải chi tiết nhật ký."); }
}
