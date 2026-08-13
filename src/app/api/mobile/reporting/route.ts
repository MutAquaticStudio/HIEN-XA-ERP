import { NextResponse } from "next/server";
import { getMobileReportingOverview, getMobileReportingPackage } from "@/server/mobile/mobile-reporting-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    const url = new URL(request.url);
    const input = { month: url.searchParams.get("month") ?? undefined };
    if (url.searchParams.get("format") === "zip") {
      const packageFile = await getMobileReportingPackage(user, input);
      const bytes = packageFile.bytes;
      const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      return new NextResponse(body, { headers: { "content-type": packageFile.mediaType, "content-disposition": `attachment; filename=${packageFile.fileName}`, "cache-control": "no-store" } });
    }
    return NextResponse.json({ ok: true, ...(await getMobileReportingOverview(user, input)) });
  } catch (error) { return mobileError(error, "Không thể tải báo cáo trên điện thoại."); }
}
