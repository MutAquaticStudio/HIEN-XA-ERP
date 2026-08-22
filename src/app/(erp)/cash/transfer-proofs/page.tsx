import { randomUUID } from "node:crypto";
import { archiveBankTransferProofAction } from "@/app/actions";
import { getErpV2Snapshot } from "@/server/erp-v2/runtime";
import { createRoleActor } from "@/modules/operations/identity";
import { requirePageIdentityUser } from "@/server/identity/auth-context";
import { projectOperationsState } from "@/server/identity/operations-projection";
import { redirect } from "next/navigation";
import { TransferProofFilePicker } from "./transfer-proof-file-picker";
import styles from "./transfer-proofs.module.css";

type TransferProofsPageProps = {
  searchParams: Promise<{ message?: string; error?: string }>;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default async function TransferProofsPage({ searchParams }: TransferProofsPageProps) {
  const [user, snapshot, query] = await Promise.all([
    requirePageIdentityUser(),
    getErpV2Snapshot(),
    searchParams
  ]);
  const actor = createRoleActor(user.role);
  if (!actor.permissions.includes("cash.archive_transfer_proof")) {
    redirect("/");
  }

  const state = projectOperationsState(snapshot.state, user);
  const relatedDocumentNos = [
    ...state.customerPayments,
    ...state.supplierPayments,
    ...state.cashVouchers,
    ...state.employeePayments
  ].map((document) => document.documentNo).sort((left, right) => left.localeCompare(right));

  return (
    <section className={styles.page}>
      <section className={styles.hero} aria-labelledby="transfer-proof-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Sổ quỹ / Chứng từ ngân hàng</p>
          <h1 id="transfer-proof-title" className={styles.heroTitle}>Sao lưu chứng từ chuyển khoản</h1>
          <p className={styles.heroText}>Lưu ảnh hoặc PDF để đối chiếu sau này. Việc lưu chứng từ không tự tạo phiếu thu, phiếu chi hoặc bút toán công nợ.</p>
        </div>
        <a className={styles.backLink} href="/">Quay lại Sổ quỹ</a>
        <ol className={styles.steps} aria-label="Các bước sao lưu chứng từ">
          <li className={styles.step}><span>1</span><strong>Nhập giao dịch</strong><small>Điền số tiền, đối tác và mã ngân hàng.</small></li>
          <li className={styles.step}><span>2</span><strong>Đính kèm chứng từ</strong><small>Chọn ảnh hoặc PDF từ điện thoại, máy tính.</small></li>
          <li className={styles.step}><span>3</span><strong>Lưu để đối chiếu</strong><small>Chứng từ chỉ người có quyền tài chính xem được.</small></li>
        </ol>
      </section>

      <section className={styles.card} aria-labelledby="transfer-proof-form-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>Bước 1 và 2</p>
            <h2 id="transfer-proof-form-title" className={styles.sectionTitle}>Thông tin chuyển khoản</h2>
            <p className={styles.sectionHelp}>Các ô có dấu <b>*</b> là bắt buộc. Hãy kiểm tra số tiền và mã giao dịch trước khi lưu.</p>
          </div>
          <p className={styles.securityNote}>Tệp được lưu riêng tư</p>
        </div>

        {query.message ? <p className={styles.successMessage} role="status">{query.message}</p> : null}
        {query.error ? <p className={styles.errorMessage} role="alert">{query.error}</p> : null}

        <form action={archiveBankTransferProofAction} className={styles.form}>
          <input type="hidden" name="idempotencyKey" value={`transfer-proof-${randomUUID()}`} />
          <fieldset className={styles.fieldset}>
            <legend>Thông tin giao dịch</legend>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span>Loại chuyển khoản <b>*</b></span>
                <select className={styles.input} name="direction" defaultValue="out" required>
                  <option value="out">Chi tiền</option>
                  <option value="in">Thu tiền</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Số tiền (VND) <b>*</b></span>
                <input className={styles.input} name="amount" type="number" min="1" step="1" inputMode="numeric" placeholder="Ví dụ: 2 500 000" required />
              </label>
              <label className={styles.field}>
                <span>Đối tác chuyển hoặc nhận tiền <b>*</b></span>
                <input className={styles.input} name="counterpartyName" minLength={2} maxLength={100} placeholder="Ví dụ: Công ty Vật tư An Phú" required />
              </label>
              <label className={styles.field}>
                <span>Mã giao dịch ngân hàng <b>*</b></span>
                <input className={styles.input} name="transactionReference" minLength={3} maxLength={120} placeholder="Xem trên ứng dụng ngân hàng" required />
              </label>
              <label className={styles.field}>
                <span>Thời điểm chuyển khoản <b>*</b></span>
                <input className={styles.input} name="transferredAt" type="datetime-local" required />
              </label>
              <label className={styles.field}>
                <span>Chứng từ nghiệp vụ liên quan</span>
                <input className={styles.input} name="relatedDocumentNo" list="related-documents" maxLength={80} placeholder="Không bắt buộc" />
                <small>Chọn khi chuyển khoản đã có phiếu thu, phiếu chi hoặc thanh toán liên quan.</small>
              </label>
            </div>
            <datalist id="related-documents">
              {relatedDocumentNos.map((documentNo) => <option key={documentNo} value={documentNo} />)}
            </datalist>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>Chứng từ và ghi chú</legend>
            <div className={styles.grid}>
              <label className={`${styles.field} ${styles.noteField}`}>
                <span>Ghi chú</span>
                <textarea className={styles.textarea} name="note" maxLength={1000} rows={4} placeholder="Ví dụ: Chuyển cọc đơn vật liệu ngày 24/07" />
                <small>Tối đa 1.000 ký tự.</small>
              </label>
              <TransferProofFilePicker />
            </div>
          </fieldset>

          <div className={styles.actionArea}>
            <p>Trước khi lưu: kiểm tra đúng số tiền, đúng đối tác và đúng tệp đính kèm.</p>
            <button className={styles.primaryAction} type="submit">Lưu chứng từ chuyển khoản</button>
          </div>
        </form>
      </section>

      <section className={styles.card} aria-labelledby="transfer-proof-history-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>Lịch sử lưu trữ</p>
            <h2 id="transfer-proof-history-title" className={styles.sectionTitle}>Chứng từ đã sao lưu</h2>
            <p className={styles.sectionHelp}>Chỉ vai trò tài chính được xem tệp đính kèm.</p>
          </div>
        </div>
        {state.bankTransferProofs.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>Chưa có chứng từ chuyển khoản nào.</strong>
            <p>Sau khi lưu, chứng từ sẽ xuất hiện tại đây để kế toán và quản lý đối chiếu.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Số chứng từ</th><th>Loại</th><th>Số tiền</th><th>Đối tác</th><th>Mã giao dịch</th><th>Liên quan</th><th>Tệp</th><th>Lưu lúc</th></tr></thead>
              <tbody>
                {[...state.bankTransferProofs].sort((left, right) => right.archivedAt.localeCompare(left.archivedAt)).map((proof) => (
                  <tr key={proof.id}>
                    <td>{proof.documentNo}</td>
                    <td>{proof.direction === "in" ? "Thu tiền" : "Chi tiền"}</td>
                    <td>{formatCurrency(proof.amount)}</td>
                    <td>{proof.counterpartyName}</td>
                    <td>{proof.transactionReference}</td>
                    <td>{proof.relatedDocumentNo ?? "-"}</td>
                    <td>{proof.attachments.map((attachment, index) => <span key={attachment.id}>{index > 0 ? ", " : ""}<a href={`/api/operations/attachments/${attachment.id}`} target="_blank" rel="noreferrer">{attachment.fileName}</a></span>)}</td>
                    <td>{formatDateTime(proof.archivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
