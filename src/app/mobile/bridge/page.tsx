import { redirect } from "next/navigation";
import { establishIdentitySession, getIdentityUserFromMobileWebBridgeCode } from "@/server/identity/auth-context";

export default async function MobileBridgePage({ searchParams }: { searchParams: Promise<{ token?: string; next?: string }> }) {
  const { token, next } = await searchParams;
  const user = token ? await getIdentityUserFromMobileWebBridgeCode(token) : undefined;
  if (!user) {
    redirect("/login");
  }
  await establishIdentitySession(user);
  redirect(next === "/delivery-tracking" ? "/delivery-tracking" : "/");
}
