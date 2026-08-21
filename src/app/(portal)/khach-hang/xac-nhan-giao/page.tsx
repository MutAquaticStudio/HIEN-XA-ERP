import { redirect } from "next/navigation";
import { CustomerDeliveryReceiptPortal } from "@/components/erp-v2/customer-delivery-receipt-portal";
import { requireCustomerPortalPageModel } from "@/server/erp-v2/partner-portal-page";

export default async function CustomerDeliveryReceiptPage() {
  try {
    const { model } = await requireCustomerPortalPageModel();
    return <CustomerDeliveryReceiptPortal deliveries={model.deliveries} />;
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/khach-hang/dang-nhap");
  }
}
