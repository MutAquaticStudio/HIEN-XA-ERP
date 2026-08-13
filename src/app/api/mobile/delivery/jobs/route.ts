import { NextResponse } from "next/server";
import { z } from "zod";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { getMobileDeliveryOverview } from "@/server/mobile/mobile-inventory-delivery-service";

const querySchema = z.object({ jobId: z.string().trim().min(1).max(128) });

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    const query = querySchema.parse({ jobId: new URL(request.url).searchParams.get("jobId") });
    return NextResponse.json({ ok: true, ...(await getMobileDeliveryOverview(user, query.jobId)) });
  } catch (error) {
    return mobileError(error, "Không thể tải chi tiết chuyến giao.");
  }
}
