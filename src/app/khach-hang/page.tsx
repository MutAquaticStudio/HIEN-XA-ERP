import { redirect } from "next/navigation";
import { CustomerAccountPortal } from "@/components/customer-account-portal";
import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { customerBalance, salesOrderTotals } from "@/modules/operations/selectors";
import { getCurrentIdentityUser } from "@/server/identity/auth-context";

export const dynamic = "force-dynamic";

export default async function CustomerPortalPage() {
  const user = await getCurrentIdentityUser();
  if (!user) {
    redirect("/khach-hang/dang-nhap");
  }
  if (user.role !== "customer") {
    redirect("/");
  }
  if (!user.customerId) {
    return <CustomerPortalUnavailable message="Tài khoản chưa được liên kết với hồ sơ khách hàng. Vui lòng liên hệ cửa hàng." />;
  }

  const snapshot = await getDemoOperationsSnapshot();
  const customer = snapshot.state.customers.find((candidate) => candidate.id === user.customerId);
  if (!customer || customer.status !== "active") {
    return <CustomerPortalUnavailable message="Hồ sơ khách hàng hiện chưa sẵn sàng để tra cứu. Vui lòng liên hệ cửa hàng." />;
  }

  const balance = customerBalance(snapshot.state.customerLedgerEntries, customer.id);
  const activeEntries = snapshot.state.customerLedgerEntries
    .filter((entry) => entry.customerId === customer.id && !entry.reversedById)
    .sort((left, right) => right.postingDate.localeCompare(left.postingDate));
  const paymentDueDate = balance > 0
    ? activeEntries
      .filter((entry) => entry.direction === "debit" && Boolean(entry.dueDate))
      .sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? ""))[0]?.dueDate
    : undefined;
  const entries = activeEntries
    .filter((entry) => entry.direction === "credit")
    .slice(0, 8)
    .map((entry) => ({
      id: entry.id,
      documentNo: entry.sourceDocument,
      date: entry.postingDate,
      direction: entry.direction,
      amount: entry.amount,
      dueDate: entry.dueDate
    }));
  const orders = snapshot.state.salesOrders
    .filter((order) => order.customerId === customer.id)
    .sort((left, right) => right.orderDate.localeCompare(left.orderDate))
    .slice(0, 6)
    .map((order) => ({
      id: order.id,
      documentNo: order.documentNo,
      orderDate: order.orderDate,
      status: order.status,
      total: salesOrderTotals(order.lines, order.deliveryCharge).customerGross,
      paymentMethod: order.paymentMethod
    }));
  const paymentProofs = (snapshot.state.customerPaymentProofRequests ?? [])
    .filter((proof) => proof.customerId === customer.id)
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
    .slice(0, 6)
    .map((proof) => ({ id: proof.id, salesOrderId: proof.salesOrderId, amount: proof.amount, status: proof.status, submittedAt: proof.submittedAt }));

  return (
    <CustomerAccountPortal
      customerName={customer.displayName}
      customerId={customer.id}
      customerPhone={customer.phone}
      balance={balance}
      paymentDueDate={paymentDueDate}
      entries={entries}
      orders={orders}
      paymentProofs={paymentProofs}
    />
  );
}

function CustomerPortalUnavailable({ message }: { message: string }) {
  return (
    <main className="auth-page customer-login-page">
      <section className="auth-panel customer-login-panel">
        <h1>Chưa thể mở thông tin khách hàng</h1>
        <p className="customer-login-help">{message}</p>
      </section>
    </main>
  );
}
