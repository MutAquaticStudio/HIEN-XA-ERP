import { redirect } from "next/navigation";
import { PartnerPortalFrame } from "@/components/erp-v2/partner-portal-record-pages";
import { requirePageIdentityUser } from "@/server/identity/auth-context";

export const dynamic = "force-dynamic";

export default async function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageIdentityUser();
  if (user.role !== "customer" || !user.customerId) redirect("/");
  return <PartnerPortalFrame role="customer">{children}</PartnerPortalFrame>;
}
