import { notFound } from "next/navigation";
import { PartnerPortalFrame } from "@/components/erp-v2/partner-portal-record-pages";
import { SupplierPortalWorkspace } from "@/components/erp-v2/supplier-portal-workspace";
import { requireSupplierPortalPageModel } from "@/server/erp-v2/partner-portal-page";
export const dynamic = "force-dynamic";
export default async function SupplierOrderPage({ params }: { params: Promise<{ id: string }> }) { const [{ model }, { id }] = await Promise.all([requireSupplierPortalPageModel(), params]); if (!model.orders.some((item) => item.id === id)) notFound(); return <PartnerPortalFrame role="supplier" activePath="/nha-cung-cap/don-mua"><SupplierPortalWorkspace model={{ ...model, orders: model.orders.filter((item) => item.id === id) }} activePath="/nha-cung-cap/don-mua" /></PartnerPortalFrame>; }
