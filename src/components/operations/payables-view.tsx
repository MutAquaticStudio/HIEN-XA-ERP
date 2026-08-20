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
  runDemoCreateCommandAction,
  runDemoCreateCommandWithImageAction,
  runDemoOperationAction,
  submitDeliveryCompletionWithImageAction,
  submitGoodsReceiptWithImageAction
} from "@/app/actions";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { deliveryLineQuantityInputMode } from "@/modules/operations/worker-ui-policy";
import {
  cashBalance,
  customerBalance,
  employeeBalance,
  getSelectableSuppliers,
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
import { DebtControlBoard } from './receivables-view';

export function PayablesView({
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
  const suppliers = getSelectableSuppliers(state, actor);
  const [supplierId, setSupplierId] = useState("all");
  const summaries = getSupplierDebtSummaries(state);
  const obligations = getSupplierDebtObligations(state);
  const filteredSummaries = supplierId === "all" ? summaries : summaries.filter((item) => item.partyId === supplierId);
  const filteredObligations = supplierId === "all" ? obligations : obligations.filter((item) => item.partyId === supplierId);
  const filteredLedger = supplierId === "all" ? state.supplierLedgerEntries : state.supplierLedgerEntries.filter((entry) => entry.supplierId === supplierId);
  const totalBalance = filteredSummaries.reduce((sum, item) => sum + item.balance, 0);
  const totalOpen = filteredSummaries.reduce((sum, item) => sum + item.openObligationAmount, 0);
  const totalUnapplied = filteredSummaries.reduce((sum, item) => sum + item.unappliedPaymentAmount, 0);
  const openCount = filteredSummaries.reduce((sum, item) => sum + item.openObligationCount, 0);

  function exportStatement() {
    downloadTextFile(`doi-soat-cong-no-nha-cung-cap-${localDateValue()}.csv`, createDebtStatementCsv(state, "supplier"));
  }

  return (
    <div className="workbench-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Đối soát công nợ nhà cung cấp</h3>
            <p className="panel-note">Phải trả đọc từ sổ phụ; phiếu chi được khớp riêng theo từng chứng từ nhận hàng.</p>
          </div>
          <button className="button button-small" type="button" onClick={exportStatement}>
            <Download aria-hidden="true" /> Xuất đối soát
          </button>
        </div>
        <div className="panel-body">
          <div className="debt-filter-row">
            <FormField label="Phạm vi nhà cung cấp">
              <select className="input" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="all">Tất cả nhà cung cấp</option>
                {suppliers.length === 0 ? <option value="" disabled>Không có nhà cung cấp trong phạm vi</option> : null}
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.displayName}</option>)}
              </select>
            </FormField>
          </div>
          <DebtControlBoard
            partyLabel="nhà cung cấp"
            balanceLabel="Tổng phải trả"
            openLabel="Cần chi theo chứng từ"
            unappliedLabel="Tiền đã chi chưa phân bổ"
            totalBalance={totalBalance}
            totalOpen={totalOpen}
            totalUnapplied={totalUnapplied}
            openCount={openCount}
            summaries={filteredSummaries}
            obligations={filteredObligations}
            onChooseParty={setSupplierId}
          />
          <div className="summary-grid">
            <SummaryItem label="Số dư phải trả" value={formatMoney(totalBalance)} />
            <SummaryItem label="Chứng từ còn mở" value={`${openCount} chứng từ`} />
            <SummaryItem label="Giá trị còn mở" value={formatMoney(totalOpen)} />
            <SummaryItem label="Tiền chi chưa phân bổ" value={formatMoney(totalUnapplied)} />
          </div>
          <h4 className="section-heading">Đối chiếu theo nhà cung cấp</h4>
          <DataTable
            headers={["Nhà cung cấp", "Số dư sổ phụ", "Nghĩa vụ còn mở", "Chi chưa phân bổ", "Chứng từ mở"]}
            rows={filteredSummaries.map((item) => [item.partyName, formatMoney(item.balance), formatMoney(item.openObligationAmount), formatMoney(item.unappliedPaymentAmount), item.openObligationCount])}
          />
          <h4 className="section-heading">Nghĩa vụ phải trả</h4>
          <DataTable
            className="debt-data-table"
            headers={["Nhà cung cấp", "Chứng từ", "Ngày", "Giá trị gốc", "Đã phân bổ", "Còn mở", "Trạng thái"]}
            rows={filteredObligations.map((item) => [item.partyName, item.sourceDocument, formatDateTime(item.postingDate), formatMoney(item.originalAmount), formatMoney(item.allocatedAmount), formatMoney(item.openAmount), debtStatusText(item.status)])}
            emptyText="Chưa có nghĩa vụ phải trả. Nhập kho hoặc xác nhận giao thẳng để phát sinh."
          />
          <h4 className="section-heading">Phiếu chi nhà cung cấp</h4>
          <DataTable
            className="debt-data-table"
            headers={["Phiếu", "Nhà cung cấp", "Số tiền", "Trạng thái", "Đã phân bổ", "Chưa phân bổ", "Hành động"]}
            rows={state.supplierPayments.filter((payment) => supplierId === "all" || payment.supplierId === supplierId).map((payment) => [
              payment.documentNo,
              partyName(state, payment.supplierId),
              formatMoney(payment.amount),
              statusText(payment.status),
              formatMoney(paymentAllocatedAmount(payment)),
              formatMoney(paymentUnallocatedAmount(payment)),
              payment.status === "draft" ? (
                <WorkflowActionButton key="confirm" operation="confirmSupplierPayment" state={state} runOperation={runOperation} isPending={isPending} label="Xác nhận chi" targetId={payment.id} />
              ) : payment.status === "confirmed" || payment.status === "partially_allocated" ? (
                <div key="actions" className="table-actions">
                  <WorkflowActionButton operation="allocateSupplierPayment" state={state} runOperation={runOperation} isPending={isPending} label="Chọn chứng từ" targetId={payment.id} />
                  <WorkflowActionButton operation="reverseSupplierPayment" state={state} runOperation={runOperation} isPending={isPending} label="Đảo phiếu" targetId={payment.id} />
                </div>
              ) : payment.status === "allocated" ? (
                <div key="actions" className="table-actions">
                  <span className="muted">Đã phân bổ đủ</span>
                  <WorkflowActionButton operation="reverseSupplierPayment" state={state} runOperation={runOperation} isPending={isPending} label="Đảo phiếu" targetId={payment.id} />
                </div>
              ) : <span key="done" className="muted">Đã đảo</span>
            ])}
          />
          <h4 className="section-heading">Bút toán sổ phụ</h4>
          <DataTable
            headers={["NCC", "Chứng từ", "Tăng phải trả", "Giảm phải trả", "Ngày"]}
            rows={filteredLedger.map((entry) => [
              partyName(state, entry.supplierId),
              entry.sourceDocument,
              entry.direction === "credit" ? formatMoney(entry.amount) : "",
              entry.direction === "debit" ? formatMoney(entry.amount) : "",
              formatDateTime(entry.postingDate)
            ])}
            emptyText="Chưa có dòng công nợ nhà cung cấp. Ghi nhận nhập kho hoặc giao thẳng để phát sinh."
          />
        </div>
      </section>
      <div className="side-stack">
        <SupplierPaymentDraftForm state={state} createCommand={createCommand} isPending={isPending} />
      </div>
    </div>
  );
}


export function SupplierPaymentDraftForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const suppliers = getSelectableSuppliers(state, actor);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<{ supplierId: string; amount: number }>({
    defaultValues: { supplierId: suppliers[0]?.id ?? "", amount: 0 }
  });
  const disabled = isPending || suppliers.length === 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Tạo phiếu chi NCC</h3>
          <p className="panel-note">Phiếu nháp chưa làm giảm phải trả cho đến khi xác nhận.</p>
        </div>
      </div>
      <div className="panel-body">
        <form
          className="command-form"
          noValidate
          onSubmit={handleSubmit((values) => {
            createCommand(
              { type: "createSupplierPaymentDraft", supplierId: values.supplierId, amount: values.amount },
              () => reset({ supplierId: values.supplierId, amount: 0 })
            );
          })}
        >
          <FormField label="Nhà cung cấp">
            <select className="input" {...register("supplierId", { required: true })}>
              {suppliers.length === 0 ? <option value="" disabled>Không có nhà cung cấp trong phạm vi</option> : null}
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} · {supplier.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Số tiền chi" error={errors.amount?.message}>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              {...register("amount", {
                valueAsNumber: true,
                min: { value: 1, message: "Số tiền chi phải lớn hơn 0." }
              })}
            />
          </FormField>
          <SubmitButton label="Tạo phiếu chi" command="createSupplierPaymentDraft" isPending={isPending} disabled={disabled} />
        </form>
      </div>
    </section>
  );
}


