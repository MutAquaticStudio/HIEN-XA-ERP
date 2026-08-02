import { redirect } from "next/navigation";
import { getCurrentIdentityUser } from "@/server/identity/auth-context";
import { WebDeliveryTracking } from "@/components/web-delivery-tracking";

export const dynamic = "force-dynamic";

export default async function DriverWebTrackingPage() {
  const user = await getCurrentIdentityUser();
  if (!user) redirect("/login");
  if (!["driver", "worker", "dispatcher", "supervisor", "owner", "administrator"].includes(user.role)) redirect("/");
  return <WebDeliveryTracking />;
}
