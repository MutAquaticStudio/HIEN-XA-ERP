import { redirect } from "next/navigation";
import { CustomerDeliveryReceiptPortal } from "@/components/customer-delivery-receipt-portal";
import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { projectOperationsState } from "@/server/identity/operations-projection";
import { requireIdentityUser } from "@/server/identity/auth-context";

export default async function CustomerDeliveryReceiptPage() {
  const user = await requireIdentityUser();
  if (user.role !== "customer" || !user.customerId) redirect("/login?error=Không+có+quyền+xác+nhận+giao+hàng.");
  const snapshot = await getDemoOperationsSnapshot();
  const state = projectOperationsState(snapshot.state, user);
  const orderNumbers = new Map(state.salesOrders.map((order) => [order.id, order.documentNo]));
  return (
    <CustomerDeliveryReceiptPortal
      jobs={state.deliveryJobs.map((job) => ({
        id: job.id,
        documentNo: job.documentNo,
        status: job.status,
        customerConfirmation: job.customerConfirmation,
        salesOrderNo: orderNumbers.get(job.salesOrderId) ?? job.salesOrderId
      }))}
    />
  );
}
