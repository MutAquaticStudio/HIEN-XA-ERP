import { NextResponse } from "next/server";
import { submitMobileCustomerPaymentProof, type MobileRouteFormData } from "@/server/mobile/mobile-portal-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    const formData = await request.formData() as unknown as MobileRouteFormData;
    return NextResponse.json({ ok: true, ...(await submitMobileCustomerPaymentProof(user, actor, formData)) });
  } catch (error) {
    return mobileError(error, "Không thể gửi minh chứng thanh toán.");
  }
}
