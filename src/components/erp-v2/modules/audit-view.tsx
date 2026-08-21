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

export function AuditView({ state }: { state: OperationsState }) {
  const [query, setQuery] = useState("");
  const [actorFilter, setActorFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedAuditId, setSelectedAuditId] = useState<string>();
  const integrity = useMemo(() => createAuditIntegrityReport(state), [state]);
  const actors = useMemo(() => Array.from(new Set(state.auditLogs.map((event) => event.actorName))).sort(), [state.auditLogs]);
  const actions = useMemo(() => Array.from(new Set(state.auditLogs.map((event) => event.action))).sort(), [state.auditLogs]);
  const filteredLogs = useMemo(() => state.auditLogs.filter((event) => {
    const occurredAt = new Date(event.occurredAt).getTime();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return (actorFilter === "all" || event.actorName === actorFilter) &&
      (actionFilter === "all" || event.action === actionFilter) &&
      occurredAt >= fromTime && occurredAt <= toTime &&
      filterRows([event], query, (item) => [displayActivityActorName(item.actorName), item.action, item.permission, item.targetId, item.reason, item.correlationId, repairActivityText(item.summary)]).length > 0;
  }), [state.auditLogs, actorFilter, actionFilter, dateFrom, dateTo, query]);
  const selectedAudit = state.auditLogs.find((event) => event.id === selectedAuditId);
  const errorCount = integrity.issues.filter((item) => item.severity === "error").length;
  const warningCount = integrity.issues.filter((item) => item.severity === "warning").length;

  function exportAudit() {
    downloadTextFile(`nhat-ky-kiem-toan-${localDateValue()}.csv`, createAuditLogCsv(filteredLogs));
  }

  return (
    <div className="dashboard-grid">
      <section className="panel span-12">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Kiểm tra tính đầy đủ của nhật ký hoạt động</h3>
            <p className="panel-note">Đối chiếu command đã xử lý, mã idempotency, quyền, ảnh chụp trước/sau và lý do đảo chứng từ.</p>
          </div>
          <span className={integrity.status === "healthy" ? "status status-confirmed" : "status status-danger"}>
            {integrity.status === "healthy" ? "Toàn vẹn" : "Cần kiểm tra"}
          </span>
        </div>
        <div className="panel-body">
          <div className="summary-grid">
            <SummaryItem label="Tổng sự kiện" value={String(integrity.auditCount)} />
            <SummaryItem label="Có mã liên kết" value={String(integrity.correlatedCount)} />
            <SummaryItem label="Sự kiện đảo" value={String(integrity.reversalCount)} />
            <SummaryItem label="Lỗi / cảnh báo" value={`${errorCount} / ${warningCount}`} />
          </div>
          {integrity.issues.length > 0 ? (
            <ul className="audit-integrity-list">
              {integrity.issues.map((item, index) => (
                <li key={`${item.code}-${item.auditId ?? index}`} className={item.severity === "error" ? "audit-integrity-error" : "audit-integrity-warning"}>
                  <strong>{item.severity === "error" ? "Lỗi" : "Cảnh báo"}</strong> · {item.message}
                </li>
              ))}
            </ul>
          ) : <p className="integrity-ok"><CheckCircle2 aria-hidden="true" /> Mọi command đã xử lý đều có audit trail tương ứng.</p>}
        </div>
      </section>

      <section className="panel span-12">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Nhật ký hoạt động</h3>
            <p className="panel-note">Đang hiển thị {filteredLogs.length} / {state.auditLogs.length} thay đổi từ web app.</p>
          </div>
          <button className="button button-small" type="button" onClick={exportAudit} disabled={filteredLogs.length === 0}>
            <Download aria-hidden="true" /> Xuất CSV
          </button>
        </div>
        <div className="panel-body">
          <div className="audit-filter-grid">
            <FormField label="Tìm kiếm">
              <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Thao tác, chứng từ, lý do..." />
            </FormField>
            <FormField label="Người thao tác">
              <select className="input" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
                <option value="all">Tất cả</option>
                {actors.map((actor) => <option key={actor} value={actor}>{actor}</option>)}
              </select>
            </FormField>
            <FormField label="Thao tác">
              <select className="input" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                <option value="all">Tất cả</option>
                {actions.map((action) => <option key={action} value={action}>{action}</option>)}
              </select>
            </FormField>
            <FormField label="Từ ngày">
              <input className="input" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </FormField>
            <FormField label="Đến ngày">
              <input className="input" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </FormField>
          </div>
          <DataTable
            className="audit-data-table"
            headers={["Thời điểm", "Người thao tác", "Thao tác", "Chứng từ liên quan", "Mã liên kết", "Tóm tắt", "Chi tiết"]}
            rows={filteredLogs.map((event) => [
              formatDateTime(event.occurredAt),
              displayActivityActorName(event.actorName),
              event.action,
              event.targetId ?? "-",
              event.correlationId?.slice(0, 12) ?? "-",
              repairActivityText(event.summary),
              <button key="view" className="button button-small" type="button" onClick={() => setSelectedAuditId(event.id)}>Xem</button>
            ])}
            emptyText="Chưa có nhật ký kiểm toán."
          />
        </div>
      </section>
      {selectedAudit ? (
        <section className="panel span-12">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Chi tiết {selectedAudit.action}</h3>
              <p className="panel-note">{displayActivityActorName(selectedAudit.actorName)} · {formatDateTime(selectedAudit.occurredAt)} · {selectedAudit.permission ?? "Không có quyền nguồn"}</p>
            </div>
            <button className="button button-small" type="button" onClick={() => setSelectedAuditId(undefined)}>Đóng</button>
          </div>
          <div className="panel-body audit-detail-grid">
            <dl className="audit-metadata">
              <div><dt>Chứng từ đích</dt><dd>{selectedAudit.targetId ?? "-"}</dd></div>
              <div><dt>Mã liên kết</dt><dd>{selectedAudit.correlationId ?? "-"}</dd></div>
              <div><dt>Lý do</dt><dd>{selectedAudit.reason ?? "-"}</dd></div>
              <div><dt>Kết quả</dt><dd>{repairActivityText(selectedAudit.summary)}</dd></div>
            </dl>
            <div>
              <h4 className="section-heading">Trước thao tác</h4>
              <pre className="audit-json">{JSON.stringify(selectedAudit.before ?? {}, null, 2)}</pre>
            </div>
            <div>
              <h4 className="section-heading">Sau thao tác</h4>
              <pre className="audit-json">{JSON.stringify(selectedAudit.after ?? {}, null, 2)}</pre>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}


const windows1252ByteOverrides: Record<string, string> = {
  "€": "\u0080", "‚": "\u0082", "ƒ": "\u0083", "„": "\u0084", "…": "\u0085", "†": "\u0086", "‡": "\u0087",
  "ˆ": "\u0088", "‰": "\u0089", "Š": "\u008a", "‹": "\u008b", "Œ": "\u008c", "Ž": "\u008e", "‘": "\u0091",
  "’": "\u0092", "“": "\u0093", "”": "\u0094", "•": "\u0095", "–": "\u0096", "—": "\u0097", "˜": "\u0098",
  "™": "\u0099", "š": "\u009a", "›": "\u009b", "œ": "\u009c", "ž": "\u009e", "Ÿ": "\u009f"
};

const legacyActivityRun = /[\u0080-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]+/gu;

export function repairActivityText(value: string) {
  return value.replace(legacyActivityRun, (run) => {
    const looksCorrupted = /[\u0080-\u009fÃÂÆÄ]|[àáâ][\u0080-\u00bf]/u.test(run);
    if (!looksCorrupted) return run;

    let repaired = run;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const byteLikeText = repaired.replace(/[€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/gu, (character) => windows1252ByteOverrides[character] ?? character);
        const next = decodeURIComponent(escape(byteLikeText)).normalize("NFC");
        if (next.includes("�") || next === repaired) break;
        repaired = next;
      } catch {
        break;
      }
    }
    return repaired;
  });
}

export function displayActivityActorName(value: string) {
  return value === "Chu cua hang" ? "Chủ cửa hàng" : repairActivityText(value);
}

export function AuditList({ state, limit = 5 }: { state: OperationsState; limit?: number }) {
  const recentEvents = state.auditLogs.slice(0, limit);

  return (
    <div className="panel-body activity-log-panel">
      <p className="activity-log-caption">{recentEvents.length === 0 ? "Chưa có thay đổi nào được ghi nhận." : `Hiển thị ${recentEvents.length} thay đổi mới nhất.`}</p>
      <ul className="audit-list activity-log-list">
        {recentEvents.map((event) => (
          <li className="audit-item" key={event.id}>
            <p className="audit-title" title={repairActivityText(event.summary)}>{repairActivityText(event.summary)}</p>
            <p className="audit-text">
              {displayActivityActorName(event.actorName)} · {formatDateTime(event.occurredAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}


