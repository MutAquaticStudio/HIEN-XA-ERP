import { PartnerPortalFrame } from "@/components/erp-v2/partner-portal-record-pages";
import { SupplierPortalWorkspace } from "@/components/erp-v2/supplier-portal-workspace";
import { requireSupplierPortalPageModel } from "@/server/erp-v2/partner-portal-page";

export const dynamic = "force-dynamic";

export default async function SupplierPortalPage() {
  const { model } = await requireSupplierPortalPageModel();
  return <PartnerPortalFrame role="supplier" activePath="/nha-cung-cap"><SupplierPortalWorkspace model={model} /></PartnerPortalFrame>;
}
