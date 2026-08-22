import { CustomerPortalOverview } from "@/components/erp-v2/customer-portal-overview";
import { requireCustomerPortalPageModel } from "@/server/erp-v2/partner-portal-page";

export const dynamic = "force-dynamic";

export default async function CustomerPortalPage() {
  const { model } = await requireCustomerPortalPageModel();
  return <CustomerPortalOverview model={model} />;
}
