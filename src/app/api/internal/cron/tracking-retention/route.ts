import { NextResponse } from "next/server";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Không được phép chạy dọn dữ liệu GPS." }, { status: 401 });
  }
  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    return NextResponse.json({ ok: true, ...(await deliveryTrackingService.runRetention(dryRun)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Không thể dọn dữ liệu GPS." }, { status: 500 });
  }
}
