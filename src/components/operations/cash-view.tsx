"use client";

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

export function CashView({
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
  const cashIn = state.cashTransactions.filter((entry) => entry.direction === "in").reduce((sum, entry) => sum + entry.amount, 0);
  const cashOut = state.cashTransactions.filter((entry) => entry.direction === "out").reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <div className="workbench-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Sổ quỹ tiền mặt</h3>
            <p className="panel-note">Số dư chỉ tính từ giao dịch quỹ đã xác nhận và bút toán đảo.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="summary-grid">
            <SummaryItem label="Tổng thu" value={formatMoney(cashIn)} />
            <SummaryItem label="Tổng chi" value={formatMoney(cashOut)} />
            <SummaryItem label="Tồn quỹ" value={formatMoney(cashBalance(state))} />
            <SummaryItem label="Số giao dịch" value={state.cashTransactions.length.toString()} />
          </div>
          <DataTable
            headers={["Tài khoản", "Chứng từ", "Thu", "Chi", "Thời điểm"]}
            rows={state.cashTransactions.map((entry) => [
              entry.accountName,
              entry.sourceDocument,
              entry.direction === "in" ? formatMoney(entry.amount) : "",
              entry.direction === "out" ? formatMoney(entry.amount) : "",
              formatDateTime(entry.postedAt)
            ])}
            emptyText="Chưa có giao dịch quỹ. Xác nhận phiếu thu/chi để phát sinh."
          />
          <h4 className="section-heading">Phiếu thu/chi nội bộ</h4>
          <DataTable
            headers={["Phiếu", "Loại", "Nhóm", "Diễn giải", "Số tiền", "Trạng thái", "Hành động"]}
            rows={state.cashVouchers.map((voucher) => [
              voucher.documentNo,
              voucher.direction === "in" ? "Phiếu thu" : "Phiếu chi",
              voucher.category,
              voucher.description,
              formatMoney(voucher.amount),
              statusText(voucher.status),
              voucher.status === "draft" ? (
                <WorkflowActionButton key="confirm" operation="confirmCashVoucher" state={state} runOperation={runOperation} isPending={isPending} label="Xác nhận" targetId={voucher.id} />
              ) : voucher.status === "confirmed" ? (
                <WorkflowActionButton key="reverse" operation="reverseCashVoucher" state={state} runOperation={runOperation} isPending={isPending} label="Đảo phiếu" targetId={voucher.id} />
              ) : (
                <span key="reversed" className="muted">Đã đảo</span>
              )
            ])}
            emptyText="Chưa có phiếu thu/chi nội bộ."
          />
        </div>
      </section>
      <div className="side-stack">
        <CashVoucherDraftForm createCommand={createCommand} isPending={isPending} />
      </div>
    </div>
  );
}

export function CashVoucherDraftForm({ createCommand, isPending }: { createCommand: CreateCommandHandler; isPending: boolean }) {
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<{
    direction: "in" | "out";
    category: string;
    description: string;
    amount: number;
  }>({
    defaultValues: { direction: "in", category: "Thu khác", description: "", amount: 0 }
  });
  const direction = watch("direction");

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Tạo phiếu quỹ</h3>
          <p className="panel-note">Phiếu nháp chưa làm thay đổi số dư cho đến khi xác nhận.</p>
        </div>
      </div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => {
          createCommand({ type: "createCashVoucherDraft", ...values });
          reset({ direction: values.direction, category: values.category, description: "", amount: 0 });
        })}>
          <FormField label="Loại phiếu">
            <select className="input" {...register("direction")}>
              <option value="in">Phiếu thu</option>
              <option value="out">Phiếu chi</option>
            </select>
          </FormField>
          <FormField label="Nhóm thu chi" error={errors.category?.message}>
            <input className="input" {...register("category", { required: "Nhập nhóm thu chi." })} />
          </FormField>
          <FormField label="Diễn giải" error={errors.description?.message}>
            <textarea className="input" rows={3} {...register("description", { required: "Nhập diễn giải." })} />
          </FormField>
          <FormField label="Số tiền" error={errors.amount?.message}>
            <input className="input" type="number" min="1" step="1000" {...register("amount", {
              valueAsNumber: true,
              min: { value: 1, message: "Số tiền phải lớn hơn 0." }
            })} />
          </FormField>
          <SubmitButton label={`Tạo ${direction === "in" ? "phiếu thu" : "phiếu chi"}`} command="createCashVoucherDraft" isPending={isPending} />
        </form>
      </div>
    </section>
  );
}

