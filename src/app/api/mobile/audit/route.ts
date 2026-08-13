import { NextResponse } from "next/server";
import { getMobileAuditCsv, getMobileAuditOverview } from "@/server/mobile/mobile-audit-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    const url = new URL(request.url);
    if (url.searchParams.get("format") === "csv") {
      const csv = await getMobileAuditCsv(user);
      return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=nhat-ky-kiem-toan.csv", "cache-control": "no-store" } });
    }
    return NextResponse.json({ ok: true, ...(await getMobileAuditOverview(user, { query: url.searchParams.get("query") ?? undefined, limit: url.searchParams.get("limit") ?? undefined })) });
  } catch (error) { return mobileError(error, "Không thể tải nhật ký kiểm toán trên điện thoại."); }
}
