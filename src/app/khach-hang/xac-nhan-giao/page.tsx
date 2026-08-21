import { redirect } from "next/navigation";
import { CustomerDeliveryReceiptPortal } from "@/components/erp-v2/customer-delivery-receipt-portal";
import { PartnerPortalFrame } from "@/components/erp-v2/partner-portal-record-pages";
import { requireCustomerPortalPageModel } from "@/server/erp-v2/partner-portal-page";

export default async function CustomerDeliveryReceiptPage() {
  try {
    const { model } = await requireCustomerPortalPageModel();
    return <PartnerPortalFrame role="customer" activePath="/khach-hang/xac-nhan-giao"><CustomerDeliveryReceiptPortal deliveries={model.deliveries} /></PartnerPortalFrame>;
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/khach-hang/dang-nhap");
  }
}
