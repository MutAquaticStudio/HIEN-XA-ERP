import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CommunicationsWorkspace } from "@/components/partner-conversation";
import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { requirePageIdentityUser } from "@/server/identity/auth-context";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const internalRoles = new Set(["owner", "administrator", "sales", "accountant", "warehouse", "dispatcher"]);

export default async function CommunicationsPage() {
  const user = await requirePageIdentityUser();
  if (!internalRoles.has(user.role)) redirect("/");
  const snapshot = await getDemoOperationsSnapshot();
  const contacts = [
    ...snapshot.state.customers.filter((customer) => customer.status === "active").map((customer) => ({ id: customer.id, partyType: "customer" as const, label: customer.displayName, code: customer.code })),
    ...snapshot.state.suppliers.filter((supplier) => supplier.status === "active").map((supplier) => ({ id: supplier.id, partyType: "supplier" as const, label: supplier.displayName, code: supplier.code }))
  ];
  return <><Link className="communications-back" href="/"><ArrowLeft aria-hidden="true" />Về hệ thống vận hành</Link><CommunicationsWorkspace contacts={contacts} /></>;
}
