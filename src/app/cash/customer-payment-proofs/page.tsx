import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { reviewCustomerPaymentProofAction } from "@/app/customer-payment-actions";
import { getErpV2Snapshot } from "@/server/erp-v2/runtime";
import { createRoleActor } from "@/modules/operations/identity";
import { projectOperationsState } from "@/server/identity/operations-projection";
import { requirePageIdentityUser } from "@/server/identity/auth-context";
import styles from "../transfer-proofs/transfer-proofs.module.css";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
}

export default async function CustomerPaymentProofsPage() {
  const [user, snapshot] = await Promise.all([requirePageIdentityUser(), getErpV2Snapshot()]);
  const actor = createRoleActor(user.role);
  if (!actor.permissions.includes("cash.archive_transfer_proof")) redirect("/");

  const state = projectOperationsState(snapshot.state, user);
  const requests = [...(state.customerPaymentProofRequests ?? [])].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  const salesOrdersById = new Map(state.salesOrders.map((order) => [order.id, order]));
  const customersById = new Map(state.customers.map((customer) => [customer.id, customer]));

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="customer-payment-proof-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Sổ quỹ / Khách hàng</p>
          <h1 id="customer-payment-proof-title" className={styles.heroTitle}>Minh chứng khách chuyển khoản</h1>
          <p className={styles.heroText}>Kiểm tra tệp, số tiền và mã giao dịch trước khi lập phiếu thu. Việc đánh dấu đã kiểm tra không tự ghi nhận tiền hoặc giảm công nợ.</p>
        </div>
        <a className={styles.backLink} href="/cash/transfer-proofs">Sao lưu chứng từ nội bộ</a>
      </section>

      <section className={styles.card} aria-labelledby="customer-payment-proof-queue-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>Hàng chờ đối soát</p>
            <h2 id="customer-payment-proof-queue-title" className={styles.sectionTitle}>Minh chứng khách đã gửi</h2>
            <p className={styles.sectionHelp}>Sau khi kiểm tra, kế toán lập phiếu thu theo quy trình thu tiền hiện có và phân bổ đúng vào công nợ.</p>
          </div>
        </div>
        {requests.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>Chưa có minh chứng nào cần kiểm tra.</strong>
            <p>Khách gửi ảnh hoặc PDF chuyển khoản sẽ xuất hiện tại đây.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Khách hàng</th><th>Đơn hàng</th><th>Số tiền báo chuyển</th><th>Mã giao dịch</th><th>Tệp</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
              <tbody>
                {requests.map((proof) => {
                  const order = salesOrdersById.get(proof.salesOrderId);
                  const customer = customersById.get(proof.customerId);
                  const status = proof.status === "reviewed" ? "Đã kiểm tra" : proof.status === "rejected" ? "Cần gửi lại" : "Chờ kiểm tra";
                  return <tr key={proof.id}>
                    <td>{customer?.displayName ?? proof.customerId}</td>
                    <td>{order?.documentNo ?? proof.salesOrderId}</td>
                    <td>{formatCurrency(proof.amount)}</td>
                    <td>{proof.transferReference ?? "-"}</td>
                    <td>{proof.attachments.map((attachment, index) => <span key={attachment.id}>{index > 0 ? ", " : ""}<a href={`/api/operations/attachments/${attachment.id}`} target="_blank" rel="noreferrer">{attachment.fileName}</a></span>)}</td>
                    <td>{status}{proof.rejectionReason ? <small> · {proof.rejectionReason}</small> : null}</td>
                    <td>{proof.status === "submitted" ? <div className={styles.actionStack}><form action={reviewCustomerPaymentProofAction}><input type="hidden" name="customerPaymentProofRequestId" value={proof.id} /><input type="hidden" name="idempotencyKey" value={`customer-proof-review-${proof.id}-${randomUUID()}`} /><input type="hidden" name="status" value="reviewed" /><button className={styles.primaryAction} type="submit">Đã kiểm tra</button></form><form action={reviewCustomerPaymentProofAction}><input type="hidden" name="customerPaymentProofRequestId" value={proof.id} /><input type="hidden" name="idempotencyKey" value={`customer-proof-reject-${proof.id}-${randomUUID()}`} /><input type="hidden" name="status" value="rejected" /><label>Lý do từ chối<input name="reason" minLength={5} maxLength={1000} required /></label><button type="submit">Từ chối</button></form></div> : "-"}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
