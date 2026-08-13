import { AdminOrderMonitor } from "@/components/admin-order-monitor";
import { requirePageIdentityUser } from "@/server/identity/auth-context";

export const dynamic = "force-dynamic";

export default async function AdminOrderMonitoringPage() {
  await requirePageIdentityUser();
  return <AdminOrderMonitor />;
}
