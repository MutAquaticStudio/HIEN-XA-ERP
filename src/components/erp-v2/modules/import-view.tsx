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

export function ImportView({
  state,
  runOperation,
  createCommand,
  importWorkbook,
  isPending
}: {
  state: OperationsState;
  runOperation: OperationHandler;
  createCommand: CreateCommandHandler;
  importWorkbook: WorkbookImportHandler;
  isPending: boolean;
}) {
  return (
    <div className="workbench-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Vấn đề cần kiểm tra trước import</h3>
            <p className="panel-note">Không import cột tổng/còn lại như nguồn sự thật.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Workbook", "SHA-256", "Trang giao dịch", "Số dòng", "Còn mở / Tổng", "Trạng thái", "Thời điểm"]}
            rows={state.importJobs.map((job) => {
              const openIssues = state.importIssues.filter((issue) => issue.importJobId === job.id && issue.status === "open").length;
              return [
                job.fileName,
                <code key="hash">{job.fileHash.slice(0, 12)}…</code>,
                job.sheetNames.join(", "),
                job.rowCount.toString(),
                `${openIssues} / ${job.issueCount}`,
                job.status === "dry_run" ? "Chờ rà soát" : "Đã rà soát",
                formatDateTime(job.createdAt)
              ];
            })}
            emptyText="Chưa có workbook nào được chạy thử."
          />
          <h4 className="section-heading">Vấn đề cần xử lý</h4>
          <DataTable
            headers={["Batch", "Trang tính", "Dòng", "Mức", "Vấn đề", "Trạng thái", "Hành động"]}
            rows={state.importIssues.map((issue) => [
              state.importJobs.find((job) => job.id === issue.importJobId)?.fileName ?? "Thủ công",
              issue.sourceSheet,
              issue.rowNumber.toString(),
              issue.severity === "error" ? "Lỗi" : "Cảnh báo",
              issue.message,
              statusText(issue.status),
              issue.status === "open" ? (
                <div key="actions" className="table-actions">
                  <WorkflowActionButton operation="resolveImportIssue" state={state} runOperation={runOperation} isPending={isPending} label="Xử lý" targetId={issue.id} />
                  <WorkflowActionButton operation="ignoreImportIssue" state={state} runOperation={runOperation} isPending={isPending} label="Bỏ qua" targetId={issue.id} />
                </div>
              ) : (
                <span key="done" className="muted">{statusText(issue.status)}</span>
              )
            ])}
          />
        </div>
      </section>
      <div className="side-stack">
        <ImportWorkbookForm importWorkbook={importWorkbook} isPending={isPending} />
        <ImportIssueForm createCommand={createCommand} isPending={isPending} />
      </div>
    </div>
  );
}

export function ImportWorkbookForm({ importWorkbook, isPending }: { importWorkbook: WorkbookImportHandler; isPending: boolean }) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Chạy thử workbook</h3>
          <p className="panel-note">Tệp Excel .xlsx tối đa 40 MB. Chạy kiểm tra chỉ tạo một đợt đối soát và danh sách lỗi, chưa ghi giao dịch.</p>
        </div>
      </div>
      <div className="panel-body">
        <form className="command-form" onSubmit={(event) => {
          event.preventDefault();
          if (file) {
            importWorkbook(file);
          }
        }}>
          <FormField label="Workbook Excel">
            <input className="input file-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </FormField>
          {file ? <p className="panel-note">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p> : null}
          <SubmitButton label="Chạy thử import" command="createImportDryRun" isPending={isPending} disabled={isPending || !file} />
        </form>
      </div>
    </section>
  );
}


export function ImportIssueForm({
  createCommand,
  isPending
}: {
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<{ sourceSheet: string; rowNumber: number; severity: "warning" | "error"; message: string }>({
    defaultValues: { sourceSheet: "", rowNumber: 1, severity: "warning", message: "" }
  });

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Tạo vấn đề import</h3>
          <p className="panel-note">Dòng nghi ngờ phải được review trước khi nhập chính thức.</p>
        </div>
      </div>
      <div className="panel-body">
        <form
          className="command-form"
          noValidate
          onSubmit={handleSubmit((values) => {
            createCommand({
              type: "createImportIssue",
              sourceSheet: values.sourceSheet,
              rowNumber: values.rowNumber,
              severity: values.severity,
              message: values.message
            });
            reset({ sourceSheet: values.sourceSheet, rowNumber: values.rowNumber + 1, severity: values.severity, message: "" });
          })}
        >
          <FormField label="Trang tính" error={errors.sourceSheet?.message}>
            <input className="input" {...register("sourceSheet", { required: "Nhập tên trang tính." })} />
          </FormField>
          <FormField label="Dòng" error={errors.rowNumber?.message}>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              {...register("rowNumber", {
                valueAsNumber: true,
                min: { value: 1, message: "Số dòng phải lớn hơn 0." }
              })}
            />
          </FormField>
          <FormField label="Mức">
            <select className="input" {...register("severity")}>
              <option value="warning">Cảnh báo</option>
              <option value="error">Lỗi</option>
            </select>
          </FormField>
          <FormField label="Vấn đề" error={errors.message?.message}>
            <textarea className="input textarea" rows={3} {...register("message", { required: "Nhập nội dung vấn đề." })} />
          </FormField>
          <SubmitButton label="Tạo vấn đề" command="createImportIssue" isPending={isPending} />
        </form>
      </div>
    </section>
  );
}


