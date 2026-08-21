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
  getDefaultReportMonth,
  getMonthDateRange
} from "@/modules/operations/monthly-report";
import { accountingExportDatasets, createAccountingXlsxExport, type AccountingExportDatasetId } from "@/modules/operations/accounting-export";
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
import { AuditList } from './audit-view';


export function ReportingView({ state }: { state: OperationsState }) {
  const customer = state.customers[0];
  const availableMonths = useMemo(() => getAvailableReportMonths(state), [state]);
  const [reportMonth, setReportMonth] = useState(() => getDefaultReportMonth(state));
  const [fromDate, setFromDate] = useState(() => getMonthDateRange(getDefaultReportMonth(state)).fromDate);
  const [toDate, setToDate] = useState(() => getMonthDateRange(getDefaultReportMonth(state)).toDate);
  const [datasetIds, setDatasetIds] = useState<AccountingExportDatasetId[]>(() => accountingExportDatasets.map((dataset) => dataset.id));
  const [exportError, setExportError] = useState<string | null>(null);
  const monthlyReport = useMemo(() => createMonthlyReport(state, reportMonth), [state, reportMonth]);

  function exportMonthlyReport() {
    const report = createMonthlyReport(state, reportMonth, new Date().toISOString());
    const reportPackage = createMonthlyReportExportPackage(report);
    const reportBuffer = reportPackage.bytes.buffer.slice(
      reportPackage.bytes.byteOffset,
      reportPackage.bytes.byteOffset + reportPackage.bytes.byteLength
    ) as ArrayBuffer;
    downloadReportFile(reportPackage.fileName, reportBuffer, reportPackage.mediaType);
  }

  function downloadReportFile(fileName: string, content: BlobPart, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportAccountingData() {
    try {
      const exportFile = createAccountingXlsxExport(state, { fromDate, toDate, datasetIds, generatedAt: new Date().toISOString() });
      const buffer = exportFile.bytes.buffer.slice(exportFile.bytes.byteOffset, exportFile.bytes.byteOffset + exportFile.bytes.byteLength) as ArrayBuffer;
      downloadReportFile(exportFile.fileName, buffer, exportFile.mediaType);
      setExportError(null);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Không thể xuất dữ liệu kế toán.");
    }
  }

  function toggleDataset(datasetId: AccountingExportDatasetId, checked: boolean) {
    setDatasetIds((current) => checked ? [...new Set([...current, datasetId])] : current.filter((item) => item !== datasetId));
  }

  return (
    <div className="dashboard-grid">
      <section className="panel span-12">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Xuất dữ liệu kế toán</h3>
            <p className="panel-note">Tệp XLSX chỉ đọc, lấy trực tiếp từ sổ công nợ, quỹ, phát sinh kho và sổ tiền công; không ghi dữ liệu mới.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="report-export-grid">
            <FormField label="Từ ngày">
              <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </FormField>
            <FormField label="Đến ngày">
              <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </FormField>
            <div className="form-field">
              <span className="form-label">Bộ dữ liệu / sheet</span>
              <div className="checkbox-group" role="group" aria-label="Chọn bộ dữ liệu xuất Excel">
                {accountingExportDatasets.map((dataset) => <label key={dataset.id} className="checkbox-label"><input type="checkbox" checked={datasetIds.includes(dataset.id)} onChange={(event) => toggleDataset(dataset.id, event.target.checked)} /> {dataset.label}</label>)}
              </div>
            </div>
            <button className="button button-primary report-export-button" data-testid="accounting-xlsx-export" type="button" onClick={exportAccountingData} disabled={datasetIds.length === 0}>
              <FileSpreadsheet aria-hidden="true" />
              Xuất XLSX dữ liệu kế toán
            </button>
            {exportError ? <p className="field-error" role="alert">{exportError}</p> : null}
          </div>
        </div>
      </section>
      <section className="panel span-12">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Gói báo cáo tháng</h3>
            <p className="panel-note">Gói ZIP hiện có được giữ để đối soát báo cáo tháng gồm CSV, dashboard HTML và manifest.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="report-export-grid">
            <FormField label="Tháng báo cáo">
              <input
                className="input"
                type="month"
                list="report-month-options"
                value={reportMonth}
                onChange={(event) => setReportMonth(event.target.value || getDefaultReportMonth(state))}
              />
              <datalist id="report-month-options">
                {availableMonths.map((month) => (
                  <option value={month} key={month} />
                ))}
              </datalist>
            </FormField>
            <button className="button button-primary report-export-button" data-testid="monthly-report-export" type="button" onClick={exportMonthlyReport}>
              <Download aria-hidden="true" />
              Xuất gói báo cáo tháng {monthlyReport.monthLabel}
            </button>
          </div>
          <div className="summary-grid report-summary-grid">
            <SummaryItem label="Doanh thu trước VAT" value={formatMoney(monthlyReport.summary.salesNet)} />
            <SummaryItem label="Giá vốn" value={formatMoney(monthlyReport.summary.costOfGoodsSold)} />
            <SummaryItem label="Lãi gộp" value={formatMoney(monthlyReport.summary.grossProfit)} />
            <SummaryItem label="Tỷ suất lãi gộp" value={`${(monthlyReport.summary.grossMarginRate * 100).toFixed(2)}%`} />
            <SummaryItem label="Đã thu" value={formatMoney(monthlyReport.summary.customerCredit)} />
            <SummaryItem label="Đã chi quỹ" value={formatMoney(monthlyReport.summary.cashOut)} />
            <SummaryItem label="Tiền công phát sinh" value={formatMoney(monthlyReport.summary.employeeCompensation)} />
          </div>
        </div>
      </section>
      <section className="panel span-4">
        <div className="panel-body metric-stack">
          <Metric label="Doanh thu đã ghi nhận" value={formatMoney(monthlyReport.summary.salesGross)} />
          <Metric label="Phải thu khách" value={formatMoney(customer ? customerBalance(state.customerLedgerEntries, customer.id) : 0)} />
          <Metric label="Quỹ tiền mặt" value={formatMoney(cashBalance(state))} />
        </div>
      </section>
      <section className="panel span-8">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Nguồn số liệu báo cáo</h3>
            <p className="panel-note">Mỗi dòng đều truy ngược được về chứng từ nguồn.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Nhóm", "Nguồn", "Số dòng", "Ghi chú"]}
            rows={[
              ["Công nợ KH", "Sổ công nợ khách hàng", state.customerLedgerEntries.length.toString(), "Phải thu trừ đã thu"],
              ["Công nợ NCC", "Sổ công nợ nhà cung cấp", state.supplierLedgerEntries.length.toString(), "Phải trả trừ đã chi"],
              ["Kho", "Phát sinh kho", state.inventoryMovements.length.toString(), "Phát sinh kho chỉ ghi thêm"],
              ["Dòng tiền", "Sổ quỹ", state.cashTransactions.length.toString(), "Phiếu thu/chi đã xác nhận"],
              ["Tiền công", "Sổ tiền công nhân viên", state.employeeLedgerEntries.length.toString(), "Chỉ từ sản lượng đã duyệt"]
            ]}
          />
        </div>
      </section>
      <section className="panel span-12">
        <AuditList state={state} />
      </section>
    </div>
  );
}

