import { CustomerOrderListPage, PartnerPortalFrame } from "@/components/erp-v2/partner-portal-record-pages";
import { requireCustomerPortalPageModel } from "@/server/erp-v2/partner-portal-page";
export const dynamic = "force-dynamic";
export default async function CustomerOrdersPage() { const { model } = await requireCustomerPortalPageModel(); return <PartnerPortalFrame role="customer" activePath="/khach-hang/don-hang"><CustomerOrderListPage model={model} /></PartnerPortalFrame>; }
