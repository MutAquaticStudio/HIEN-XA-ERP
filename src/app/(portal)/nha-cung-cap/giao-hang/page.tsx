import { SupplierPortalWorkspace } from "@/components/erp-v2/supplier-portal-workspace";
import { requireSupplierPortalPageModel } from "@/server/erp-v2/partner-portal-page";
export const dynamic = "force-dynamic";
export default async function SupplierDeliveryNoticePage() { const { model } = await requireSupplierPortalPageModel(); return <SupplierPortalWorkspace model={model} activePath="/nha-cung-cap/giao-hang" />; }
