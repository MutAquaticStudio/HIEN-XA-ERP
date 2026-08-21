import { redirect } from "next/navigation";
import { requirePageIdentityUser } from "@/server/identity/auth-context";
import { getErpV2Snapshot } from "./runtime";
import { buildCustomerPortalReadModel, buildSupplierPortalReadModel } from "./partner-portal-read-model";

export async function requireCustomerPortalPageModel() {
  const user = await requirePageIdentityUser();
  if (user.role !== "customer" || !user.customerId) redirect("/");
  const snapshot = await getErpV2Snapshot();
  const model = buildCustomerPortalReadModel(snapshot.state, user.customerId);
  if (!model) redirect("/khach-hang");
  return { user, model };
}

export async function requireSupplierPortalPageModel() {
  const user = await requirePageIdentityUser();
  if (user.role !== "supplier" || !user.supplierId) redirect("/");
  const snapshot = await getErpV2Snapshot();
  const model = buildSupplierPortalReadModel(snapshot.state, user.supplierId);
  if (!model) redirect("/nha-cung-cap");
  return { user, model };
}
