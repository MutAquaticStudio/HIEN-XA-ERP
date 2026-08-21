"use client";


import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileSpreadsheet,
  HandCoins,
  Home,
  LogOut,
  PlusCircle,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Truck,
  Users,
  WalletCards,
  Warehouse
} from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import {
  getOperationsSnapshotAction,
  importWorkbookDryRunAction,
  runErpV2CreateCommandAction,
  runErpV2CreateCommandWithImageAction,
  runErpV2OperationAction,
  submitDeliveryCompletionWithImageAction,
  submitGoodsReceiptWithImageAction
} from "@/app/actions";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { deliveryLineQuantityInputMode } from "@/modules/operations/worker-ui-policy";
import {
  cashBalance,
  customerBalance,
  employeeBalance,
  getSelectableCustomers,
  lineTotals,
  partyName,
  productLabel,
  salesOrderTotals,
  stockBalance,
  supplierBalance
} from "@/modules/operations/selectors";
import {
  createMonthlyReport,
  getAvailableReportMonths,
  getDefaultReportMonth
} from "@/modules/operations/monthly-report";
import { createMonthlyReportExportPackage } from "@/modules/operations/report-package";
import {
  createRoleDashboard,
  type DashboardRoleId,
  type RoleDashboardMetric,
  type RoleDashboardTask
} from "@/modules/operations/role-dashboard";
import {
  dashboardRoleForActor
} from "@/modules/operations/identity";
import { createAuditIntegrityReport, createAuditLogCsv } from "@/modules/operations/audit-integrity";
import {
  createDebtStatementCsv,
  getCustomerDebtObligations,
  getCustomerDebtSummaries,
  getOpenCustomerDebtObligations,
  getOpenSupplierDebtObligations,
  getSupplierDebtObligations,
  getSupplierDebtSummaries,
  paymentAllocatedAmount,
  paymentUnallocatedAmount
} from "@/modules/operations/debt-reconciliation";
import { configuredPurchaseUnit, configuredPurchaseUnits, normalizeUnitName } from "@/modules/operations/unit-settings";
import {
  operationDescriptions,
  operationLabels,
  operationsErpRegistry,
  operationsOdooMetadata,
  type OperationsModuleId
} from "@/modules/operations/erp-registry";
import type { CreateCommand, DomainCommandName, OperationName, OperationOptions, OperationsActor, OperationsAttachment, OperationResult, OperationsSnapshot, OperationsState, PurchaseOrderLine, SalesOrderLine } from "@/modules/operations/types";

import { OperationsActorContext, type CreateCommandHandler, type OperationHandler, type SyncMeta, type WorkbookImportHandler } from './operations-contract';
import {
  FormField,
  ProductCatalogPreview,
  SubmitButton,
  WorkflowActionButton,
  ApprovalAttachmentPreview,
  OperationRow,
  EntityPanel,
  DataTable,
  SummaryItem,
  Metric,
  StatusBadge,
  canRunOperation,
  findPurchaseLineForUi,
  productBaseUnit,
  usesProductBaseUnit,
  documentUnitOptions,
  purchaseDocumentUnitOptions,
  defaultPurchaseUnitId,
  defaultPurchaseUnitFactor,
  defaultPurchaseUnitMode,
  isVariablePurchaseUnit,
  displayUnitName,
  documentConversionPreview,
  lineDocumentFactor,
  lineDocumentUnitName,
  salesLineQuantityText,
  purchaseLineProgressText,
  localDateValue,
  defaultAllocationAmounts,
  downloadTextFile,
  filterRows,
  normalizeSearch,
  statusText,
  debtStatusText,
  roleText,
  sourceText,
  formatRoleMetricValue,
  taskStatusClassName,
  taskStatusText
} from './operations-shared';

export function ReceivablesView({
  state,
  runOperation,
  createCommand,
  isPending
}: {
  state: OperationsState;
  runOperation: OperationHandler;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const customers = getSelectableCustomers(state, actor);
  const [customerId, setCustomerId] = useState("all");
  const summaries = getCustomerDebtSummaries(state);
  const obligations = getCustomerDebtObligations(state);
  const filteredSummaries = customerId === "all" ? summaries : summaries.filter((item) => item.partyId === customerId);
  const filteredObligations = customerId === "all" ? obligations : obligations.filter((item) => item.partyId === customerId);
  const filteredLedger = customerId === "all" ? state.customerLedgerEntries : state.customerLedgerEntries.filter((entry) => entry.customerId === customerId);
  const totalBalance = filteredSummaries.reduce((sum, item) => sum + item.balance, 0);
  const totalOpen = filteredSummaries.reduce((sum, item) => sum + item.openObligationAmount, 0);
  const totalUnapplied = filteredSummaries.reduce((sum, item) => sum + item.unappliedPaymentAmount, 0);
  const openCount = filteredSummaries.reduce((sum, item) => sum + item.openObligationCount, 0);

  function exportStatement() {
    downloadTextFile(`doi-soat-cong-no-khach-hang-${localDateValue()}.csv`, createDebtStatementCsv(state, "customer"));
  }

  return (
    <div className="workbench-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Đối soát công nợ khách hàng</h3>
            <p className="panel-note">Số dư đọc từ sổ phụ; phân bổ chỉ khớp phiếu thu với chứng từ giao hàng.</p>
          </div>
          <button className="button button-small" type="button" onClick={exportStatement}>
            <Download aria-hidden="true" /> Xuất đối soát
          </button>
        </div>
        <div className="panel-body">
          <div className="debt-filter-row">
            <FormField label="Phạm vi khách hàng">
              <select className="input" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="all">Tất cả khách hàng</option>
                {customers.length === 0 ? <option value="" disabled>Không có khách hàng trong phạm vi</option> : null}
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} · {customer.displayName}</option>)}
              </select>
            </FormField>
          </div>
          <DebtControlBoard
            partyLabel="khách hàng"
            balanceLabel="Tổng phải thu"
            openLabel="Cần thu theo chứng từ"
            unappliedLabel="Tiền đã thu chưa phân bổ"
            totalBalance={totalBalance}
            totalOpen={totalOpen}
            totalUnapplied={totalUnapplied}
            openCount={openCount}
            summaries={filteredSummaries}
            obligations={filteredObligations}
            onChooseParty={setCustomerId}
          />
          <div className="summary-grid">
            <SummaryItem label="Số dư phải thu" value={formatMoney(totalBalance)} />
            <SummaryItem label="Chứng từ còn mở" value={`${openCount} chứng từ`} />
            <SummaryItem label="Giá trị còn mở" value={formatMoney(totalOpen)} />
            <SummaryItem label="Tiền thu chưa phân bổ" value={formatMoney(totalUnapplied)} />
          </div>
          <h4 className="section-heading">Đối chiếu theo khách hàng</h4>
          <DataTable
            headers={["Khách hàng", "Số dư sổ phụ", "Nghĩa vụ còn mở", "Thu chưa phân bổ", "Chứng từ mở"]}
            rows={filteredSummaries.map((item) => [
              item.partyName,
              formatMoney(item.balance),
              formatMoney(item.openObligationAmount),
              formatMoney(item.unappliedPaymentAmount),
              item.openObligationCount
            ])}
          />
          <h4 className="section-heading">Nghĩa vụ phải thu</h4>
          <DataTable
            className="debt-data-table"
            headers={["Khách hàng", "Chứng từ", "Ngày", "Giá trị gốc", "Đã phân bổ", "Còn mở", "Trạng thái"]}
            rows={filteredObligations.map((item) => [
              item.partyName,
              item.sourceDocument,
              formatDateTime(item.postingDate),
              formatMoney(item.originalAmount),
              formatMoney(item.allocatedAmount),
              formatMoney(item.openAmount),
              debtStatusText(item.status)
            ])}
            emptyText="Chưa có nghĩa vụ phải thu. Hoàn tất giao hàng để phát sinh."
          />
          <h4 className="section-heading">Phiếu thu và phân bổ</h4>
          <DataTable
            className="debt-data-table"
            headers={["Phiếu", "Khách", "Số tiền", "Trạng thái", "Đã phân bổ", "Chưa phân bổ", "Hành động"]}
            rows={state.customerPayments.filter((payment) => customerId === "all" || payment.customerId === customerId).map((payment) => [
              payment.documentNo,
              partyName(state, payment.customerId),
              formatMoney(payment.amount),
              statusText(payment.status),
              formatMoney(paymentAllocatedAmount(payment)),
              formatMoney(paymentUnallocatedAmount(payment)),
              payment.status === "draft" ? (
                <WorkflowActionButton key="confirm" operation="confirmCustomerPayment" state={state} runOperation={runOperation} isPending={isPending} label="Xác nhận thu" targetId={payment.id} />
              ) : payment.status === "confirmed" || payment.status === "partially_allocated" ? (
                <div key="actions" className="table-actions">
                  <WorkflowActionButton operation="allocateCustomerPayment" state={state} runOperation={runOperation} isPending={isPending} label="Chọn chứng từ" targetId={payment.id} />
                  <WorkflowActionButton operation="reverseCustomerPayment" state={state} runOperation={runOperation} isPending={isPending} label="Đảo phiếu" targetId={payment.id} />
                </div>
              ) : payment.status === "allocated" ? (
                <div key="actions" className="table-actions">
                  <span className="muted">Đã phân bổ đủ</span>
                  <WorkflowActionButton operation="reverseCustomerPayment" state={state} runOperation={runOperation} isPending={isPending} label="Đảo phiếu" targetId={payment.id} />
                </div>
              ) : <span key="done" className="muted">Đã đảo</span>
            ])}
          />
          <h4 className="section-heading">Bút toán sổ phụ</h4>
          <DataTable
            headers={["Khách", "Chứng từ", "Nợ", "Có", "Ngày"]}
            rows={filteredLedger.map((entry) => [
              partyName(state, entry.customerId),
              entry.sourceDocument,
              entry.direction === "debit" ? formatMoney(entry.amount) : "",
              entry.direction === "credit" ? formatMoney(entry.amount) : "",
              formatDateTime(entry.postingDate)
            ])}
            emptyText="Chưa có dòng công nợ. Hoàn tất giao hoặc xác nhận phiếu thu để phát sinh."
          />
        </div>
      </section>
      <div className="side-stack">
        <CustomerPaymentDraftForm state={state} createCommand={createCommand} isPending={isPending} />
      </div>
    </div>
  );
}


export function DebtControlBoard({
  partyLabel,
  balanceLabel,
  openLabel,
  unappliedLabel,
  totalBalance,
  totalOpen,
  totalUnapplied,
  openCount,
  summaries,
  obligations,
  onChooseParty
}: {
  partyLabel: string;
  balanceLabel: string;
  openLabel: string;
  unappliedLabel: string;
  totalBalance: number;
  totalOpen: number;
  totalUnapplied: number;
  openCount: number;
  summaries: ReturnType<typeof getCustomerDebtSummaries>;
  obligations: ReturnType<typeof getCustomerDebtObligations>;
  onChooseParty: (partyId: string) => void;
}) {
  const priorityObligations = obligations
    .filter((item) => item.openAmount > 0)
    .sort((left, right) => left.postingDate.localeCompare(right.postingDate) || right.openAmount - left.openAmount)
    .slice(0, 4);
  const priorityParties = summaries
    .filter((item) => item.openObligationAmount > 0 || item.unappliedPaymentAmount > 0)
    .sort((left, right) => right.openObligationAmount - left.openObligationAmount)
    .slice(0, 5);

  return (
    <section className="debt-control-board" aria-label={`Bảng theo dõi công nợ ${partyLabel}`}>
      <header className="debt-control-heading">
        <div>
          <p>Bảng theo dõi hôm nay</p>
          <h4>{`Công nợ ${partyLabel}: cần xem gì trước?`}</h4>
        </div>
        <span>Đọc từ sổ phụ</span>
      </header>
      <div className="debt-control-metrics">
        <DebtControlMetric label={balanceLabel} value={formatMoney(totalBalance)} note="Số dư hiện có" tone="green" />
        <DebtControlMetric label={openLabel} value={formatMoney(totalOpen)} note={`${openCount} chứng từ chưa khép`} tone="amber" />
        <DebtControlMetric label={unappliedLabel} value={formatMoney(totalUnapplied)} note="Cần phân bổ vào chứng từ" tone="blue" />
      </div>
      <div className="debt-control-columns">
        <section className="debt-control-section">
          <div>
            <h5>Cần xử lý trước</h5>
            <p>Ưu tiên theo ngày ghi sổ vì chứng từ chưa có hạn thanh toán.</p>
          </div>
          {priorityObligations.length ? <ol className="debt-priority-list">
            {priorityObligations.map((item) => <li key={item.ledgerEntryId}>
              <button type="button" onClick={() => onChooseParty(item.partyId)}>
                <span><strong>{item.partyName}</strong><small>{item.sourceDocument} · Ghi sổ {formatDateTime(item.postingDate)}</small></span>
                <b>{formatMoney(item.openAmount)}</b>
                <em>Xem</em>
              </button>
            </li>)}
          </ol> : <p className="debt-control-empty">Chưa có chứng từ còn mở cần theo dõi.</p>}
        </section>
        <section className="debt-control-section">
          <div>
            <h5>Theo dõi theo {partyLabel}</h5>
            <p>Chọn một dòng để xem toàn bộ chứng từ và phân bổ bên dưới.</p>
          </div>
          {priorityParties.length ? <div className="debt-party-watch-list">
            {priorityParties.map((item) => <button key={item.partyId} type="button" onClick={() => onChooseParty(item.partyId)}>
              <span><strong>{item.partyName}</strong><small>{item.openObligationCount} chứng từ còn mở</small></span>
              <b>{formatMoney(item.openObligationAmount)}</b>
            </button>)}
          </div> : <p className="debt-control-empty">Chưa có đối tác có số dư cần xử lý.</p>}
        </section>
      </div>
    </section>
  );
}


export function DebtControlMetric({ label, value, note, tone }: { label: string; value: string; note: string; tone: "green" | "amber" | "blue" }) {
  return <article className={`debt-control-metric debt-control-metric-${tone}`}><p>{label}</p><strong>{value}</strong><span>{note}</span></article>;
}

export function CustomerPaymentDraftForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const customers = getSelectableCustomers(state, actor);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<{ customerId: string; amount: number }>({
    defaultValues: { customerId: customers[0]?.id ?? "", amount: 0 }
  });
  const disabled = isPending || customers.length === 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Tạo phiếu thu nháp</h3>
          <p className="panel-note">Xác nhận phiếu thu mới ghi tiền mặt và sổ công nợ khách hàng.</p>
        </div>
      </div>
      <div className="panel-body">
        <form
          className="command-form"
          noValidate
          onSubmit={handleSubmit((values) => {
            createCommand(
              { type: "createCustomerPaymentDraft", customerId: values.customerId, amount: values.amount },
              () => reset({ customerId: values.customerId, amount: 0 })
            );
          })}
        >
          <FormField label="Khách hàng">
            <select className="input" {...register("customerId", { required: true })}>
              {customers.length === 0 ? <option value="" disabled>Không có khách hàng trong phạm vi</option> : null}
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Số tiền thu" error={errors.amount?.message}>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              {...register("amount", {
                valueAsNumber: true,
                min: { value: 1, message: "Số tiền thu phải lớn hơn 0." }
              })}
            />
          </FormField>
          <SubmitButton label="Tạo phiếu thu" command="createCustomerPaymentDraft" isPending={isPending} disabled={disabled} />
        </form>
      </div>
    </section>
  );
}


