import { NextResponse } from "next/server";
import {
  archiveMobileBankTransferProof,
  getMobileCashOverview,
  runMobileCashAction
} from "@/server/mobile/mobile-finance-workforce-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import type { MobileRouteFormData } from "@/server/mobile/mobile-portal-service";

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    return NextResponse.json({ ok: true, ...(await getMobileCashOverview(user)) });
  } catch (error) {
    return mobileError(error, "Không thể tải quỹ và ngân hàng trên điện thoại.");
  }
}

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    const contentType = request.headers.get("content-type") ?? "";
    const result = contentType.includes("multipart/form-data")
      ? await archiveMobileBankTransferProof(user, actor, await request.formData() as unknown as MobileRouteFormData)
      : await runMobileCashAction(user, actor, await request.json());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return mobileError(error, "Không thể xử lý quỹ, ngân hàng hoặc chứng từ chuyển khoản.");
  }
}
