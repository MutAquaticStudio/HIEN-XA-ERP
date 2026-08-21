import { CustomerOrderPreview } from "@/components/erp-v2/customer-order-preview";
import { buildCustomerOrderCatalog } from "@/modules/operations/customer-order-catalog";
import { getErpV2Snapshot } from "@/server/erp-v2/runtime";
import { getCurrentIdentityUser } from "@/server/identity/auth-context";
import styles from "./page.module.css";
import { PartnerPortalNav } from "@/components/erp-v2/partner-portal-nav";

export const dynamic = "force-dynamic";

export default async function CustomerOrderPage() {
  const user = await getCurrentIdentityUser();
  const snapshot = await getErpV2Snapshot();
  const products = buildCustomerOrderCatalog(snapshot.state);

  return (
    <main className={styles.page}>
      {user?.role === "customer" ? <PartnerPortalNav role="customer" activePath="/dat-hang" /> : null}
      <CustomerOrderPreview products={products} canPlaceOrder={user?.role === "customer" && Boolean(user.customerId)} customerId={user?.role === "customer" ? user.customerId : undefined} />
    </main>
  );
}
