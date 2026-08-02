import { NextResponse } from "next/server";
import { getMobileCatalogOverview } from "@/server/mobile/mobile-catalog-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request) {
  try { const { user } = await requireNativeMobileContext(request); return NextResponse.json({ ok: true, ...(await getMobileCatalogOverview(user)) }); }
  catch (error) { return mobileError(error, "Không thể tải danh mục trên điện thoại."); }
}
