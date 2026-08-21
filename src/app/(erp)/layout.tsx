import { redirect } from "next/navigation";
import { ErpShell } from "@/components/erp-v2/erp-shell";
import { requirePageIdentityUser } from "@/server/identity/auth-context";

export const dynamic = "force-dynamic";

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageIdentityUser();
  if (user.role === "customer" || user.role === "supplier") {
    redirect(user.role === "customer" ? "/khach-hang" : "/nha-cung-cap");
  }
  return <ErpShell user={user}>{children}</ErpShell>;
}
