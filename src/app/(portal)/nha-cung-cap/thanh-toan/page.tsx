import { SupplierPaymentPage } from "@/components/erp-v2/partner-portal-record-pages";
import { requireSupplierPortalPageModel } from "@/server/erp-v2/partner-portal-page";
export const dynamic = "force-dynamic";
export default async function SupplierPaymentsPage() { const { model } = await requireSupplierPortalPageModel(); return <SupplierPaymentPage model={model} />; }
