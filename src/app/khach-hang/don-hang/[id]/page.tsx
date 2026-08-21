import { notFound } from "next/navigation";
import { CustomerOrderDetailPage, PartnerPortalFrame } from "@/components/erp-v2/partner-portal-record-pages";
import { requireCustomerPortalPageModel } from "@/server/erp-v2/partner-portal-page";
export const dynamic = "force-dynamic";
export default async function CustomerOrderPage({ params }: { params: Promise<{ id: string }> }) { const [{ model }, { id }] = await Promise.all([requireCustomerPortalPageModel(), params]); const order = model.orders.find((item) => item.id === id); if (!order) notFound(); return <PartnerPortalFrame role="customer" activePath="/khach-hang/don-hang"><CustomerOrderDetailPage order={order} /></PartnerPortalFrame>; }
