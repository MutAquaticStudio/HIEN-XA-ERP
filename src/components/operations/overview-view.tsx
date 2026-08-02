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
  operationsByModule,
  operationsErpRegistry,
  operationsOdooMetadata,
  type OperationsModuleId
} from "@/modules/operations/erp-registry";
import type { CreateCommand, DomainCommandName, OperationName, OperationOptions, OperationsActor, OperationsAttachment, OperationResult, OperationsSnapshot, OperationsState, PurchaseOrderLine, SalesOrderLine } from "@/modules/operations/types";
import { OperationsActorContext, type CreateCommandHandler, type OperationHandler, type SyncMeta, type WorkbookImportHandler } from './operations-contract';
import {
  WorkflowPanel,
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


export function OverviewView({
  state,
  syncMeta,
  activeRole,
  canViewAudit
}: {
  state: OperationsState;
  syncMeta: SyncMeta;
  activeRole: DashboardRoleId;
  canViewAudit: boolean;
}) {
  return (
    <div className="dashboard-grid">
      <RoleDashboardPanel state={state} activeRole={activeRole} syncMeta={syncMeta} />

      {canViewAudit ? <section className="panel span-12">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Nhật ký hoạt động web</h3>
            <p className="panel-note">Hiển thị thay đổi mới nhất do người dùng thực hiện. Mở mục Audit để xem toàn bộ lịch sử.</p>
          </div>
        </div>
        <AuditList state={state} limit={5} />
      </section> : null}
    </div>
  );
}

export function RoleDashboardPanel({
  state,
  activeRole,
  syncMeta
}: {
  state: OperationsState;
  activeRole: DashboardRoleId;
  syncMeta: SyncMeta;
}) {
  const dashboard = useMemo(() => createRoleDashboard(state, activeRole), [state, activeRole]);

  return (
    <section className="panel span-12 role-dashboard-panel" data-testid="role-dashboard-panel" data-role={dashboard.role}>
      <div className="panel-header">
        <div>
          <p className="dashboard-eyebrow">Hôm nay cần theo dõi</p>
          <h3 className="panel-title">Bảng điều khiển của {dashboard.label}</h3>
          <p className="panel-note">{dashboard.headline}</p>
        </div>
        <span className="status status-core-ready">Realtime</span>
      </div>
      <div className="panel-body">
        <div className="dashboard-priority-bar">
          <RealtimeStatus syncMeta={syncMeta} />
          <p className="role-privacy-note">{dashboard.privacyNote}</p>
        </div>
        <div className="dashboard-metrics">
          {dashboard.metrics.map((metric) => (
            <Metric key={metric.id} label={metric.label} value={formatRoleMetricValue(metric)} metricId={metric.id} />
          ))}
        </div>
        <div className="dashboard-task-heading">
          <div>
            <h4>Việc cần xử lý</h4>
            <p>Làm những việc có cảnh báo trước, sau đó mới xem các chi tiết khác.</p>
          </div>
        </div>
        <DataTable
          headers={["Việc cần làm", "Số lượng", "Trạng thái", "Ghi chú"]}
          rows={dashboard.tasks.map((item) => [
            item.label,
            item.count.toString(),
            <span className={taskStatusClassName(item)} key={`${item.id}-status`}>
              {taskStatusText(item)}
            </span>,
            item.detail
          ])}
          emptyText="Vai trò này chưa có việc cần xử lý."
        />
      </div>
    </section>
  );
}

export function RealtimeStatus({ syncMeta }: { syncMeta: SyncMeta }) {
  const statusClassName =
    syncMeta.status === "live"
      ? "status status-core-ready"
      : syncMeta.status === "syncing"
        ? "status status-hardening-required"
        : "status status-draft";
  const statusTextValue =
    syncMeta.status === "live" ? "Đang cập nhật" : syncMeta.status === "syncing" ? "Đang đồng bộ" : "Mất kết nối";

  return (
    <div className="realtime-strip" aria-live="polite">
      <span className={statusClassName}>{statusTextValue}</span>
      <span>
        Cập nhật {formatDateTime(syncMeta.syncedAt)} · phiên bản {syncMeta.revision}
      </span>
      {syncMeta.error ? <span className="realtime-error">{syncMeta.error}</span> : null}
    </div>
  );
}

export function OdooActionBar({
  action,
  searchEnabled,
  searchTerm,
  onSearchTermChange
}: {
  action: (typeof operationsOdooMetadata.actions)[number] | undefined;
  searchEnabled: boolean;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}) {
  if (!action) {
    return null;
  }

  return (
    <div className="odoo-actionbar" aria-label="Thanh thao tác">
      <div className="odoo-breadcrumb">
        <span>VLXD</span>
        <span>/</span>
        <strong>{action.name}</strong>
      </div>
      {searchEnabled ? (
        <label className="odoo-search">
          <span>Tìm kiếm</span>
          <input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Tên, mã, điện thoại..."
          />
        </label>
      ) : null}
    </div>
  );
}

