import { CustomerOrderPreview } from "@/components/customer-order-preview";
import { getCustomerPortalCatalog } from "@/modules/operations/selectors";
import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { getCurrentIdentityUser } from "@/server/identity/auth-context";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function CustomerOrderPage() {
  const user = await getCurrentIdentityUser();
  const snapshot = await getDemoOperationsSnapshot();
  const products = getCustomerPortalCatalog(snapshot.state);

  return (
    <main className={styles.page}>
      <CustomerOrderPreview products={products} canPlaceOrder={user?.role === "customer" && Boolean(user.customerId)} customerId={user?.role === "customer" ? user.customerId : undefined} />
    </main>
  );
}
