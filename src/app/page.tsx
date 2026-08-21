import { redirect } from "next/navigation";
import { requirePageIdentityUser } from "@/server/identity/auth-context";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requirePageIdentityUser();
  redirect(user.role === "customer" ? "/khach-hang" : user.role === "supplier" ? "/nha-cung-cap" : "/dashboard");
}
