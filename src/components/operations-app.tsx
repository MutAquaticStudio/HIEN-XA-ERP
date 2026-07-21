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
  submitGoodsReceiptWithImageAction
} from "@/app/actions";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
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

type OperationsAppProps = {
  initialState: OperationsState;
  initialRevision: number;
  initialSyncedAt: string;
  initialActor: OperationsActor;
  visibleModuleIds: OperationsModuleId[];
  currentUser: {
    displayName: string;
    accountName: string;
    roleLabel: string;
    canManageUsers: boolean;
  };
};

type CreateCommandHandler = (command: CreateCommand, onSuccess?: () => void, attachment?: File) => void;
type OperationHandler = (
  operation: OperationName,
  targetId?: string,
  options?: OperationOptions,
  onSuccess?: () => void,
  attachment?: File
) => void;
type WorkbookImportHandler = (file: File) => void;
type SyncStatus = "live" | "syncing" | "error";
type SyncMeta = {
  revision: number;
  syncedAt: string;
  status: SyncStatus;
  error?: string;
};
type MutatingServerResult = OperationResult & Pick<OperationsSnapshot, "revision" | "syncedAt" | "source">;

type ModuleId = OperationsModuleId;

const modules = operationsErpRegistry.navigation;
const realtimeSyncIntervalMs = 3000;
const OperationsActorContext = createContext<OperationsActor>({
  id: "uninitialized",
  displayName: "Chưa đăng nhập",
  role: "viewer",
  permissions: []
});

const moduleIcons: Record<string, typeof Home> = {
  boxes: Boxes,
  "clipboard-check": ClipboardCheck,
  database: Database,
  "file-spreadsheet": FileSpreadsheet,
  "hand-coins": HandCoins,
  home: Home,
  "shopping-cart": ShoppingCart,
  truck: Truck,
  users: Users,
  "wallet-cards": WalletCards,
  warehouse: Warehouse
};

export function OperationsApp({
  initialState,
  initialRevision,
  initialSyncedAt,
  initialActor,
  visibleModuleIds,
  currentUser
}: OperationsAppProps) {
  const [state, setState] = useState(initialState);
  const [activeModule, setActiveModule] = useState<ModuleId>("overview");
  const activeDashboardRole = dashboardRoleForActor(initialActor.role);
  const activeActorRole = initialActor.role;
  const [searchTerm, setSearchTerm] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);
  const [syncMeta, setSyncMeta] = useState<SyncMeta>({
    revision: initialRevision,
    syncedAt: initialSyncedAt,
    status: "live"
  });
  const [isPending, startTransition] = useTransition();
  const syncMetaRef = useRef(syncMeta);
  const isPendingRef = useRef(isPending);
  const activeActor = initialActor;
  const visibleModules = useMemo(() => {
    const allowedModuleIds = new Set(visibleModuleIds);
    return modules.filter((module) => allowedModuleIds.has(module.id));
  }, [visibleModuleIds]);

  useEffect(() => {
    syncMetaRef.current = syncMeta;
  }, [syncMeta]);

  useEffect(() => {
    isPendingRef.current = isPending;
  }, [isPending]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // PWA cache is a read-only convenience; operational posting must still work online without it.
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function syncDashboard() {
      if (inFlight || isPendingRef.current) {
        return;
      }

      inFlight = true;
      setSyncMeta((current) => ({ ...current, status: "syncing", error: undefined }));

      try {
        const snapshot = await getOperationsSnapshotAction();
        if (cancelled) {
          return;
        }

        if (snapshot.revision !== syncMetaRef.current.revision) {
          setState(snapshot.state);
        }

        setSyncMeta({
          revision: snapshot.revision,
          syncedAt: snapshot.syncedAt,
          status: "live"
        });
      } catch (error) {
        if (!cancelled) {
          setSyncMeta((current) => ({
            ...current,
            status: "error",
            error: error instanceof Error ? error.message : "Không thể đồng bộ bảng điều khiển."
          }));
        }
      } finally {
        inFlight = false;
      }
    }

    const intervalId = window.setInterval(syncDashboard, realtimeSyncIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const title = modules.find((module) => module.id === activeModule) ?? modules[0];
  const activeOdooAction = operationsOdooMetadata.actionByModuleId.get(activeModule);

  function applyMutationResult(result: MutatingServerResult) {
    setState(result.state);
    setSyncMeta({
      revision: result.revision,
      syncedAt: result.syncedAt,
      status: "live"
    });
  }

  function runOperation(
    operation: OperationName,
    targetId?: string,
    options?: OperationOptions,
    onSuccess?: () => void,
    attachment?: File
  ) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = operation === "submitGoodsReceipt" && attachment
          ? await (() => {
              const formData = new FormData();
              formData.set("targetId", targetId ?? "");
              formData.set("quantity", String(options?.quantity ?? ""));
              formData.set("receiptImage", attachment);
              return submitGoodsReceiptWithImageAction(formData);
            })()
          : await runDemoOperationAction({
              operation,
              targetId,
              options,
              idempotencyKey: crypto.randomUUID()
            });
        if (!response.ok) {
          setFeedback({ type: "error", text: response.error });
          return;
        }
        const result = response.result;
        applyMutationResult(result);
        setFeedback({ type: result.severity, text: result.summary });
        onSuccess?.();
      } catch (error) {
        setFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Không thể thực hiện thao tác."
        });
      }
    });
  }

  function runCreateCommand(command: CreateCommand, onSuccess?: () => void, attachment?: File) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = await (attachment && (command.type === "createSalesOrderDraft" || command.type === "createPurchaseOrderDraft")
          ? (() => {
              const formData = new FormData();
              formData.set("command", JSON.stringify(command));
              formData.set("idempotencyKey", crypto.randomUUID());
              formData.set("documentImage", attachment);
              return runDemoCreateCommandWithImageAction(formData);
            })()
          : runDemoCreateCommandAction({
              command,
              idempotencyKey: crypto.randomUUID()
            }));
        if (!response.ok) {
          setFeedback({ type: "error", text: response.error });
          return;
        }
        const result = response.result;
        applyMutationResult(result);
        setFeedback({ type: result.severity, text: result.summary });
        onSuccess?.();
      } catch (error) {
        setFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Không thể tạo dữ liệu mới."
        });
      }
    });
  }

  function runWorkbookDryRun(file: File) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("workbook", file);
        const result = await importWorkbookDryRunAction(formData);
        applyMutationResult(result);
        setFeedback({ type: result.severity, text: result.summary });
      } catch (error) {
        setFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Không thể chạy thử workbook."
        });
      }
    });
  }

  return (
    <OperationsActorContext.Provider value={activeActor}>
    <div className="app-shell">
      <aside className="sidebar" aria-label="Điều hướng chính">
        <div className="brand">
          <div className="brand-mark">HX</div>
          <div>
            <h1 className="brand-title">VLXD Hien Xa</h1>
            <p className="brand-subtitle">ERP vận hành</p>
          </div>
        </div>

        <nav className="nav-list nav-list-compact">
          {visibleModules.map((item) => {
            const Icon = moduleIcons[item.iconKey] ?? Home;
            const isActive = activeModule === item.id;
            return (
              <button
                className={isActive ? "nav-item nav-item-active nav-button" : "nav-item nav-button"}
                type="button"
                key={item.id}
                data-testid={`nav-${item.id}`}
                onClick={() => {
                  setActiveModule(item.id);
                  setSearchTerm("");
                }}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-account">
          <div className="account-summary">
            <span className="account-name">{currentUser.displayName}</span>
            <span className="account-role">{currentUser.roleLabel}</span>
            <span className="account-email">{currentUser.accountName}</span>
          </div>
          {currentUser.canManageUsers ? (
            <Link className="nav-item account-action" href="/admin">
              <ShieldCheck aria-hidden="true" />
              <span>Quản trị người dùng</span>
            </Link>
          ) : null}
          <form action={logoutAction}>
            <button className="nav-item nav-button account-action" type="submit">
              <LogOut aria-hidden="true" />
              <span>Đăng xuất</span>
            </button>
          </form>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h2 className="page-title">{title.title}</h2>
            <p className="page-subtitle">{title.subtitle}</p>
          </div>

        </header>

        <OdooActionBar
          action={activeOdooAction}
          searchEnabled={activeModule === "masterData"}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
        />

        {feedback ? (
          <div className={`feedback feedback-${feedback.type} ops-feedback`} role="status">
            {feedback.type === "error" ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            <span>{feedback.text}</span>
          </div>
        ) : null}

        {activeModule === "overview" ? (
          <OverviewView
            state={state}
            syncMeta={syncMeta}
            activeRole={activeDashboardRole}
            canViewAudit={visibleModuleIds.includes("audit")}
          />
        ) : null}
        {activeModule === "masterData" ? (
          <MasterDataView state={state} createCommand={runCreateCommand} isPending={isPending} searchTerm={searchTerm} />
        ) : null}
        {activeModule === "sales" ? (
          <SalesView state={state} runOperation={runOperation} createCommand={runCreateCommand} isPending={isPending} />
        ) : null}
        {activeModule === "procurement" ? (
          <ProcurementView state={state} runOperation={runOperation} createCommand={runCreateCommand} isPending={isPending} />
        ) : null}
        {activeModule === "delivery" ? (
          <DeliveryView state={state} runOperation={runOperation} createCommand={runCreateCommand} isPending={isPending} />
        ) : null}
        {activeModule === "inventory" ? <InventoryView key={activeActorRole} state={state} runOperation={runOperation} isPending={isPending} /> : null}
        {activeModule === "receivables" ? (
          <ReceivablesView state={state} runOperation={runOperation} createCommand={runCreateCommand} isPending={isPending} />
        ) : null}
        {activeModule === "payables" ? (
          <PayablesView state={state} runOperation={runOperation} createCommand={runCreateCommand} isPending={isPending} />
        ) : null}
        {activeModule === "cash" ? (
          <CashView state={state} runOperation={runOperation} createCommand={runCreateCommand} isPending={isPending} />
        ) : null}
        {activeModule === "workforce" ? (
          <WorkforceView state={state} runOperation={runOperation} createCommand={runCreateCommand} isPending={isPending} />
        ) : null}
        {activeModule === "import" ? (
          <ImportView state={state} runOperation={runOperation} createCommand={runCreateCommand} importWorkbook={runWorkbookDryRun} isPending={isPending} />
        ) : null}
        {activeModule === "audit" ? <AuditView state={state} /> : null}
        {activeModule === "reporting" ? <ReportingView state={state} /> : null}
      </main>
    </div>
    </OperationsActorContext.Provider>
  );
}

function OverviewView({
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
            <h3 className="panel-title">Audit gần nhất</h3>
            <p className="panel-note">Mọi thao tác đổi trạng thái hoặc ghi nhận đều tạo nhật ký kiểm toán.</p>
          </div>
        </div>
        <AuditList state={state} />
      </section> : null}
    </div>
  );
}

function RoleDashboardPanel({
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
    <section className="panel span-12" data-testid="role-dashboard-panel" data-role={dashboard.role}>
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Bảng điều khiển theo vai trò: {dashboard.label}</h3>
          <p className="panel-note">{dashboard.headline}</p>
        </div>
        <span className="status status-core-ready">Realtime</span>
      </div>
      <div className="panel-body">
        <RealtimeStatus syncMeta={syncMeta} />
        <p className="role-privacy-note">{dashboard.privacyNote}</p>
        <div className="dashboard-metrics">
          {dashboard.metrics.map((metric) => (
            <Metric key={metric.id} label={metric.label} value={formatRoleMetricValue(metric)} metricId={metric.id} />
          ))}
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

function RealtimeStatus({ syncMeta }: { syncMeta: SyncMeta }) {
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

function OdooActionBar({
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

function MasterDataView({
  state,
  createCommand,
  isPending,
  searchTerm
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
  searchTerm: string;
}) {
  const customers = filterRows(state.customers, searchTerm, (customer) => [customer.code, customer.displayName, customer.phone]);
  const suppliers = filterRows(state.suppliers, searchTerm, (supplier) => [supplier.code, supplier.displayName, supplier.phone]);
  const productUnits = filterRows(state.productUnits, searchTerm, (product) => [product.productCode, product.productName, product.unitName]);
  const warehouses = filterRows(state.warehouses, searchTerm, (warehouse) => [warehouse.code, warehouse.name]);
  const vehicles = filterRows(state.vehicles, searchTerm, (vehicle) => [vehicle.code, vehicle.plateNumber]);
  const employees = filterRows(state.employees, searchTerm, (employee) => [employee.code, employee.displayName, roleText(employee.roleType)]);

  return (
    <div className="dashboard-grid">
      <CreateMasterDataPanel state={state} createCommand={createCommand} isPending={isPending} />
      <PurchaseUnitSettings state={state} createCommand={createCommand} isPending={isPending} />
      <EntityPanel
        title="Khách hàng"
        rows={customers.map((customer) => [customer.code, customer.displayName, customer.phone, statusText(customer.status)])}
        headers={["Mã", "Tên", "Điện thoại", "Trạng thái"]}
      />
      <EntityPanel
        title="Nhà cung cấp"
        rows={suppliers.map((supplier) => [supplier.code, supplier.displayName, supplier.phone, statusText(supplier.status)])}
        headers={["Mã", "Tên", "Điện thoại", "Trạng thái"]}
      />
      <EntityPanel
        title="Vật tư - đơn vị"
        rows={productUnits.map((product) => [product.productCode, product.productName, product.unitName, statusText(product.status)])}
        headers={["Mã", "Tên vật tư", "Đơn vị tồn kho", "Trạng thái"]}
      />
      <EntityPanel
        title="Kho và bãi"
        rows={warehouses.map((warehouse) => [warehouse.code, warehouse.name, statusText(warehouse.status)])}
        headers={["Mã", "Tên kho/bãi", "Trạng thái"]}
      />
      <EntityPanel
        title="Phương tiện"
        rows={vehicles.map((vehicle) => [vehicle.code, vehicle.plateNumber, `${formatQuantity(vehicle.capacityTons)} tấn`, statusText(vehicle.status)])}
        headers={["Mã xe", "Biển số", "Tải trọng", "Trạng thái"]}
      />
      <EntityPanel
        title="Nhân sự"
        rows={employees.map((employee) => [employee.code, employee.displayName, roleText(employee.roleType), statusText(employee.status)])}
        headers={["Mã", "Tên", "Vai trò", "Trạng thái"]}
      />
    </div>
  );
}

function SalesView({
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
  const order = state.salesOrders[0];
  const totals = salesOrderTotals(order?.lines ?? []);

  return (
    <div className="workbench-grid">
      {order ? <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">{order.documentNo}</h3>
            <p className="panel-note">
              {partyName(state, order.customerId)} · ngày {order.orderDate} · phiên bản {order.version}
            </p>
          </div>
          <StatusBadge value={statusText(order.status)} tone={order.status === "draft" ? "warning" : "success"} />
        </div>
        <div className="panel-body">
          <div className="summary-grid">
            <SummaryItem label="Tổng sau VAT" value={formatMoney(totals.gross)} />
            <SummaryItem label="Trước VAT" value={formatMoney(totals.net)} />
            <SummaryItem label="Đã giao" value={`${order.lines.filter((line) => line.deliveredQuantity >= line.quantity).length}/${order.lines.length} dòng`} />
            <SummaryItem label="Nguồn hàng" value={order.status === "allocated" || order.status.includes("delivered") ? "Đã phân bổ" : "Chưa phân bổ"} />
          </div>
          <DataTable
            headers={["Vật tư", "Số lượng", "Đã giao", "Nguồn", "Thành tiền"]}
            rows={order.lines.map((line) => [
              productLabel(state, line.productUnitId),
              salesLineQuantityText(state, line),
              salesLineQuantityText(state, line, true),
              sourceText(line.sourceType),
              formatMoney(lineTotals(line).gross)
            ])}
          />
          <h4 className="section-heading">Danh sách đơn bán</h4>
          <DataTable
            headers={["Đơn bán", "Khách", "Trạng thái", "Tổng tiền", "Đã giao", "Ảnh", "Hành động"]}
            rows={state.salesOrders.map((salesOrder) => [
              <strong key="document">{salesOrder.documentNo}</strong>,
              partyName(state, salesOrder.customerId),
              <StatusBadge key="status" value={statusText(salesOrder.status)} tone={salesOrder.status === "draft" ? "warning" : "success"} />,
              formatMoney(salesOrderTotals(salesOrder.lines).gross),
              `${salesOrder.lines.filter((line) => line.deliveredQuantity >= line.quantity).length}/${salesOrder.lines.length} dòng`,
              <ApprovalAttachmentPreview key="attachments" attachments={salesOrder.attachments} emptyText="" />,
              salesOrder.status === "draft" ? (
                <WorkflowActionButton key="confirm" operation="confirmSalesOrder" state={state} runOperation={runOperation} isPending={isPending} label="Xác nhận" targetId={salesOrder.id} />
              ) : salesOrder.status === "confirmed" ? (
                <WorkflowActionButton key="allocate" operation="allocateSalesSources" state={state} runOperation={runOperation} isPending={isPending} label="Phân bổ nguồn" targetId={salesOrder.id} />
              ) : (
                <span key="monitor" className="muted">Theo dõi giao</span>
              )
            ])}
          />
        </div>
      </section> : (
        <section className="panel">
          <div className="panel-header"><div><h3 className="panel-title">Đơn bán</h3><p className="panel-note">Chưa có đơn bán.</p></div></div>
          <div className="panel-body"><p className="empty-text">Tạo đơn bán nháp để bắt đầu xử lý.</p></div>
        </section>
      )}
      <div className="side-stack">
        <SalesOrderDraftForm state={state} createCommand={createCommand} isPending={isPending} />
        <WorkflowPanel operations={operationsByModule.sales ?? []} state={state} runOperation={runOperation} isPending={isPending} />
      </div>
    </div>
  );
}

function ProcurementView({
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
  return (
    <div className="workbench-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Đơn mua và điểm nhận</h3>
            <p className="panel-note">Một lần mua có thể chia vào kho hoặc giao thẳng khách.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Đơn mua", "Nhà cung cấp", "Vật tư", "Điểm nhận", "Đã nhận", "Ảnh", "Hành động"]}
            rows={state.purchaseOrders.flatMap((order) =>
              order.lines.map((line) => [
                `${order.documentNo} · ${statusText(order.status)}`,
                partyName(state, order.supplierId),
                productLabel(state, line.productUnitId),
                line.destinationType === "warehouse" ? "Kho cửa hàng" : "Giao thẳng khách",
                purchaseLineProgressText(state, line),
                <ApprovalAttachmentPreview key="attachments" attachments={order.attachments} emptyText="" />,
                order.status === "draft" ? (
                  <WorkflowActionButton key="confirm" operation="confirmPurchaseOrder" state={state} runOperation={runOperation} isPending={isPending} label="Xác nhận đơn" targetId={order.id} />
                ) : line.destinationType === "customer_direct" ? (
                  <div key="direct-actions" className="table-actions">
                    {line.receivedQuantity < line.orderedQuantity ? (
                      <WorkflowActionButton operation="confirmDirectDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Giao thẳng" targetId={line.id} />
                    ) : null}
                    {line.receivedQuantity > 0 ? (
                      <WorkflowActionButton operation="reverseDirectDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Đảo giao" targetId={line.id} />
                    ) : null}
                  </div>
                ) : line.receivedQuantity >= line.orderedQuantity ? (
                  <span key="done" className="muted">Đã nhận đủ</span>
                ) : state.approvalRequests.some((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id) ? (
                  actor.role === "owner" || actor.role === "accountant" ? (
                    <div key="receipt-approval" className="table-actions">
                      <ApprovalAttachmentPreview attachments={state.approvalRequests.find((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id)?.attachments} />
                      <WorkflowActionButton operation="approveGoodsReceipt" state={state} runOperation={runOperation} isPending={isPending} label="Duyệt nhận" targetId={state.approvalRequests.find((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id)?.id} />
                      <WorkflowActionButton operation="rejectGoodsReceipt" state={state} runOperation={runOperation} isPending={isPending} label="Từ chối" targetId={state.approvalRequests.find((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id)?.id} />
                    </div>
                  ) : (
                    <span key="receipt-waiting" className="muted">Chờ Chủ cửa hàng/Kế toán duyệt</span>
                  )
                ) : actor.role === "worker" ? (
                  <WorkflowActionButton key="submit-receipt" operation="submitGoodsReceipt" state={state} runOperation={runOperation} isPending={isPending} label="Gửi duyệt nhận" targetId={line.id} />
                ) : (
                  <WorkflowActionButton key="receipt" operation="postGoodsReceipt" state={state} runOperation={runOperation} isPending={isPending} label="Ghi nhập" targetId={line.id} />
                )
              ])
            )}
          />
        </div>
      </section>
      <div className="side-stack">
        <PurchaseOrderDraftForm state={state} createCommand={createCommand} isPending={isPending} />
        <WorkflowPanel operations={operationsByModule.procurement ?? []} state={state} runOperation={runOperation} isPending={isPending} />
      </div>
    </div>
  );
}

function DeliveryView({
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
  return (
    <div className="workbench-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Chuyến giao hôm nay</h3>
            <p className="panel-note">Tài xế/thợ chỉ thấy thông tin cần để hoàn thành việc.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Chuyến", "Đơn bán", "Tài xế", "Xe", "Phụ xe/thợ", "Trạng thái", "Hành động"]}
            rows={state.deliveryJobs.map((job) => [
              job.documentNo,
              state.salesOrders.find((order) => order.id === job.salesOrderId)?.documentNo ?? job.salesOrderId,
              partyName(state, job.driverId),
              state.vehicles.find((vehicle) => vehicle.id === job.vehicleId)?.plateNumber ?? job.vehicleId,
              job.helperIds.map((id) => partyName(state, id)).join(", "),
              statusText(job.status),
              job.status === "assigned" ? (
                <div key="actions" className="table-actions">
                  <WorkflowActionButton operation="startDeliveryLoading" state={state} runOperation={runOperation} isPending={isPending} label="Bốc hàng" targetId={job.id} />
                  <WorkflowActionButton operation="failDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Thất bại" targetId={job.id} />
                </div>
              ) : job.status === "loading" ? (
                <div key="actions" className="table-actions">
                  <WorkflowActionButton operation="dispatchDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Xuất bến" targetId={job.id} />
                  <WorkflowActionButton operation="failDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Thất bại" targetId={job.id} />
                </div>
              ) : job.status === "in_transit" ? (
                <div key="actions" className="table-actions">
                  {state.approvalRequests.some((request) => request.type === "delivery_completion" && request.status === "pending" && request.targetId === job.id) ? (
                    actor.role === "owner" || actor.role === "accountant" ? (
                      <>
                        <WorkflowActionButton operation="approveDeliveryCompletion" state={state} runOperation={runOperation} isPending={isPending} label="Duyệt giao" targetId={state.approvalRequests.find((request) => request.type === "delivery_completion" && request.status === "pending" && request.targetId === job.id)?.id} />
                        <WorkflowActionButton operation="rejectDeliveryCompletion" state={state} runOperation={runOperation} isPending={isPending} label="Từ chối" targetId={state.approvalRequests.find((request) => request.type === "delivery_completion" && request.status === "pending" && request.targetId === job.id)?.id} />
                      </>
                    ) : (
                      <span className="muted">Chờ Chủ cửa hàng/Kế toán duyệt</span>
                    )
                  ) : actor.role === "worker" ? (
                    <WorkflowActionButton operation="submitDeliveryCompletion" state={state} runOperation={runOperation} isPending={isPending} label="Gửi duyệt giao" targetId={job.id} />
                  ) : (
                    <WorkflowActionButton operation="completeDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Hoàn tất giao" targetId={job.id} />
                  )}
                  <WorkflowActionButton operation="failDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Thất bại" targetId={job.id} />
                </div>
              ) : job.status === "delivered" ? (
                <span key="done" className="muted">Đã hoàn tất</span>
              ) : (
                <span key="failed" className="muted">Cần điều phối lại</span>
              )
            ])}
          />
        </div>
      </section>
      <div className="side-stack">
        <DeliveryJobForm state={state} createCommand={createCommand} isPending={isPending} />
        <WorkflowPanel operations={operationsByModule.delivery ?? []} state={state} runOperation={runOperation} isPending={isPending} />
      </div>
    </div>
  );
}

function InventoryView({
  state,
  runOperation,
  isPending
}: {
  state: OperationsState;
  runOperation: OperationHandler;
  isPending: boolean;
}) {
  const rows = state.warehouses.flatMap((warehouse) => state.productUnits.map((product) => [
    warehouse.name,
    product.productName,
    product.unitName,
    formatQuantity(stockBalance(state, warehouse.id, product.id)),
    state.inventoryMovements.filter((movement) => movement.warehouseId === warehouse.id && movement.productUnitId === product.id).length.toString()
  ]));

  return (
    <div className="workbench-grid">
      <div className="side-stack inventory-main-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Tồn kho hiện tại</h3>
            <p className="panel-note">Tồn kho được tính từ phát sinh kho, không sửa trực tiếp.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable headers={["Kho", "Vật tư", "Đơn vị", "Tồn", "Số phát sinh"]} rows={rows} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Phát sinh kho</h3>
            <p className="panel-note">Chỉ ghi thêm, có chứng từ nguồn và mã ghi sổ.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Loại", "Chứng từ", "Kho", "Vật tư", "Số lượng", "Mã ghi sổ", "Hành động"]}
            rows={state.inventoryMovements.map((movement) => [
              statusText(movement.movementType),
              movement.sourceDocument,
              state.warehouses.find((warehouse) => warehouse.id === movement.warehouseId)?.name ?? movement.warehouseId,
              productLabel(state, movement.productUnitId),
              formatQuantity(movement.quantity),
              movement.postingKey,
              movement.reversedById ? (
                <span key="reversed" className="muted">Đã đảo</span>
              ) : movement.movementType !== "opening" && movement.movementType !== "reverse" ? (
                <WorkflowActionButton key="reverse" operation="reverseInventoryMovement" state={state} runOperation={runOperation} isPending={isPending} label="Đảo" targetId={movement.id} />
              ) : movement.movementType === "reverse" ? (
                <span key="reverse-row" className="muted">Dòng đảo</span>
              ) : (
                <span key="opening" className="muted">Tồn đầu kỳ</span>
              )
            ])}
          />
        </div>
      </section>
      </div>
      <div className="side-stack">
        <InventoryTransferForm state={state} runOperation={runOperation} isPending={isPending} />
        <InventoryCountForm state={state} runOperation={runOperation} isPending={isPending} />
        <WorkflowPanel operations={operationsByModule.inventory ?? []} state={state} runOperation={runOperation} isPending={isPending} />
      </div>
    </div>
  );
}

function InventoryTransferForm({ state, runOperation, isPending }: { state: OperationsState; runOperation: OperationHandler; isPending: boolean }) {
  const actor = useContext(OperationsActorContext);
  const availableWarehouses = actor.warehouseIds
    ? state.warehouses.filter((warehouse) => actor.warehouseIds?.includes(warehouse.id))
    : state.warehouses;
  const { register, handleSubmit, watch, formState: { errors } } = useForm<{
    sourceWarehouseId: string;
    destinationWarehouseId: string;
    productUnitId: string;
    quantity: number;
    reason: string;
  }>({
    defaultValues: {
      sourceWarehouseId: availableWarehouses[0]?.id ?? "",
      destinationWarehouseId: availableWarehouses[1]?.id ?? availableWarehouses[0]?.id ?? "",
      productUnitId: state.productUnits[0]?.id ?? "",
      quantity: 1,
      reason: "Điều chuyển theo kế hoạch kho"
    }
  });
  const sourceWarehouseId = watch("sourceWarehouseId");
  const productUnitId = watch("productUnitId");
  const available = sourceWarehouseId && productUnitId ? stockBalance(state, sourceWarehouseId, productUnitId) : 0;

  return (
    <section className="panel">
      <div className="panel-header"><div><h3 className="panel-title">Chuyển kho</h3><p className="panel-note">Tồn khả dụng tại kho đi: {formatQuantity(available)}</p></div></div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => runOperation("postInventoryTransfer", undefined, values))}>
          <FormField label="Kho đi">
            <select className="input" {...register("sourceWarehouseId", { required: true })}>{availableWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
          </FormField>
          <FormField label="Kho đến">
            <select className="input" {...register("destinationWarehouseId", { required: true })}>{availableWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
          </FormField>
          <FormField label="Vật tư">
            <select className="input" {...register("productUnitId", { required: true })}>{state.productUnits.map((product) => <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>)}</select>
          </FormField>
          <FormField label="Số lượng" error={errors.quantity?.message}>
            <input className="input" type="number" min="0.001" step="0.001" {...register("quantity", { valueAsNumber: true, min: { value: 0.001, message: "Số lượng phải lớn hơn 0." } })} />
          </FormField>
          <FormField label="Lý do" error={errors.reason?.message}>
            <textarea className="input" rows={2} {...register("reason", { minLength: { value: 5, message: "Lý do phải có ít nhất 5 ký tự." } })} />
          </FormField>
          <SubmitButton label="Ghi chuyển kho" command="postInventoryTransfer" isPending={isPending} disabled={isPending || availableWarehouses.length < 2} />
        </form>
      </div>
    </section>
  );
}

function InventoryCountForm({ state, runOperation, isPending }: { state: OperationsState; runOperation: OperationHandler; isPending: boolean }) {
  const actor = useContext(OperationsActorContext);
  const availableWarehouses = actor.warehouseIds
    ? state.warehouses.filter((warehouse) => actor.warehouseIds?.includes(warehouse.id))
    : state.warehouses;
  const { register, handleSubmit, watch, formState: { errors } } = useForm<{
    warehouseId: string;
    productUnitId: string;
    countedQuantity: number;
    reason: string;
  }>({
    defaultValues: {
      warehouseId: availableWarehouses[0]?.id ?? "",
      productUnitId: state.productUnits[0]?.id ?? "",
      countedQuantity: 0,
      reason: "Điều chỉnh theo biên bản kiểm kê"
    }
  });
  const warehouseId = watch("warehouseId");
  const productUnitId = watch("productUnitId");
  const bookQuantity = warehouseId && productUnitId ? stockBalance(state, warehouseId, productUnitId) : 0;

  return (
    <section className="panel">
      <div className="panel-header"><div><h3 className="panel-title">Kiểm kê kho</h3><p className="panel-note">Tồn sổ hiện tại: {formatQuantity(bookQuantity)}</p></div></div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => runOperation("postInventoryCountAdjustment", undefined, values))}>
          <FormField label="Kho">
            <select className="input" {...register("warehouseId", { required: true })}>{availableWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
          </FormField>
          <FormField label="Vật tư">
            <select className="input" {...register("productUnitId", { required: true })}>{state.productUnits.map((product) => <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>)}</select>
          </FormField>
          <FormField label="Số đếm thực tế" error={errors.countedQuantity?.message}>
            <input className="input" type="number" min="0" step="0.001" {...register("countedQuantity", { valueAsNumber: true, min: { value: 0, message: "Số lượng không được âm." } })} />
          </FormField>
          <FormField label="Lý do" error={errors.reason?.message}>
            <textarea className="input" rows={2} {...register("reason", { minLength: { value: 5, message: "Lý do phải có ít nhất 5 ký tự." } })} />
          </FormField>
          <SubmitButton label="Ghi chênh lệch kiểm kê" command="postInventoryCountAdjustment" isPending={isPending} />
        </form>
      </div>
    </section>
  );
}

function ReceivablesView({
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
                {state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} · {customer.displayName}</option>)}
              </select>
            </FormField>
          </div>
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
        <WorkflowPanel operations={operationsByModule.receivables ?? []} state={state} runOperation={runOperation} isPending={isPending} />
      </div>
    </div>
  );
}

function PayablesView({
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
                {state.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.displayName}</option>)}
              </select>
            </FormField>
          </div>
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
        <WorkflowPanel operations={operationsByModule.payables ?? []} state={state} runOperation={runOperation} isPending={isPending} />
      </div>
    </div>
  );
}

function CashView({
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
        <WorkflowPanel operations={operationsByModule.cash ?? []} state={state} runOperation={runOperation} isPending={isPending} />
      </div>
    </div>
  );
}

function CashVoucherDraftForm({ createCommand, isPending }: { createCommand: CreateCommandHandler; isPending: boolean }) {
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

function WorkforceView({
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
  return (
    <div className="workbench-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Sản lượng và tiền công</h3>
            <p className="panel-note">Output đã compensated không được tính lại.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Phiếu", "Công việc", "Sản lượng", "Duyệt", "Trạng thái", "Hành động"]}
            rows={state.workOrders.flatMap((order) =>
              order.outputs.map((output) => [
                order.documentNo,
                order.workType,
                `${formatQuantity(output.actualQuantity)} ${productLabel(state, output.productUnitId)}`,
                formatQuantity(output.approvedQuantity),
                statusText(order.status),
                order.status === "submitted" ? (
                  <WorkflowActionButton key="approve" operation="approveWorkOutput" state={state} runOperation={runOperation} isPending={isPending} label="Duyệt" targetId={order.id} />
                ) : order.status === "approved" ? (
                  <WorkflowActionButton key="post" operation="postCompensation" state={state} runOperation={runOperation} isPending={isPending} label="Ghi công" targetId={order.id} />
                ) : (
                  <span key="done" className="muted">Đã xử lý</span>
                )
              ])
            )}
          />
          <h4 className="section-heading">Sổ tiền công nhân viên</h4>
          <DataTable
            headers={["Nhân viên", "Chứng từ", "Tăng phải trả", "Giảm phải trả", "Số dư"]}
            rows={state.employeeLedgerEntries.map((entry) => [
              partyName(state, entry.employeeId),
              entry.sourceDocument,
              entry.direction === "credit" ? formatMoney(entry.amount) : "",
              entry.direction === "debit" ? formatMoney(entry.amount) : "",
              formatMoney(employeeBalance(state, entry.employeeId))
            ])}
            emptyText="Chưa có dòng tiền công. Duyệt sản lượng và ghi nhận bảng công để phát sinh."
          />
          <h4 className="section-heading">Phiếu thanh toán nhân viên</h4>
          <DataTable
            headers={["Phiếu", "Nhân viên", "Số tiền", "Trạng thái", "Hành động"]}
            rows={state.employeePayments.map((payment) => [
              payment.documentNo,
              partyName(state, payment.employeeId),
              formatMoney(payment.amount),
              statusText(payment.status),
              payment.status === "draft" ? (
                <WorkflowActionButton key="pay" operation="payEmployee" state={state} runOperation={runOperation} isPending={isPending} label="Thanh toán" targetId={payment.id} />
              ) : payment.status === "confirmed" ? (
                <div key="actions" className="table-actions">
                  <span className="muted">Đã thanh toán</span>
                  <WorkflowActionButton operation="reverseEmployeePayment" state={state} runOperation={runOperation} isPending={isPending} label="Đảo phiếu" targetId={payment.id} />
                </div>
              ) : (
                <span key="done" className="muted">Đã đảo</span>
              )
            ])}
          />
          <h4 className="section-heading">Phiếu tạm ứng nhân viên</h4>
          <DataTable
            headers={["Phiếu", "Nhân viên", "Mục đích", "Số tiền", "Trạng thái", "Hành động"]}
            rows={state.employeeAdvances.map((advance) => [
              advance.documentNo,
              partyName(state, advance.employeeId),
              advance.purpose,
              formatMoney(advance.amount),
              statusText(advance.status),
              advance.status === "draft" ? (
                <WorkflowActionButton key="confirm" operation="confirmEmployeeAdvance" state={state} runOperation={runOperation} isPending={isPending} label="Xác nhận" targetId={advance.id} />
              ) : advance.status === "confirmed" ? (
                <WorkflowActionButton key="reverse" operation="reverseEmployeeAdvance" state={state} runOperation={runOperation} isPending={isPending} label="Đảo phiếu" targetId={advance.id} />
              ) : (
                <span key="done" className="muted">Đã đảo</span>
              )
            ])}
            emptyText="Chưa có phiếu tạm ứng nhân viên."
          />
        </div>
      </section>
      <div className="side-stack">
        <WorkOrderDraftForm state={state} createCommand={createCommand} isPending={isPending} />
        <EmployeePaymentDraftForm state={state} createCommand={createCommand} isPending={isPending} />
        <EmployeeAdvanceDraftForm state={state} createCommand={createCommand} isPending={isPending} />
        <WorkflowPanel operations={operationsByModule.workforce ?? []} state={state} runOperation={runOperation} isPending={isPending} />
      </div>
    </div>
  );
}

function EmployeePaymentDraftForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<{ employeeId: string; amount: number }>({
    defaultValues: { employeeId: state.employees[0]?.id ?? "", amount: 0 }
  });
  const employeeId = watch("employeeId");
  const payable = employeeId ? employeeBalance(state, employeeId) : 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Phiếu thanh toán nhân viên</h3>
          <p className="panel-note">Công còn phải trả: {formatMoney(payable)}. Phiếu nháp chưa giảm quỹ.</p>
        </div>
      </div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => {
          createCommand({ type: "createEmployeePaymentDraft", employeeId: values.employeeId, amount: values.amount });
          reset({ employeeId: values.employeeId, amount: 0 });
        })}>
          <FormField label="Nhân viên">
            <select className="input" {...register("employeeId", { required: "Chọn nhân viên." })}>
              {state.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.code} · {employee.displayName}</option>)}
            </select>
          </FormField>
          <FormField label="Số tiền" error={errors.amount?.message}>
            <input className="input" type="number" min="1" step="1000" {...register("amount", {
              valueAsNumber: true,
              min: { value: 1, message: "Số tiền phải lớn hơn 0." }
            })} />
          </FormField>
          <SubmitButton label="Tạo phiếu thanh toán" command="createEmployeePaymentDraft" isPending={isPending} disabled={isPending || state.employees.length === 0} />
        </form>
      </div>
    </section>
  );
}

function EmployeeAdvanceDraftForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    employeeId: string;
    purpose: string;
    amount: number;
  }>({ defaultValues: { employeeId: state.employees[0]?.id ?? "", purpose: "", amount: 0 } });

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Phiếu tạm ứng nhân viên</h3>
          <p className="panel-note">Phiếu nháp chưa làm giảm quỹ; khi xác nhận sẽ khấu trừ vào số dư sổ nhân viên.</p>
        </div>
      </div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => {
          createCommand({ type: "createEmployeeAdvanceDraft", ...values });
          reset({ employeeId: values.employeeId, purpose: "", amount: 0 });
        })}>
          <FormField label="Nhân viên">
            <select className="input" {...register("employeeId", { required: "Chọn nhân viên." })}>
              {state.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.code} · {employee.displayName}</option>)}
            </select>
          </FormField>
          <FormField label="Mục đích" error={errors.purpose?.message}>
            <input className="input" {...register("purpose", { required: "Nhập mục đích tạm ứng." })} />
          </FormField>
          <FormField label="Số tiền" error={errors.amount?.message}>
            <input className="input" type="number" min="1" step="1000" {...register("amount", {
              valueAsNumber: true,
              min: { value: 1, message: "Số tiền phải lớn hơn 0." }
            })} />
          </FormField>
          <SubmitButton label="Tạo phiếu tạm ứng" command="createEmployeeAdvanceDraft" isPending={isPending} disabled={isPending || state.employees.length === 0} />
        </form>
      </div>
    </section>
  );
}

function ImportView({
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
        <WorkflowPanel operations={operationsByModule.import ?? []} state={state} runOperation={runOperation} isPending={isPending} />
      </div>
    </div>
  );
}

function ImportWorkbookForm({ importWorkbook, isPending }: { importWorkbook: WorkbookImportHandler; isPending: boolean }) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Chạy thử workbook</h3>
          <p className="panel-note">File .xlsx tối đa 40 MB. Chạy thử chỉ tạo batch và danh sách lỗi, chưa ghi giao dịch.</p>
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

function AuditView({ state }: { state: OperationsState }) {
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
      filterRows([event], query, (item) => [item.actorName, item.action, item.permission, item.targetId, item.reason, item.correlationId, item.summary]).length > 0;
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
            <h3 className="panel-title">Kiểm tra tính toàn vẹn Audit</h3>
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
            <h3 className="panel-title">Nhật ký kiểm toán</h3>
            <p className="panel-note">Đang hiển thị {filteredLogs.length} / {state.auditLogs.length} sự kiện.</p>
          </div>
          <button className="button button-small" type="button" onClick={exportAudit} disabled={filteredLogs.length === 0}>
            <Download aria-hidden="true" /> Xuất CSV
          </button>
        </div>
        <div className="panel-body">
          <div className="audit-filter-grid">
            <FormField label="Tìm kiếm">
              <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Command, chứng từ, lý do..." />
            </FormField>
            <FormField label="Người thao tác">
              <select className="input" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
                <option value="all">Tất cả</option>
                {actors.map((actor) => <option key={actor} value={actor}>{actor}</option>)}
              </select>
            </FormField>
            <FormField label="Command">
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
            headers={["Thời điểm", "Người thao tác", "Command", "Target", "Mã liên kết", "Tóm tắt", "Chi tiết"]}
            rows={filteredLogs.map((event) => [
              formatDateTime(event.occurredAt),
              event.actorName,
              event.action,
              event.targetId ?? "-",
              event.correlationId?.slice(0, 12) ?? "-",
              event.summary,
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
              <p className="panel-note">{selectedAudit.actorName} · {formatDateTime(selectedAudit.occurredAt)} · {selectedAudit.permission ?? "Không có quyền nguồn"}</p>
            </div>
            <button className="button button-small" type="button" onClick={() => setSelectedAuditId(undefined)}>Đóng</button>
          </div>
          <div className="panel-body audit-detail-grid">
            <dl className="audit-metadata">
              <div><dt>Chứng từ đích</dt><dd>{selectedAudit.targetId ?? "-"}</dd></div>
              <div><dt>Mã liên kết</dt><dd>{selectedAudit.correlationId ?? "-"}</dd></div>
              <div><dt>Lý do</dt><dd>{selectedAudit.reason ?? "-"}</dd></div>
              <div><dt>Kết quả</dt><dd>{selectedAudit.summary}</dd></div>
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

function ReportingView({ state }: { state: OperationsState }) {
  const customer = state.customers[0];
  const availableMonths = useMemo(() => getAvailableReportMonths(state), [state]);
  const [reportMonth, setReportMonth] = useState(() => getDefaultReportMonth(state));
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

  return (
    <div className="dashboard-grid">
      <section className="panel span-12">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Xuất báo cáo tháng</h3>
            <p className="panel-note">Xuất một gói ZIP gồm báo cáo CSV, dashboard HTML đính kèm và manifest để đối soát nội dung file.</p>
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

function WorkflowPanel({
  operations,
  state,
  runOperation,
  isPending
}: {
  operations: OperationName[];
  state: OperationsState;
  runOperation: OperationHandler;
  isPending: boolean;
}) {
  return (
    <aside className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Thao tác nghiệp vụ</h3>
          <p className="panel-note">Mỗi thao tác có khóa chống chạy trùng, nhật ký kiểm toán và quy tắc kiểm tra.</p>
        </div>
      </div>
      <div className="panel-body">
        <div className="timeline-list">
          {operations.map((operation, index) => (
            <OperationRow
              key={operation}
              index={index + 1}
              operation={operation}
              state={state}
              onRun={runOperation}
              isPending={isPending}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function CreateMasterDataPanel({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  return (
    <section className="panel span-12">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Tạo danh mục nhanh</h3>
          <p className="panel-note">Dữ liệu nền được kiểm tra trùng tên/mã phía máy chủ trước khi lưu.</p>
        </div>
      </div>
      <div className="panel-body form-grid form-grid-4">
        <CustomerQuickForm createCommand={createCommand} isPending={isPending} />
        <SupplierQuickForm createCommand={createCommand} isPending={isPending} />
        <ProductUnitQuickForm state={state} createCommand={createCommand} isPending={isPending} />
        <WarehouseQuickForm createCommand={createCommand} isPending={isPending} />
        <VehicleQuickForm createCommand={createCommand} isPending={isPending} />
        <EmployeeQuickForm createCommand={createCommand} isPending={isPending} />
      </div>
    </section>
  );
}

function CustomerQuickForm({
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
  } = useForm<{ displayName: string; phone: string; creditLimit: number }>({
    defaultValues: { displayName: "", phone: "", creditLimit: 0 }
  });

  return (
    <form
      className="command-form"
      noValidate
      onSubmit={handleSubmit((values) => {
        createCommand({
          type: "createCustomer",
          displayName: values.displayName,
          phone: values.phone,
          creditLimit: values.creditLimit
        });
        reset({ displayName: "", phone: "", creditLimit: 0 });
      })}
    >
      <h4 className="form-title">Khách hàng</h4>
      <FormField label="Tên khách hàng" error={errors.displayName?.message}>
        <input className="input" {...register("displayName", { required: "Nhập tên khách hàng." })} />
      </FormField>
      <FormField label="Điện thoại">
        <input className="input" {...register("phone")} />
      </FormField>
      <FormField label="Hạn mức nợ" error={errors.creditLimit?.message}>
        <input
          className="input"
          type="number"
          min="0"
          step="1"
          {...register("creditLimit", {
            valueAsNumber: true,
            min: { value: 0, message: "Không được âm." }
          })}
        />
      </FormField>
      <SubmitButton label="Tạo khách hàng" command="createCustomer" isPending={isPending} />
    </form>
  );
}

function InlineSupplierQuickForm({
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
  } = useForm<{ displayName: string; phone: string }>({
    defaultValues: { displayName: "", phone: "" }
  });

  return (
    <form
      className="command-form compact-command-form"
      noValidate
      onSubmit={handleSubmit((values) => {
        createCommand({ type: "createSupplier", displayName: values.displayName, phone: values.phone });
        reset({ displayName: "", phone: "" });
      })}
    >
      <h4 className="form-title">Thêm nhà cung cấp</h4>
      <FormField label="Tên nhà cung cấp mới" error={errors.displayName?.message}>
        <input className="input" {...register("displayName", { required: "Nhập tên nhà cung cấp." })} />
      </FormField>
      <FormField label="Điện thoại">
        <input className="input" {...register("phone")} />
      </FormField>
      <SubmitButton label="Thêm vào dropdown" command="createSupplier" isPending={isPending} />
    </form>
  );
}

function SupplierQuickForm({
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
  } = useForm<{ displayName: string; phone: string }>({
    defaultValues: { displayName: "", phone: "" }
  });

  return (
    <form
      className="command-form"
      noValidate
      onSubmit={handleSubmit((values) => {
        createCommand({ type: "createSupplier", displayName: values.displayName, phone: values.phone });
        reset({ displayName: "", phone: "" });
      })}
    >
      <h4 className="form-title">Nhà cung cấp</h4>
      <FormField label="Tên nhà cung cấp" error={errors.displayName?.message}>
        <input className="input" {...register("displayName", { required: "Nhập tên nhà cung cấp." })} />
      </FormField>
      <FormField label="Điện thoại">
        <input className="input" {...register("phone")} />
      </FormField>
      <SubmitButton label="Tạo nhà cung cấp" command="createSupplier" isPending={isPending} />
    </form>
  );
}

function PurchaseUnitSettings({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const canManage = actor.permissions.includes("catalog.manage_purchase_units");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const unitForm = useForm<{ name: string }>({ defaultValues: { name: "" } });
  const initialProductUnitId = state.productUnits[0]?.id ?? "";
  const conversionForm = useForm<{
    productUnitId: string;
    unitId: string;
    conversionMode: "fixed" | "variable";
    factorToBase?: number;
  }>({
    defaultValues: {
      productUnitId: initialProductUnitId,
      unitId: defaultPurchaseUnitId(state, initialProductUnitId),
      conversionMode: defaultPurchaseUnitMode(state, initialProductUnitId),
      factorToBase: defaultPurchaseUnitFactor(state, initialProductUnitId)
    }
  });
  const selectedProductUnitId = conversionForm.watch("productUnitId");
  const selectedUnitId = conversionForm.watch("unitId");
  const selectedMode = conversionForm.watch("conversionMode");
  const selectedFactor = conversionForm.watch("factorToBase");
  const selectedProduct = state.productUnits.find((item) => item.id === selectedProductUnitId);
  const selectedUnit = state.unitDefinitions.find((item) => item.id === selectedUnitId);
  const selectedConversion = state.purchaseUnitConversions.find(
    (item) => item.productUnitId === selectedProductUnitId && item.unitId === selectedUnitId
  );
  const baseUnitNames = new Set(state.productUnits.map((product) => normalizeUnitName(product.unitName)));
  const availableUnits = state.unitDefinitions.filter((unit) =>
    unit.status === "active" && !baseUnitNames.has(normalizeUnitName(unit.name))
  );
  const customUnitCount = state.unitDefinitions.filter((unit) => !baseUnitNames.has(normalizeUnitName(unit.name))).length;
  const resetSettingsKey = "reset:purchase-unit-settings";
  const hasPurchaseUnitSettings = customUnitCount > 0 || state.purchaseUnitConversions.length > 0;

  function syncConversion(productUnitId: string, unitId: string) {
    const existing = state.purchaseUnitConversions.find(
      (item) => item.productUnitId === productUnitId && item.unitId === unitId
    );
    conversionForm.setValue("conversionMode", existing?.conversionMode ?? "fixed", { shouldValidate: true });
    conversionForm.setValue("factorToBase", existing?.factorToBase ?? 1, { shouldValidate: true });
  }

  useEffect(() => {
    if (availableUnits.some((unit) => unit.id === selectedUnitId)) {
      return;
    }
    const nextUnitId = defaultPurchaseUnitId(state, selectedProductUnitId);
    conversionForm.setValue("unitId", nextUnitId);
    const existing = state.purchaseUnitConversions.find(
      (item) => item.productUnitId === selectedProductUnitId && item.unitId === nextUnitId
    );
    conversionForm.setValue("conversionMode", existing?.conversionMode ?? "fixed");
    conversionForm.setValue("factorToBase", existing?.factorToBase ?? 1);
  }, [availableUnits, conversionForm, selectedProductUnitId, selectedUnitId, state, state.purchaseUnitConversions]);

  const unitRows: ReactNode[][] = state.unitDefinitions.map((unit) => {
    const baseProducts = state.productUnits.filter(
      (product) => normalizeUnitName(product.unitName) === normalizeUnitName(unit.name)
    );
    const conversionCount = state.purchaseUnitConversions.filter((item) => item.unitId === unit.id).length;
    const deleteKey = `unit:${unit.id}`;
    return [
      displayUnitName(unit.name),
      baseProducts.length > 0 ? baseProducts.map((product) => product.productName).join(", ") : "Không",
      conversionCount,
      baseProducts.length > 0 ? (
        <span className="muted">Không thể xóa khi đang dùng làm đơn vị tồn kho</span>
      ) : pendingDelete === deleteKey ? (
        <div className="delete-confirmation">
          <span>Xóa đơn vị và {conversionCount} quy đổi hiện tại?</span>
          <button
            className="button button-small button-danger"
            type="button"
            disabled={isPending || !canManage}
            onClick={() => {
              createCommand({ type: "deleteUnitDefinition", unitId: unit.id });
              setPendingDelete(null);
            }}
          >
            <Trash2 aria-hidden="true" />
            Xác nhận xóa
          </button>
          <button className="button button-small" type="button" onClick={() => setPendingDelete(null)}>Hủy</button>
        </div>
      ) : (
        <button
          className="button button-small"
          type="button"
          disabled={isPending || !canManage}
          onClick={() => setPendingDelete(deleteKey)}
        >
          <Trash2 aria-hidden="true" />
          Xóa
        </button>
      )
    ];
  });

  const conversionRows: ReactNode[][] = state.purchaseUnitConversions.map((conversion) => {
    const product = state.productUnits.find((item) => item.id === conversion.productUnitId);
    const unit = state.unitDefinitions.find((item) => item.id === conversion.unitId);
    const deleteKey = `conversion:${conversion.id}`;
    return [
      product ? `${product.productCode} · ${product.productName}` : conversion.productUnitId,
      conversion.conversionMode === "variable"
        ? `${displayUnitName(unit?.name)} · nhập ${displayUnitName(product?.unitName)} thực tế trên từng đơn mua`
        : `1 ${displayUnitName(unit?.name)} = ${formatQuantity(conversion.factorToBase ?? 0)} ${displayUnitName(product?.unitName)}`,
      `v${conversion.version}`,
      pendingDelete === deleteKey ? (
        <div className="delete-confirmation">
          <span>Xóa quy đổi này? Chứng từ cũ không thay đổi.</span>
          <button
            className="button button-small button-danger"
            type="button"
            disabled={isPending || !canManage}
            onClick={() => {
              createCommand({
                type: "deletePurchaseUnitConversion",
                conversionId: conversion.id,
                expectedVersion: conversion.version
              });
              setPendingDelete(null);
            }}
          >
            <Trash2 aria-hidden="true" />
            Xác nhận xóa
          </button>
          <button className="button button-small" type="button" onClick={() => setPendingDelete(null)}>Hủy</button>
        </div>
      ) : (
        <button
          className="button button-small"
          type="button"
          disabled={isPending || !canManage}
          onClick={() => setPendingDelete(deleteKey)}
        >
          <Trash2 aria-hidden="true" />
          Xóa quy đổi
        </button>
      )
    ];
  });

  return (
    <section className="panel span-12">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Cài đặt đơn vị mua</h3>
          <p className="panel-note">Tự tạo đơn vị và chọn cách tính riêng cho từng vật tư. Chứng từ đã tạo luôn giữ nguyên dữ liệu cũ.</p>
        </div>
        {hasPurchaseUnitSettings ? pendingDelete === resetSettingsKey ? (
          <div className="delete-confirmation">
            <span>Xóa toàn bộ đơn vị mua và cách tính hiện tại?</span>
            <button
              className="button button-small button-danger"
              type="button"
              disabled={isPending || !canManage}
              onClick={() => {
                createCommand({
                  type: "resetPurchaseUnitSettings",
                  expectedCustomUnitCount: customUnitCount,
                  expectedConversionCount: state.purchaseUnitConversions.length
                });
                setPendingDelete(null);
              }}
            >
              <Trash2 aria-hidden="true" />
              Xác nhận xóa
            </button>
            <button className="button button-small" type="button" onClick={() => setPendingDelete(null)}>Hủy</button>
          </div>
        ) : (
          <button
            className="button button-small"
            type="button"
            disabled={isPending || !canManage}
            onClick={() => setPendingDelete(resetSettingsKey)}
          >
            <Trash2 aria-hidden="true" />
            Xóa cài đặt hiện tại
          </button>
        ) : null}
      </div>
      <div className="panel-body">
        <div className="unit-settings-grid">
          <form
            className="command-form unit-setting-form"
            noValidate
            onSubmit={unitForm.handleSubmit((values) => {
              createCommand({ type: "createUnitDefinition", name: values.name });
              unitForm.reset({ name: "" });
            })}
          >
            <h4 className="form-title">Thêm đơn vị</h4>
            <FormField label="Tên đơn vị" error={unitForm.formState.errors.name?.message}>
              <input
                className="input"
                placeholder="Ví dụ: Tấn, Tạ, Xe"
                {...unitForm.register("name", { required: "Nhập tên đơn vị." })}
              />
            </FormField>
            <SubmitButton label="Thêm đơn vị" command="createUnitDefinition" isPending={isPending} />
          </form>

          <form
            className="command-form unit-setting-form"
            noValidate
            onSubmit={conversionForm.handleSubmit((values) => {
              const existing = state.purchaseUnitConversions.find(
                (item) => item.productUnitId === values.productUnitId && item.unitId === values.unitId
              );
              createCommand({
                type: "upsertPurchaseUnitConversion",
                productUnitId: values.productUnitId,
                unitId: values.unitId,
                conversionMode: values.conversionMode,
                factorToBase: values.conversionMode === "fixed" ? values.factorToBase : undefined,
                expectedVersion: existing?.version
              });
            })}
          >
            <h4 className="form-title">Đơn vị mua theo vật tư</h4>
            <FormField label="Vật tư">
              <select
                className="input"
                {...conversionForm.register("productUnitId", {
                  required: "Chọn vật tư.",
                  onChange: (event) => {
                    const nextProductUnitId = event.target.value;
                    const nextUnitId = defaultPurchaseUnitId(state, nextProductUnitId);
                    conversionForm.setValue("unitId", nextUnitId);
                    syncConversion(nextProductUnitId, nextUnitId);
                  }
                })}
              >
                {state.productUnits.map((product) => (
                  <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Đơn vị mua" error={conversionForm.formState.errors.unitId?.message}>
              <select
                className="input"
                disabled={availableUnits.length === 0}
                {...conversionForm.register("unitId", {
                  required: "Chọn đơn vị mua.",
                  onChange: (event) => syncConversion(selectedProductUnitId, event.target.value)
                })}
              >
                <option value="">{availableUnits.length === 0 ? "Chưa có đơn vị mua" : "Chọn đơn vị mua"}</option>
                {availableUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{displayUnitName(unit.name)}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Cách tính">
              <select className="input" {...conversionForm.register("conversionMode") }>
                <option value="fixed">Quy đổi cố định</option>
                <option value="variable">Nhập số lượng thực tế mỗi lần mua</option>
              </select>
            </FormField>
            {selectedMode === "fixed" ? (
              <FormField
                label={`Số ${displayUnitName(selectedProduct?.unitName)} trong 1 ${displayUnitName(selectedUnit?.name)}`}
                error={conversionForm.formState.errors.factorToBase?.message}
              >
                <input
                  className="input"
                  type="number"
                  min="0.001"
                  step="0.001"
                  {...conversionForm.register("factorToBase", {
                    valueAsNumber: true,
                    required: "Nhập hệ số quy đổi.",
                    min: { value: 0.001, message: "Hệ số phải lớn hơn 0." }
                  })}
                />
              </FormField>
            ) : null}
            <p className="conversion-note">
              {selectedMode === "fixed"
                ? `1 ${displayUnitName(selectedUnit?.name)} = ${formatQuantity(Number(selectedFactor || 0))} ${displayUnitName(selectedProduct?.unitName)}`
                : `Mỗi đơn mua sẽ nhập tổng ${displayUnitName(selectedProduct?.unitName)} thực nhận, không dùng hệ số cố định.`}
            </p>
            <SubmitButton
              label={selectedConversion ? "Cập nhật quy đổi" : "Lưu quy đổi"}
              command="upsertPurchaseUnitConversion"
              isPending={isPending}
              disabled={isPending || availableUnits.length === 0}
            />
          </form>
        </div>

        <h4 className="section-heading">Danh mục đơn vị</h4>
        <DataTable
          headers={["Đơn vị", "Đơn vị tồn kho của", "Số cách tính", "Hành động"]}
          rows={unitRows}
          emptyText="Chưa có đơn vị. Hãy thêm đơn vị trước khi tạo vật tư."
        />
        <h4 className="section-heading">Cách tính đang áp dụng</h4>
        <DataTable
          headers={["Vật tư", "Cách tính", "Phiên bản", "Hành động"]}
          rows={conversionRows}
          emptyText="Chưa có cách tính đơn vị mua."
        />
      </div>
    </section>
  );
}

function ProductUnitQuickForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<{ productCode: string; productName: string; unitName: string }>({
    defaultValues: { productCode: "", productName: "", unitName: "" }
  });

  return (
    <form
      className="command-form"
      noValidate
      onSubmit={handleSubmit((values) => {
        createCommand({
          type: "createProductUnit",
          productCode: values.productCode,
          productName: values.productName,
          unitName: values.unitName
        });
        reset({ productCode: "", productName: "", unitName: "" });
      })}
    >
      <h4 className="form-title">Vật tư</h4>
      <FormField label="Mã vật tư" error={errors.productCode?.message}>
        <input className="input" {...register("productCode", { required: "Nhập mã vật tư." })} />
      </FormField>
      <FormField label="Tên vật tư" error={errors.productName?.message}>
        <input className="input" {...register("productName", { required: "Nhập tên vật tư." })} />
      </FormField>
      <FormField label="Đơn vị tồn kho gốc" error={errors.unitName?.message}>
        <select className="input" disabled={state.unitDefinitions.length === 0} {...register("unitName", { required: "Chọn đơn vị tồn kho gốc." })}>
          <option value="">Chọn đơn vị</option>
          {state.unitDefinitions.filter((unit) => unit.status === "active").map((unit) => (
            <option key={unit.id} value={unit.name}>{displayUnitName(unit.name)}</option>
          ))}
        </select>
      </FormField>
      <SubmitButton label="Tạo vật tư" command="createProductUnit" isPending={isPending} disabled={isPending || state.unitDefinitions.length === 0} />
    </form>
  );
}

function WarehouseQuickForm({ createCommand, isPending }: { createCommand: CreateCommandHandler; isPending: boolean }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ code: string; name: string }>({
    defaultValues: { code: "", name: "" }
  });

  return (
    <form className="command-form compact-command-form" noValidate onSubmit={handleSubmit((values) => {
      createCommand({ type: "createWarehouse", code: values.code, name: values.name });
      reset();
    })}>
      <h4 className="form-title">Kho / bãi</h4>
      <FormField label="Mã kho" error={errors.code?.message}>
        <input className="input" {...register("code", { required: "Nhập mã kho." })} />
      </FormField>
      <FormField label="Tên kho" error={errors.name?.message}>
        <input className="input" {...register("name", { required: "Nhập tên kho." })} />
      </FormField>
      <SubmitButton label="Tạo kho" command="createWarehouse" isPending={isPending} />
    </form>
  );
}

function VehicleQuickForm({ createCommand, isPending }: { createCommand: CreateCommandHandler; isPending: boolean }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    code: string;
    plateNumber: string;
    capacityTons: number;
  }>({ defaultValues: { code: "", plateNumber: "", capacityTons: 5 } });

  return (
    <form className="command-form compact-command-form" noValidate onSubmit={handleSubmit((values) => {
      createCommand({ type: "createVehicle", ...values });
      reset({ code: "", plateNumber: "", capacityTons: 5 });
    })}>
      <h4 className="form-title">Phương tiện</h4>
      <FormField label="Mã xe" error={errors.code?.message}>
        <input className="input" {...register("code", { required: "Nhập mã xe." })} />
      </FormField>
      <FormField label="Biển số" error={errors.plateNumber?.message}>
        <input className="input" {...register("plateNumber", { required: "Nhập biển số xe." })} />
      </FormField>
      <FormField label="Tải trọng (tấn)" error={errors.capacityTons?.message}>
        <input className="input" type="number" min="0.1" step="0.1" {...register("capacityTons", {
          valueAsNumber: true,
          min: { value: 0.1, message: "Tải trọng phải lớn hơn 0." }
        })} />
      </FormField>
      <SubmitButton label="Tạo xe" command="createVehicle" isPending={isPending} />
    </form>
  );
}

function EmployeeQuickForm({
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
  } = useForm<{ displayName: string; roleType: "driver" | "worker" | "warehouse" | "sales" | "accountant" | "supervisor" }>({
    defaultValues: { displayName: "", roleType: "worker" }
  });

  return (
    <form
      className="command-form"
      noValidate
      onSubmit={handleSubmit((values) => {
        createCommand({ type: "createEmployee", displayName: values.displayName, roleType: values.roleType });
        reset({ displayName: "", roleType: "worker" });
      })}
    >
      <h4 className="form-title">Nhân sự</h4>
      <FormField label="Tên nhân viên" error={errors.displayName?.message}>
        <input className="input" {...register("displayName", { required: "Nhập tên nhân viên." })} />
      </FormField>
      <FormField label="Vai trò">
        <select className="input" {...register("roleType")}>
          <option value="worker">Thợ</option>
          <option value="driver">Tài xế</option>
          <option value="warehouse">Kho</option>
          <option value="sales">Bán hàng</option>
          <option value="accountant">Kế toán</option>
          <option value="supervisor">Giám sát</option>
        </select>
      </FormField>
      <SubmitButton label="Tạo nhân sự" command="createEmployee" isPending={isPending} />
    </form>
  );
}

function SalesOrderDraftForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm<{
    customerId: string;
    lines: Array<{ productUnitId: string; quantity: number; unitPrice: number; taxRate: number; unitName: string; unitFactor: number }>;
  }>({
    defaultValues: {
      customerId: state.customers[0]?.id ?? "",
      lines: [{
        productUnitId: state.productUnits[0]?.id ?? "",
        quantity: 1,
        unitPrice: 0,
        taxRate: 0.1,
        unitName: state.productUnits[0]?.unitName ?? "",
        unitFactor: 1
      }]
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watchedLines = watch("lines");
  const disabled = isPending || state.customers.length === 0 || state.productUnits.length === 0;
  const [documentImage, setDocumentImage] = useState<File | null>(null);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Tạo đơn bán nháp</h3>
          <p className="panel-note">Giá và VAT được giữ theo dòng đơn khi xác nhận.</p>
        </div>
      </div>
      <div className="panel-body">
        <form
          className="command-form"
          noValidate
          onSubmit={handleSubmit((values) => {
            createCommand({
              type: "createSalesOrderDraft",
              customerId: values.customerId,
              lines: values.lines
            }, () => {
              reset({
              customerId: values.customerId,
              lines: [{
                productUnitId: values.lines[0]?.productUnitId ?? state.productUnits[0]?.id ?? "",
                 quantity: 1,
                 unitPrice: values.lines[0]?.unitPrice ?? 0,
                 taxRate: values.lines[0]?.taxRate ?? 0.1,
                 unitName: values.lines[0]?.unitName ?? state.productUnits.find((product) => product.id === (values.lines[0]?.productUnitId ?? state.productUnits[0]?.id))?.unitName ?? "",
                 unitFactor: values.lines[0]?.unitFactor ?? 1
              }]
              });
              setDocumentImage(null);
            }, documentImage ?? undefined);
          })}
        >
          <FormField label="Khách hàng">
            <select className="input" {...register("customerId", { required: "Chọn khách hàng." })}>
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <div className="document-lines">
            {fields.map((field, index) => (
              <fieldset className="document-line" key={field.id}>
                <div className="document-line-header">
                  <legend>Dòng {index + 1}</legend>
                  <button className="button button-small" type="button" disabled={fields.length === 1 || isPending} onClick={() => remove(index)}>
                    <Trash2 aria-hidden="true" />
                    Xóa dòng
                  </button>
                </div>
                <FormField label="Vật tư" error={errors.lines?.[index]?.productUnitId?.message}>
                  <select className="input" {...register(`lines.${index}.productUnitId`, {
                    required: "Chọn vật tư.",
                    onChange: (event) => {
                     const product = state.productUnits.find((item) => item.id === event.target.value);
                        setValue(`lines.${index}.unitName`, "");
                      setValue(`lines.${index}.unitFactor`, 1);
                    }
                  })}>
                    {state.productUnits.map((product) => (
                      <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>
                    ))}
                  </select>
                </FormField>
                <ProductCatalogPreview state={state} productUnitId={watchedLines?.[index]?.productUnitId ?? ""} />
                <div className="document-line-grid">
                  <FormField label="Đơn vị bán">
                    <select className="input" {...register(`lines.${index}.unitName`, { required: "Chọn đơn vị bán." })}>
                      {documentUnitOptions(state, watchedLines?.[index]?.productUnitId ?? "").map((unit) => (
                        <option key={unit} value={unit}>{displayUnitName(unit)}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField
                    label={`Quy đổi 1 ${displayUnitName(watchedLines?.[index]?.unitName)} về ${displayUnitName(productBaseUnit(state, watchedLines?.[index]?.productUnitId ?? ""))}`}
                    error={errors.lines?.[index]?.unitFactor?.message}
                  >
                    <input
                      className="input"
                      type="number"
                      min="0.001"
                      step="0.001"
                      disabled={usesProductBaseUnit(state, watchedLines?.[index]?.productUnitId ?? "", watchedLines?.[index]?.unitName)}
                      {...register(`lines.${index}.unitFactor`, { valueAsNumber: true, min: { value: 0.001, message: "Hệ số phải lớn hơn 0." } })}
                    />
                  </FormField>
                </div>
                <div className="document-line-grid">
                  <FormField label={`Số lượng (${displayUnitName(watchedLines?.[index]?.unitName)})`} error={errors.lines?.[index]?.quantity?.message}>
                    <input className="input" type="number" min="0.001" step="0.001" {...register(`lines.${index}.quantity`, {
                      valueAsNumber: true,
                      min: { value: 0.001, message: "Số lượng phải lớn hơn 0." }
                    })} />
                  </FormField>
                  <FormField label={`Đơn giá / ${displayUnitName(watchedLines?.[index]?.unitName)}`} error={errors.lines?.[index]?.unitPrice?.message}>
                    <input className="input" type="number" min="0" step="1" {...register(`lines.${index}.unitPrice`, {
                      valueAsNumber: true,
                      min: { value: 0, message: "Đơn giá không được âm." }
                    })} />
                  </FormField>
                  <FormField label="VAT">
                    <select className="input" {...register(`lines.${index}.taxRate`, { valueAsNumber: true })}>
                      <option value="0">0%</option><option value="0.05">5%</option><option value="0.08">8%</option><option value="0.1">10%</option>
                    </select>
                  </FormField>
                </div>
                <p className="conversion-note">{documentConversionPreview(state, watchedLines?.[index])}</p>
              </fieldset>
            ))}
          </div>
          <button className="button" type="button" disabled={isPending} onClick={() => append({
            productUnitId: state.productUnits[0]?.id ?? "", quantity: 1, unitPrice: 0, taxRate: 0.1,
            unitName: state.productUnits[0]?.unitName ?? "", unitFactor: 1
          })}>
            <PlusCircle aria-hidden="true" />
            Thêm dòng vật tư
          </button>
          <FormField label="Ảnh chứng từ bán (không bắt buộc)">
            <input
              className="input file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(event) => setDocumentImage(event.target.files?.[0] ?? null)}
            />
            {documentImage ? <p className="panel-note">{documentImage.name} · {(documentImage.size / 1024 / 1024).toFixed(1)} MB</p> : null}
          </FormField>
          <SubmitButton label="Tạo đơn bán" command="createSalesOrderDraft" isPending={isPending} disabled={disabled} />
        </form>
      </div>
    </section>
  );
}

function PurchaseOrderDraftForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  function getDefaultPurchaseUnit(productUnitId: string) {
    return configuredPurchaseUnits(state, productUnitId)[0];
  }

  function getDefaultPurchaseUnitFactor(productUnitId: string, unitName?: string) {
    const unit = unitName
      ? configuredPurchaseUnit(state, productUnitId, unitName)
      : getDefaultPurchaseUnit(productUnitId);

    return unit?.conversionMode === "fixed" ? unit.factorToBase ?? 1 : undefined;
  }

  const initialProductUnitId = state.productUnits[0]?.id ?? "";
  const initialPurchaseUnit = getDefaultPurchaseUnit(initialProductUnitId);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm<{
    supplierId: string;
    lines: Array<{
      productUnitId: string;
      orderedQuantity: number;
      unitCost: number;
      taxRate: number;
      unitName: string;
      unitFactor?: number;
      actualBaseQuantity?: number;
      destinationType: "warehouse" | "customer_direct";
      customerId: string;
    }>;
  }>({
    defaultValues: {
      supplierId: state.suppliers[0]?.id ?? "",
      lines: [{
        productUnitId: state.productUnits[0]?.id ?? "",
        orderedQuantity: 1,
        unitCost: 0,
        taxRate: 0.1,
        unitName: initialPurchaseUnit?.unitName ?? "",
        unitFactor: getDefaultPurchaseUnitFactor(initialProductUnitId, initialPurchaseUnit?.unitName),
        destinationType: "warehouse",
        customerId: state.customers[0]?.id ?? ""
      }]
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watchedLines = watch("lines");
  const disabled = isPending || state.suppliers.length === 0 || state.productUnits.length === 0;
  const [documentImage, setDocumentImage] = useState<File | null>(null);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Tạo đơn mua nháp</h3>
          <p className="panel-note">Chọn rõ nhập kho hay giao thẳng để tránh ghi kho sai.</p>
        </div>
      </div>
      <div className="panel-body">
        <InlineSupplierQuickForm createCommand={createCommand} isPending={isPending} />
        <div className="form-divider" />
        <form
          className="command-form"
          noValidate
          onSubmit={handleSubmit((values) => {
            createCommand({
              type: "createPurchaseOrderDraft",
              supplierId: values.supplierId,
              lines: values.lines.map((line) => {
                const configuredUnit = configuredPurchaseUnit(state, line.productUnitId, line.unitName);
                const configuredLineUnit = line.unitName || (getDefaultPurchaseUnit(line.productUnitId)?.unitName ?? "");
                return {
                  ...line,
                  unitName: line.unitName || configuredLineUnit,
                  unitFactor: configuredUnit?.conversionMode === "variable" ? undefined : line.unitFactor,
                  actualBaseQuantity: configuredUnit?.conversionMode === "variable" ? line.actualBaseQuantity : undefined,
                  customerId: line.destinationType === "customer_direct" ? line.customerId : undefined
                };
              })
            }, () => {
              reset({
              supplierId: values.supplierId,
              lines: [{
                productUnitId: values.lines[0]?.productUnitId ?? state.productUnits[0]?.id ?? "",
                orderedQuantity: 1,
                unitCost: values.lines[0]?.unitCost ?? 0,
                taxRate: values.lines[0]?.taxRate ?? 0.1,
                unitName: values.lines[0]?.unitName || (getDefaultPurchaseUnit(values.lines[0]?.productUnitId ?? initialProductUnitId)?.unitName ?? ""),
                unitFactor:
                  values.lines[0]?.unitFactor ??
                  getDefaultPurchaseUnitFactor(
                    values.lines[0]?.productUnitId ?? initialProductUnitId,
                    values.lines[0]?.unitName || getDefaultPurchaseUnit(values.lines[0]?.productUnitId ?? initialProductUnitId)?.unitName
                  ),
                actualBaseQuantity: undefined,
                destinationType: values.lines[0]?.destinationType ?? "warehouse",
                customerId: values.lines[0]?.customerId ?? state.customers[0]?.id ?? ""
              }]
              });
              setDocumentImage(null);
            }, documentImage ?? undefined);
          })}
        >
          <FormField label="Nhà cung cấp">
            <select className="input" {...register("supplierId", { required: "Chọn nhà cung cấp." })}>
              {state.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} · {supplier.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <div className="document-lines">
            {fields.map((field, index) => (
              <fieldset className="document-line" key={field.id}>
                <div className="document-line-header">
                  <legend>Dòng {index + 1}</legend>
                  <button className="button button-small" type="button" disabled={fields.length === 1 || isPending} onClick={() => remove(index)}>
                    <Trash2 aria-hidden="true" />
                    Xóa dòng
                  </button>
                </div>
                <FormField label="Vật tư" error={errors.lines?.[index]?.productUnitId?.message}>
                    <select className="input" {...register(`lines.${index}.productUnitId`, {
                      required: "Chọn vật tư.",
                      onChange: (event) => {
                      const nextProductUnitId = event.target.value;
                      const nextUnit = getDefaultPurchaseUnit(nextProductUnitId);
                      setValue(`lines.${index}.unitName`, nextUnit?.unitName ?? "");
                      setValue(`lines.${index}.unitFactor`, getDefaultPurchaseUnitFactor(nextProductUnitId, nextUnit?.unitName));
                        setValue(`lines.${index}.actualBaseQuantity`, undefined);
                      }
                    })}>
                    {state.productUnits.map((product) => <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>)}
                  </select>
                </FormField>
                <ProductCatalogPreview state={state} productUnitId={watchedLines?.[index]?.productUnitId ?? ""} />
                <div className="document-line-grid">
                  <FormField label="Đơn vị mua">
                    <select className="input" {...register(`lines.${index}.unitName`, {
                      required: "Chọn đơn vị mua.",
                      onChange: (event) => {
                        const configured = configuredPurchaseUnit(
                          state,
                          watchedLines?.[index]?.productUnitId ?? "",
                         event.target.value
                       );
                        setValue(
                          `lines.${index}.unitFactor`,
                          configured?.conversionMode === "fixed" ? configured.factorToBase ?? 1 : undefined,
                          { shouldValidate: true }
                        );
                        setValue(`lines.${index}.actualBaseQuantity`, undefined);
                      }
                    })}>
                      <option value="" disabled>Chá»n Ä‘Æ¡n vá»‹ mua</option>
                      {purchaseDocumentUnitOptions(state, watchedLines?.[index]?.productUnitId ?? "").map((unit) => (
                        <option key={unit} value={unit}>{displayUnitName(unit)}</option>
                      ))}
                    </select>
                  </FormField>
                  {isVariablePurchaseUnit(state, watchedLines?.[index]?.productUnitId ?? "", watchedLines?.[index]?.unitName) ? (
                    <FormField
                      label={`Tổng ${displayUnitName(productBaseUnit(state, watchedLines?.[index]?.productUnitId ?? ""))} thực nhận`}
                      error={errors.lines?.[index]?.actualBaseQuantity?.message}
                    >
                      <input
                        className="input"
                        type="number"
                        min="0.001"
                        step="0.001"
                        {...register(`lines.${index}.actualBaseQuantity`, {
                          valueAsNumber: true,
                          required: "Nhập số lượng thực nhận.",
                          min: { value: 0.001, message: "Số lượng thực nhận phải lớn hơn 0." }
                        })}
                      />
                    </FormField>
                  ) : (
                    <FormField
                      label={`Quy đổi 1 ${displayUnitName(watchedLines?.[index]?.unitName)} về ${displayUnitName(productBaseUnit(state, watchedLines?.[index]?.productUnitId ?? ""))}`}
                      error={errors.lines?.[index]?.unitFactor?.message}
                    >
                      <input
                        className="input"
                        type="number"
                        min="0.001"
                        step="0.001"
                        readOnly
                        title="Hệ số được quản lý tại Danh mục > Cài đặt đơn vị mua."
                        {...register(`lines.${index}.unitFactor`, { valueAsNumber: true, min: { value: 0.001, message: "Hệ số phải lớn hơn 0." } })}
                      />
                    </FormField>
                  )}
                </div>
                <FormField label="Điểm nhận">
                  <select className="input" {...register(`lines.${index}.destinationType`)}>
                    <option value="warehouse">Kho cửa hàng</option>
                    <option value="customer_direct">Giao thẳng khách</option>
                  </select>
                </FormField>
                {watchedLines?.[index]?.destinationType === "customer_direct" ? (
                  <FormField label="Khách nhận">
                    <select className="input" {...register(`lines.${index}.customerId`, { required: "Chọn khách nhận." })}>
                      {state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}
                    </select>
                  </FormField>
                ) : null}
                <div className="document-line-grid">
                  <FormField label={`Số lượng mua (${displayUnitName(watchedLines?.[index]?.unitName)})`} error={errors.lines?.[index]?.orderedQuantity?.message}>
                    <input className="input" type="number" min="0.001" step="0.001" {...register(`lines.${index}.orderedQuantity`, {
                      valueAsNumber: true,
                      min: { value: 0.001, message: "Số lượng mua phải lớn hơn 0." }
                    })} />
                  </FormField>
                  <FormField label={`Giá mua / ${displayUnitName(watchedLines?.[index]?.unitName)}`} error={errors.lines?.[index]?.unitCost?.message}>
                    <input className="input" type="number" min="0" step="1" {...register(`lines.${index}.unitCost`, {
                      valueAsNumber: true,
                      min: { value: 0, message: "Giá mua không được âm." }
                    })} />
                  </FormField>
                  <FormField label="VAT">
                    <select className="input" {...register(`lines.${index}.taxRate`, { valueAsNumber: true })}>
                      <option value="0">0%</option><option value="0.05">5%</option><option value="0.08">8%</option><option value="0.1">10%</option>
                    </select>
                  </FormField>
                </div>
                <p className="conversion-note">{documentConversionPreview(state, watchedLines?.[index])}</p>
              </fieldset>
            ))}
          </div>
          <button className="button" type="button" disabled={isPending} onClick={() => append({
            productUnitId: state.productUnits[0]?.id ?? "", orderedQuantity: 1, unitCost: 0, taxRate: 0.1,
            unitName: getDefaultPurchaseUnit(state.productUnits[0]?.id ?? "")?.unitName ?? "",
            unitFactor: getDefaultPurchaseUnitFactor(state.productUnits[0]?.id ?? ""),
            actualBaseQuantity: undefined,
            destinationType: "warehouse", customerId: state.customers[0]?.id ?? ""
          })}>
            <PlusCircle aria-hidden="true" />
            Thêm dòng mua
          </button>
          <FormField label="Ảnh chứng từ mua (không bắt buộc)">
            <input
              className="input file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(event) => setDocumentImage(event.target.files?.[0] ?? null)}
            />
            {documentImage ? <p className="panel-note">{documentImage.name} · {(documentImage.size / 1024 / 1024).toFixed(1)} MB</p> : null}
          </FormField>
          <SubmitButton label="Tạo đơn mua" command="createPurchaseOrderDraft" isPending={isPending} disabled={disabled} />
        </form>
      </div>
    </section>
  );
}

function DeliveryJobForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const drivers = state.employees.filter((employee) => employee.roleType === "driver" && employee.status === "active");
  const vehicles = state.vehicles.filter((vehicle) => vehicle.status === "active");
  const eligibleOrders = state.salesOrders.filter((order) =>
    (order.status === "allocated" || order.status === "partially_delivered") &&
    order.lines.some((line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity) &&
    !state.deliveryJobs.some((job) => job.salesOrderId === order.id && ["assigned", "loading", "in_transit"].includes(job.status))
  );
  const { register, handleSubmit, reset } = useForm<{ salesOrderId: string; driverId: string; vehicleId: string; plannedDate: string }>({
    defaultValues: {
      salesOrderId: eligibleOrders[0]?.id ?? "",
      driverId: drivers[0]?.id ?? "",
      vehicleId: vehicles[0]?.id ?? "",
      plannedDate: localDateValue()
    }
  });
  const disabled = isPending || eligibleOrders.length === 0 || drivers.length === 0 || vehicles.length === 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Tạo chuyến giao</h3>
          <p className="panel-note">Chuyến mới ở trạng thái đã phân công, chưa ghi xuất kho.</p>
        </div>
      </div>
      <div className="panel-body">
        <form
          className="command-form"
          noValidate
          onSubmit={handleSubmit((values) => {
            createCommand({ type: "createDeliveryJob", ...values });
            reset({ salesOrderId: values.salesOrderId, driverId: values.driverId, vehicleId: values.vehicleId, plannedDate: values.plannedDate });
          })}
        >
          <FormField label="Đơn bán">
            <select className="input" {...register("salesOrderId", { required: true })}>
              {eligibleOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.documentNo} · {partyName(state, order.customerId)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Tài xế">
            <select className="input" {...register("driverId", { required: true })}>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Xe giao hàng">
            <select className="input" {...register("vehicleId", { required: true })}>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.code} · {vehicle.plateNumber} · {formatQuantity(vehicle.capacityTons)} tấn
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Ngày giao">
            <input className="input" type="date" {...register("plannedDate", { required: true })} />
          </FormField>
          <SubmitButton label="Tạo chuyến" command="createDeliveryJob" isPending={isPending} disabled={disabled} />
        </form>
      </div>
    </section>
  );
}

function CustomerPaymentDraftForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<{ customerId: string; amount: number }>({
    defaultValues: { customerId: state.customers[0]?.id ?? "", amount: 0 }
  });
  const disabled = isPending || state.customers.length === 0;

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
              {state.customers.map((customer) => (
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

function SupplierPaymentDraftForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<{ supplierId: string; amount: number }>({
    defaultValues: { supplierId: state.suppliers[0]?.id ?? "", amount: 0 }
  });
  const disabled = isPending || state.suppliers.length === 0;

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
              {state.suppliers.map((supplier) => (
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

function WorkOrderDraftForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const activeEmployees = state.employees.filter((employee) => employee.status === "active");
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors }
  } = useForm<{ employeeId: string; productUnitId: string; actualQuantity: number; totalAmount: number }>({
    defaultValues: {
      employeeId: activeEmployees[0]?.id ?? "",
      productUnitId: state.productUnits[0]?.id ?? "",
      actualQuantity: 1,
      totalAmount: 0
    }
  });
  const selectedProductUnitId = watch("productUnitId");
  const disabled = isPending || activeEmployees.length === 0 || state.productUnits.length === 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Tạo phiếu công</h3>
          <p className="panel-note">Sản lượng phải được duyệt trước khi ghi nhận bảng công.</p>
        </div>
      </div>
      <div className="panel-body">
        <form
          className="command-form"
          noValidate
          onSubmit={handleSubmit((values) => {
            createCommand({
              type: "createWorkOrderDraft",
              employeeId: values.employeeId,
              productUnitId: values.productUnitId,
              actualQuantity: values.actualQuantity,
              totalAmount: values.totalAmount
            });
            reset({
              employeeId: values.employeeId,
              productUnitId: values.productUnitId,
              actualQuantity: 1,
              totalAmount: 0
            });
          })}
        >
          <FormField label="Nhân viên">
            <select className="input" {...register("employeeId", { required: true })}>
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.displayName} · {roleText(employee.roleType)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Sản lượng">
            <select className="input" {...register("productUnitId", { required: true })}>
              {state.productUnits.map((product) => (
                <option key={product.id} value={product.id}>
                  {productLabel(state, product.id)}
                </option>
              ))}
            </select>
          </FormField>
          <ProductCatalogPreview state={state} productUnitId={selectedProductUnitId} />
          <FormField label="Số lượng thực tế" error={errors.actualQuantity?.message}>
            <input
              className="input"
              type="number"
              min="0.001"
              step="0.001"
              {...register("actualQuantity", {
                valueAsNumber: true,
                min: { value: 0.001, message: "Sản lượng phải lớn hơn 0." }
              })}
            />
          </FormField>
          <FormField label="Tổng tiền công" error={errors.totalAmount?.message}>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              {...register("totalAmount", {
                valueAsNumber: true,
                min: { value: 1, message: "Tổng tiền công phải lớn hơn 0." }
              })}
            />
          </FormField>
          <SubmitButton label="Tạo phiếu công" command="createWorkOrderDraft" isPending={isPending} disabled={disabled} />
        </form>
      </div>
    </section>
  );
}

function ImportIssueForm({
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

function FormField({
  label,
  error,
  children
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

function ProductCatalogPreview({ state, productUnitId }: { state: OperationsState; productUnitId: string }) {
  const product = state.productUnits.find((item) => item.id === productUnitId);
  if (!product) {
    return null;
  }

  return (
    <dl className="reference-grid">
      <div className="reference-item">
        <dt>Mã vật tư</dt>
        <dd>{product.productCode}</dd>
      </div>
      <div className="reference-item">
        <dt>Tên vật tư</dt>
        <dd>{product.productName}</dd>
      </div>
      <div className="reference-item">
        <dt>Đơn vị tồn kho</dt>
        <dd>{displayUnitName(product.unitName)}</dd>
      </div>
      <div className="reference-item">
        <dt>Tồn kho</dt>
        <dd>{formatQuantity(stockBalance(state, "wh-main", product.id))} {displayUnitName(product.unitName)}</dd>
      </div>
    </dl>
  );
}

function SubmitButton({
  label,
  command,
  isPending,
  disabled = isPending
}: {
  label: string;
  command: DomainCommandName;
  isPending: boolean;
  disabled?: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const permission = operationsErpRegistry.commandByName.get(command)?.permission;
  const authorized = !permission || actor.permissions.includes(permission);
  return (
    <button
      className="button button-primary command-submit"
      type="submit"
      disabled={disabled || !authorized}
      title={authorized ? undefined : `${actor.displayName} không có quyền ${permission}.`}
    >
      <PlusCircle aria-hidden="true" />
      {isPending ? "Đang lưu..." : label}
    </button>
  );
}

function WorkflowActionButton({
  operation,
  state,
  runOperation,
  isPending,
  label,
  targetId
}: {
  operation: OperationName;
  state: OperationsState;
  runOperation: OperationHandler;
  isPending: boolean;
  label?: string;
  targetId?: string;
}) {
  const actor = useContext(OperationsActorContext);
  const readiness = canRunOperation(state, operation, targetId, actor);
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [quantity, setQuantity] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [evidence, setEvidence] = useState("");
  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [lineQuantities, setLineQuantities] = useState<Record<string, string>>({});
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const needsReason = [
    "reverseInventoryMovement",
    "reverseDirectDelivery",
    "failDelivery",
    "reverseCustomerPayment",
    "reverseSupplierPayment",
    "reverseCashVoucher",
    "reverseEmployeePayment",
    "reverseEmployeeAdvance",
    "rejectGoodsReceipt",
    "rejectDeliveryCompletion"
  ].includes(operation);
  const needsQuantity = operation === "postGoodsReceipt" || operation === "submitGoodsReceipt" || operation === "confirmDirectDelivery";
  const needsReceiptImage = operation === "submitGoodsReceipt";
  const needsDeliveryConfirmation = operation === "completeDelivery" || operation === "submitDeliveryCompletion";
  const needsPaymentAllocation = operation === "allocateCustomerPayment" || operation === "allocateSupplierPayment";
  const needsDetails = needsReason || needsQuantity || needsReceiptImage || needsDeliveryConfirmation || needsPaymentAllocation;
  const deliveryJob = targetId ? state.deliveryJobs.find((job) => job.id === targetId) : undefined;
  const deliveryOrder = deliveryJob ? state.salesOrders.find((order) => order.id === deliveryJob.salesOrderId) : undefined;
  const openDeliveryLines = deliveryOrder?.lines.filter(
    (line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity
  ) ?? [];
  const targetPurchase = targetId && needsQuantity ? findPurchaseLineForUi(state, targetId) : undefined;
  const allocationPayment = operation === "allocateCustomerPayment"
    ? state.customerPayments.find((payment) => payment.id === targetId)
    : operation === "allocateSupplierPayment"
      ? state.supplierPayments.find((payment) => payment.id === targetId)
      : undefined;
  const openPaymentObligations = operation === "allocateCustomerPayment" && allocationPayment && "customerId" in allocationPayment
    ? getOpenCustomerDebtObligations(state, allocationPayment.customerId)
    : operation === "allocateSupplierPayment" && allocationPayment && "supplierId" in allocationPayment
      ? getOpenSupplierDebtObligations(state, allocationPayment.supplierId)
      : [];
  const allocationAvailable = allocationPayment ? paymentUnallocatedAmount(allocationPayment) : 0;

  function openDetails() {
    if (needsQuantity && !quantity && targetId) {
      const purchase = findPurchaseLineForUi(state, targetId);
      if (purchase) {
        setQuantity(String((purchase.line.orderedQuantity - purchase.line.receivedQuantity) / lineDocumentFactor(purchase.line)));
      }
    }
    if (needsDeliveryConfirmation && Object.keys(lineQuantities).length === 0) {
      setLineQuantities(Object.fromEntries(openDeliveryLines.map((line) => [line.id, String((line.quantity - line.deliveredQuantity) / lineDocumentFactor(line))])));
    }
    if (needsPaymentAllocation && Object.keys(allocationAmounts).length === 0) {
      setAllocationAmounts(defaultAllocationAmounts(openPaymentObligations, allocationAvailable));
    }
    setExpanded(true);
  }

  function submitDetails() {
    const options: OperationOptions = {};
    if (needsReason) {
      options.reason = reason;
    }
    if (needsQuantity) {
      options.quantity = Number(quantity) * (targetPurchase ? lineDocumentFactor(targetPurchase.line) : 1);
    }
    if (needsDeliveryConfirmation) {
      options.recipientName = recipientName;
      options.evidence = evidence;
      options.lineQuantities = Object.fromEntries(
        Object.entries(lineQuantities)
          .map(([lineId, value]) => {
            const line = openDeliveryLines.find((candidate) => candidate.id === lineId);
            return [lineId, Number(value) * (line ? lineDocumentFactor(line) : 1)];
          })
          .filter(([, value]) => Number(value) > 0)
      );
    }
    if (needsPaymentAllocation) {
      options.allocations = Object.entries(allocationAmounts)
        .map(([ledgerEntryId, amount]) => ({ ledgerEntryId, amount: Number(amount) }))
        .filter((allocation) => allocation.amount > 0);
    }
    runOperation(operation, targetId, options, () => setExpanded(false), receiptImage ?? undefined);
  }

  return (
    <div className="workflow-action">
      <button
        className="button button-small table-action"
        type="button"
        disabled={!readiness.canRun || isPending}
        title={readiness.canRun ? operationDescriptions[operation] : readiness.reason}
        aria-expanded={needsDetails ? expanded : undefined}
        onClick={() => needsDetails ? openDetails() : runOperation(operation, targetId)}
      >
        {label ?? operationLabels[operation]}
      </button>
      {expanded ? (
        <div className="inline-action-form">
          {needsReason ? (
            <FormField label="Lý do bắt buộc">
              <textarea className="input" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
            </FormField>
          ) : null}
          {needsQuantity ? (
            <>
              <FormField label={`Số lượng thực tế (${displayUnitName(targetPurchase ? lineDocumentUnitName(state, targetPurchase.line) : undefined)})`}>
                <input className="input" type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </FormField>
              {targetPurchase && lineDocumentFactor(targetPurchase.line) !== 1 ? (
                <p className="conversion-note">Hệ thống sẽ ghi {formatQuantity(Number(quantity || 0) * lineDocumentFactor(targetPurchase.line))} {displayUnitName(productBaseUnit(state, targetPurchase.line.productUnitId))} vào sổ.</p>
              ) : null}
            </>
          ) : null}
          {needsReceiptImage ? (
            <FormField label="Ảnh thực nhận bắt buộc">
              <input
                className="input file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(event) => setReceiptImage(event.target.files?.[0] ?? null)}
              />
              <p className="conversion-note">Chụp rõ hàng, xe hoặc phiếu cân để Chủ cửa hàng/Kế toán kiểm tra trước khi duyệt.</p>
              {receiptImage ? <p className="muted">Đã chọn: {receiptImage.name}</p> : null}
            </FormField>
          ) : null}
          {needsDeliveryConfirmation ? (
            <>
              <FormField label="Người nhận">
                <input className="input" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
              </FormField>
              <FormField label="Bằng chứng giao nhận">
                <input className="input" placeholder="Số phiếu, ảnh hoặc chữ ký" value={evidence} onChange={(event) => setEvidence(event.target.value)} />
              </FormField>
              {openDeliveryLines.map((line) => (
                <FormField key={line.id} label={`${productLabel(state, line.productUnitId)} · thực giao (${displayUnitName(lineDocumentUnitName(state, line))})`}>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max={(line.quantity - line.deliveredQuantity) / lineDocumentFactor(line)}
                    step="0.001"
                    value={lineQuantities[line.id] ?? ""}
                    onChange={(event) => setLineQuantities((current) => ({ ...current, [line.id]: event.target.value }))}
                  />
                </FormField>
              ))}
            </>
          ) : null}
          {needsPaymentAllocation ? (
            <>
              <p className="allocation-summary">
                Có thể phân bổ {formatMoney(allocationAvailable)}. Kiểm tra số tiền từng chứng từ trước khi xác nhận.
              </p>
              <div className="allocation-list">
                {openPaymentObligations.map((obligation) => (
                  <div className="allocation-row" key={obligation.ledgerEntryId}>
                    <div>
                      <strong>{obligation.sourceDocument}</strong>
                      <span>{formatDateTime(obligation.postingDate)} · còn {formatMoney(obligation.openAmount)}</span>
                    </div>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max={obligation.openAmount}
                      step="1"
                      aria-label={`Phân bổ vào ${obligation.sourceDocument}`}
                      value={allocationAmounts[obligation.ledgerEntryId] ?? ""}
                      onChange={(event) => setAllocationAmounts((current) => ({ ...current, [obligation.ledgerEntryId]: event.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <div className="table-actions">
            <button className="button button-small button-primary" type="button" disabled={isPending || (needsReceiptImage && !receiptImage)} onClick={submitDetails}>Xác nhận</button>
            <button className="button button-small" type="button" disabled={isPending} onClick={() => setExpanded(false)}>Hủy</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ApprovalAttachmentPreview({
  attachments,
  emptyText = "Thiếu ảnh"
}: {
  attachments?: OperationsAttachment[];
  emptyText?: string;
}) {
  if (!attachments || attachments.length === 0) {
    return emptyText ? <span className="muted">{emptyText}</span> : null;
  }
  return (
    <div className="approval-attachments" aria-label="Ảnh đính kèm phiếu nhập">
      {attachments.map((attachment) => (
        <a key={attachment.id} href={`/api/operations/attachments/${attachment.id}`} target="_blank" rel="noreferrer" title={`Mở ${attachment.fileName}`}>
          <img src={`/api/operations/attachments/${attachment.id}`} alt={`Ảnh ${attachment.fileName}`} loading="lazy" />
        </a>
      ))}
    </div>
  );
}

function OperationRow({
  operation,
  state,
  index,
  onRun,
  isPending
}: {
  operation: OperationName;
  state: OperationsState;
  index: number;
  onRun: OperationHandler;
  isPending: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const readiness = canRunOperation(state, operation, undefined, actor);
  const completed = state.processedOperations.some((item) => item.operation === operation) && !readiness.canRun;
  const requiresDocumentInput = [
    "submitGoodsReceipt",
    "postGoodsReceipt",
    "postInventoryTransfer",
    "postInventoryCountAdjustment",
    "reverseInventoryMovement",
    "confirmDirectDelivery",
    "reverseDirectDelivery",
    "completeDelivery",
    "failDelivery",
    "allocateCustomerPayment",
    "allocateSupplierPayment",
    "reverseCustomerPayment",
    "reverseSupplierPayment",
    "reverseCashVoucher",
    "reverseEmployeePayment",
    "confirmEmployeeAdvance",
    "submitDeliveryCompletion",
    "reverseEmployeeAdvance"
  ].includes(operation);

  return (
    <div className={completed ? "timeline-item timeline-item-done" : "timeline-item"}>
      <div className="timeline-index">{completed ? <CheckCircle2 aria-hidden="true" /> : index}</div>
      <div className="timeline-content">
        <p className="timeline-title">{operationLabels[operation]}</p>
        <p className="timeline-text">{completed ? "Đã xử lý" : operationDescriptions[operation]}</p>
        {!readiness.canRun && !completed ? <p className="timeline-reason">{readiness.reason}</p> : null}
      </div>
      {requiresDocumentInput ? (
        <span className="muted">Thực hiện tại dòng chứng từ</span>
      ) : (
        <button className="button button-small" type="button" disabled={!readiness.canRun || isPending} onClick={() => onRun(operation)}>
          Chạy
        </button>
      )}
    </div>
  );
}

function AuditList({ state }: { state: OperationsState }) {
  return (
    <div className="panel-body">
      <ul className="audit-list">
        {state.auditLogs.slice(0, 8).map((event) => (
          <li className="audit-item" key={event.id}>
            <p className="audit-title">{event.summary}</p>
            <p className="audit-text">
              {event.actorName} · {formatDateTime(event.occurredAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntityPanel({ title, headers, rows }: { title: string; headers: string[]; rows: ReactNode[][] }) {
  return (
    <section className="panel span-6">
      <div className="panel-header">
        <h3 className="panel-title">{title}</h3>
      </div>
      <div className="panel-body">
        <DataTable headers={headers} rows={rows} />
      </div>
    </section>
  );
}

function DataTable({
  headers,
  rows,
  emptyText = "Chưa có dữ liệu.",
  className = ""
}: {
  headers: string[];
  rows: ReactNode[][];
  emptyText?: string;
  className?: string;
}) {
  if (rows.length === 0) {
    return <p className="empty-text">{emptyText}</p>;
  }

  return (
    <div className="table-wrap">
      <table className={`data-table ${className}`.trim()}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th scope="col" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-item">
      <p className="summary-label">{label}</p>
      <p className="summary-value">{value}</p>
    </div>
  );
}

function Metric({ label, value, metricId }: { label: string; value: string; metricId?: string }) {
  return (
    <div className="metric" data-metric-id={metricId}>
      <p className="summary-label">{label}</p>
      <p className="metric-value">{value}</p>
    </div>
  );
}

function StatusBadge({ value, tone }: { value: string; tone: "success" | "warning" }) {
  return (
    <span className={tone === "success" ? "status status-confirmed" : "status status-draft"}>
      {tone === "success" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
      {value}
    </span>
  );
}

function canRunOperation(state: OperationsState, operation: OperationName, targetId?: string, actor?: OperationsActor): { canRun: boolean; reason?: string } {
  const permission = operationsErpRegistry.commandByName.get(operation)?.permission;
  if (actor && permission && !actor.permissions.includes(permission)) {
    return { canRun: false, reason: `${actor.displayName} không có quyền ${permission}.` };
  }

  const targetSalesOrder = targetId ? state.salesOrders.find((item) => item.id === targetId) : undefined;
  const order = targetSalesOrder ?? state.salesOrders.find((item) => item.status === "draft") ?? state.salesOrders[0];
  const confirmedOrder = targetSalesOrder?.status === "confirmed" ? targetSalesOrder : state.salesOrders.find((item) => item.status === "confirmed");
  const targetPurchase = targetId ? findPurchaseLineForUi(state, targetId) : undefined;
  const targetInventoryMovement = targetId ? state.inventoryMovements.find((movement) => movement.id === targetId || movement.postingKey === targetId) : undefined;
  const poWarehouse = state.purchaseOrders.find((item) =>
    item.status !== "draft" && item.lines.some((line) => line.destinationType === "warehouse" && line.receivedQuantity < line.orderedQuantity)
  );
  const poDirect = state.purchaseOrders.find((item) =>
    item.status !== "draft" && item.lines.some((line) => line.destinationType === "customer_direct" && line.receivedQuantity < line.orderedQuantity)
  );
  const deliveryJobCanMove = (job: OperationsState["deliveryJobs"][number]) => {
    const salesOrder = state.salesOrders.find((item) => item.id === job.salesOrderId);
    return Boolean(
      salesOrder &&
        (salesOrder.status === "allocated" || salesOrder.status === "partially_delivered") &&
        salesOrder.lines.some((line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity)
    );
  };
  const findDeliveryByStatus = (statuses: string[]) => state.deliveryJobs.find((job) => statuses.includes(job.status) && deliveryJobCanMove(job));
  const deliveryAssigned = findDeliveryByStatus(["assigned"]);
  const deliveryLoading = findDeliveryByStatus(["loading"]);
  const deliveryInTransit = findDeliveryByStatus(["in_transit"]);
  const deliveryActive = findDeliveryByStatus(["assigned", "loading", "in_transit"]);
  const targetDelivery = targetId ? state.deliveryJobs.find((job) => job.id === targetId) : undefined;
  const targetDeliveryOrder = targetDelivery ? state.salesOrders.find((item) => item.id === targetDelivery.salesOrderId) : undefined;
  const targetCustomerPayment = targetId ? state.customerPayments.find((payment) => payment.id === targetId) : undefined;
  const customerPayment =
    state.customerPayments.find((payment) => payment.status === "draft" && state.customerLedgerEntries.some((entry) => entry.customerId === payment.customerId && entry.direction === "debit")) ??
    state.customerPayments[0];
  const confirmedCustomerPayment = targetCustomerPayment && ["confirmed", "partially_allocated"].includes(targetCustomerPayment.status)
    ? targetCustomerPayment
    : state.customerPayments.find((payment) => ["confirmed", "partially_allocated"].includes(payment.status) && payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0) < payment.amount);
  const targetSupplierPayment = targetId ? state.supplierPayments.find((payment) => payment.id === targetId) : undefined;
  const supplierPayment =
    state.supplierPayments.find((payment) => payment.status === "draft" && supplierBalance(state.supplierLedgerEntries, payment.supplierId) >= payment.amount) ??
    state.supplierPayments[0];
  const targetCashVoucher = targetId ? state.cashVouchers.find((voucher) => voucher.id === targetId) : undefined;
  const cashVoucher = targetCashVoucher ?? state.cashVouchers.find((voucher) => voucher.status === "draft") ?? state.cashVouchers[0];
  const targetWorkOrder = targetId ? state.workOrders.find((item) => item.id === targetId) : undefined;
  const workOrder = targetWorkOrder ?? state.workOrders.find((item) => item.status === "submitted") ?? state.workOrders[0];
  const approvedWorkOrder = targetWorkOrder?.status === "approved" ? targetWorkOrder : state.workOrders.find((item) => item.status === "approved");
  const compensation = state.compensationBatches.find((item) => item.status === "draft" && item.lines.length === 0) ?? state.compensationBatches[0];
  const targetEmployeePayment = targetId ? state.employeePayments.find((payment) => payment.id === targetId) : undefined;
  const employeePayment =
    state.employeePayments.find((payment) => payment.status === "draft" && employeeBalance(state, payment.employeeId) >= payment.amount && cashBalance(state) >= payment.amount) ??
    state.employeePayments[0];
  const targetEmployeeAdvance = targetId ? state.employeeAdvances.find((advance) => advance.id === targetId) : undefined;
  const employeeAdvance = targetEmployeeAdvance ?? state.employeeAdvances.find((advance) => advance.status === "draft") ?? state.employeeAdvances[0];
  const targetImportIssue = targetId ? state.importIssues.find((issue) => issue.id === targetId) : undefined;

  switch (operation) {
    case "confirmSalesOrder":
      if (targetId && !targetSalesOrder) {
        return { canRun: false, reason: "Không tìm thấy đơn bán." };
      }
      return order.status === "draft" ? { canRun: true } : { canRun: false, reason: "Đơn bán đã xác nhận." };
    case "allocateSalesSources":
      if (targetId) {
        if (!targetSalesOrder) {
          return { canRun: false, reason: "Không tìm thấy đơn bán." };
        }
        return targetSalesOrder.status === "confirmed" ? { canRun: true } : { canRun: false, reason: "Cần xác nhận đơn bán trước." };
      }
      return confirmedOrder ? { canRun: true } : { canRun: false, reason: "Cần xác nhận đơn bán trước." };
    case "confirmPurchaseOrder": {
      const targetOrder = targetId ? state.purchaseOrders.find((item) => item.id === targetId) : state.purchaseOrders.find((item) => item.status === "draft");
      return targetOrder?.status === "draft"
        ? { canRun: true }
        : { canRun: false, reason: targetId ? "Đơn mua không còn ở trạng thái nháp." : "Không còn đơn mua nháp." };
    }
    case "submitGoodsReceipt":
      if (targetId) {
        if (!targetPurchase) {
          return { canRun: false, reason: "Khong tim thay dong mua." };
        }
        const hasPendingReceipt = state.approvalRequests.some((request) =>
          request.type === "goods_receipt" && request.status === "pending" && (request.targetId === targetId || request.id === targetId)
        );
        return !hasPendingReceipt && targetPurchase.purchaseOrder.status !== "draft" && targetPurchase.line.destinationType === "warehouse" && Boolean(targetPurchase.line.warehouseId) && targetPurchase.line.receivedQuantity < targetPurchase.line.orderedQuantity
          ? { canRun: true }
          : { canRun: false, reason: hasPendingReceipt ? "Dong mua dang cho duyet." : "Dong mua chua san sang nhan kho." };
      }
      return poWarehouse && !poWarehouse.lines.some((line) => state.approvalRequests.some((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id))
        ? { canRun: true }
        : { canRun: false, reason: "Chua co dong mua nhan kho san sang." };
    case "approveGoodsReceipt":
    case "rejectGoodsReceipt": {
      if (actor && actor.role !== "owner" && actor.role !== "accountant") {
        return { canRun: false, reason: "Chi Chu cua hang hoac Ke toan duoc duyet." };
      }
      const request = state.approvalRequests.find((item) => item.type === "goods_receipt" && item.status === "pending" && (!targetId || item.id === targetId || item.targetId === targetId));
      return request ? { canRun: true } : { canRun: false, reason: "Khong co phieu nhap dang cho duyet." };
    }
    case "postGoodsReceipt":
      if (targetId) {
        if (!targetPurchase) {
          return { canRun: false, reason: "Không tìm thấy dòng mua." };
        }
        if (state.approvalRequests.some((request) => request.type === "goods_receipt" && request.status === "pending" && (request.targetId === targetId || request.id === targetId))) {
          return { canRun: false, reason: "Dong mua dang cho Chu cua hang hoac Ke toan duyet." };
        }
        return targetPurchase.purchaseOrder.status !== "draft" && targetPurchase.line.destinationType === "warehouse" && Boolean(targetPurchase.line.warehouseId) && targetPurchase.line.receivedQuantity < targetPurchase.line.orderedQuantity
          ? { canRun: true }
          : { canRun: false, reason: targetPurchase.purchaseOrder.status === "draft" ? "Cần xác nhận đơn mua trước." : "Dòng mua này không còn cần nhập kho." };
      }
      if (!poWarehouse) {
        return { canRun: false, reason: "Chưa có đơn mua nhập kho." };
      }
      return { canRun: true };
    case "postInventoryTransfer":
      return state.warehouses.length >= 2 && state.productUnits.length > 0
        ? { canRun: true }
        : { canRun: false, reason: "Cần ít nhất hai kho và một vật tư để chuyển kho." };
    case "postInventoryCountAdjustment":
      return state.warehouses.length > 0 && state.productUnits.length > 0
        ? { canRun: true }
        : { canRun: false, reason: "Cần kho và vật tư để kiểm kê." };
    case "reverseInventoryMovement":
      if (!targetId) {
        return { canRun: false, reason: "Chọn phát sinh kho cụ thể để đảo." };
      }
      if (!targetInventoryMovement) {
        return { canRun: false, reason: "Không tìm thấy phát sinh kho." };
      }
      if (targetInventoryMovement.reversedById) {
        return { canRun: false, reason: "Phát sinh kho đã được đảo." };
      }
      if (targetInventoryMovement.movementType === "opening" || targetInventoryMovement.movementType === "reverse") {
        return { canRun: false, reason: "Tồn đầu kỳ và dòng đảo không được đảo bằng thao tác này." };
      }
      return stockBalance(state, targetInventoryMovement.warehouseId, targetInventoryMovement.productUnitId) - targetInventoryMovement.quantity >= 0
        ? { canRun: true }
        : { canRun: false, reason: "Đảo phát sinh này sẽ làm âm tồn kho." };
    case "confirmDirectDelivery":
      if (targetId) {
        if (!targetPurchase) {
          return { canRun: false, reason: "Không tìm thấy dòng mua." };
        }
        const hasLinkedDirectSalesLine = state.salesOrders.some(
          (salesOrder) =>
            (salesOrder.status === "allocated" || salesOrder.status === "partially_delivered") &&
            salesOrder.lines.some(
              (line) =>
                line.productUnitId === targetPurchase.line.productUnitId &&
                line.deliveredQuantity < line.quantity &&
                (line.purchaseOrderLineId === targetPurchase.line.id || line.sourceType === "direct_supplier")
            )
        );
        return targetPurchase.purchaseOrder.status !== "draft" && targetPurchase.line.destinationType === "customer_direct" && targetPurchase.line.receivedQuantity < targetPurchase.line.orderedQuantity && hasLinkedDirectSalesLine
          ? { canRun: true }
          : { canRun: false, reason: targetPurchase.purchaseOrder.status === "draft" ? "Cần xác nhận đơn mua trước." : "Cần phân bổ nguồn giao thẳng trước." };
      }
      if (!poDirect) {
        return { canRun: false, reason: "Chưa có đơn mua giao thẳng." };
      }
      return poDirect.status !== "fully_received" && state.salesOrders.some((item) => item.status === "allocated" || item.status === "partially_delivered")
        ? { canRun: true }
        : { canRun: false, reason: "Cần phân bổ nguồn và dòng giao thẳng chưa xác nhận." };
    case "reverseDirectDelivery":
      if (!targetId || !targetPurchase) {
        return { canRun: false, reason: "Chọn dòng mua giao thẳng đã ghi nhận để đảo." };
      }
      return targetPurchase.line.destinationType === "customer_direct" && targetPurchase.line.receivedQuantity > 0
        ? { canRun: true }
        : { canRun: false, reason: "Dòng mua chưa có lần giao thẳng để đảo." };
    case "startDeliveryLoading":
      if (targetId) {
        if (!targetDelivery || !targetDeliveryOrder) {
          return { canRun: false, reason: "Không tìm thấy chuyến giao." };
        }
        return targetDelivery.status === "assigned" && deliveryJobCanMove(targetDelivery)
          ? { canRun: true }
          : { canRun: false, reason: "Chuyến này chưa sẵn sàng bốc hàng." };
      }
      return deliveryAssigned ? { canRun: true } : { canRun: false, reason: "Cần chuyến giao đã phân công và đơn đã phân bổ qua kho." };
    case "dispatchDelivery":
      if (targetId) {
        if (!targetDelivery || !targetDeliveryOrder) {
          return { canRun: false, reason: "Không tìm thấy chuyến giao." };
        }
        return targetDelivery.status === "loading" && deliveryJobCanMove(targetDelivery)
          ? { canRun: true }
          : { canRun: false, reason: "Cần bốc hàng trước khi xuất bến." };
      }
      return deliveryLoading ? { canRun: true } : { canRun: false, reason: "Cần chuyến đang bốc hàng." };
    case "submitDeliveryCompletion":
      if (targetId) {
        if (!targetDelivery || !targetDeliveryOrder) {
          return { canRun: false, reason: "Khong tim thay chuyen giao." };
        }
        const hasPendingDelivery = state.approvalRequests.some((request) => request.type === "delivery_completion" && request.status === "pending" && (request.targetId === targetId || request.id === targetId));
        return !hasPendingDelivery && targetDelivery.status === "in_transit" &&
          (targetDeliveryOrder.status === "allocated" || targetDeliveryOrder.status === "partially_delivered") &&
          targetDeliveryOrder.lines.some((line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity)
          ? { canRun: true }
          : { canRun: false, reason: hasPendingDelivery ? "Chuyen giao dang cho duyet." : "Chuyen nay chua du dieu kien gui xac nhan." };
      }
      return deliveryInTransit && !state.approvalRequests.some((request) => request.type === "delivery_completion" && request.status === "pending" && request.targetId === deliveryInTransit.id)
        ? { canRun: true }
        : { canRun: false, reason: "Chua co chuyen giao san sang gui xac nhan." };
    case "approveDeliveryCompletion":
    case "rejectDeliveryCompletion": {
      if (actor && actor.role !== "owner" && actor.role !== "accountant") {
        return { canRun: false, reason: "Chi Chu cua hang hoac Ke toan duoc duyet." };
      }
      const request = state.approvalRequests.find((item) => item.type === "delivery_completion" && item.status === "pending" && (!targetId || item.id === targetId || item.targetId === targetId));
      return request ? { canRun: true } : { canRun: false, reason: "Khong co xac nhan giao dang cho duyet." };
    }
    case "completeDelivery":
      if (targetId) {
        if (!targetDelivery || !targetDeliveryOrder) {
          return { canRun: false, reason: "Không tìm thấy chuyến giao." };
        }
        if (state.approvalRequests.some((request) => request.type === "delivery_completion" && request.status === "pending" && (request.targetId === targetId || request.id === targetId))) {
          return { canRun: false, reason: "Chuyen giao dang cho Chu cua hang hoac Ke toan duyet." };
        }
        return targetDelivery.status === "in_transit" &&
          (targetDeliveryOrder.status === "allocated" || targetDeliveryOrder.status === "partially_delivered") &&
          targetDeliveryOrder.lines.some((line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity)
          ? { canRun: true }
          : { canRun: false, reason: "Chuyến này chưa đủ điều kiện hoàn tất." };
      }
      return deliveryInTransit ? { canRun: true } : { canRun: false, reason: "Cần chuyến đã xuất bến, đơn đã phân bổ và đủ tồn kho phần qua kho." };
    case "failDelivery":
      if (targetId) {
        if (!targetDelivery || !targetDeliveryOrder) {
          return { canRun: false, reason: "Không tìm thấy chuyến giao." };
        }
        return ["assigned", "loading", "in_transit"].includes(targetDelivery.status) && deliveryJobCanMove(targetDelivery)
          ? { canRun: true }
          : { canRun: false, reason: "Chuyến này không thể báo thất bại." };
      }
      return deliveryActive ? { canRun: true } : { canRun: false, reason: "Không có chuyến giao đang xử lý." };
    case "confirmCustomerPayment":
      if (targetId) {
        if (!targetCustomerPayment) {
          return { canRun: false, reason: "Không tìm thấy phiếu thu." };
        }
        return targetCustomerPayment.status === "draft" && state.customerLedgerEntries.some((entry) => entry.customerId === targetCustomerPayment.customerId && entry.direction === "debit")
          ? { canRun: true }
          : { canRun: false, reason: "Phiếu thu này chưa đủ điều kiện xác nhận." };
      }
      return customerPayment.status === "draft" && state.customerLedgerEntries.some((entry) => entry.direction === "debit")
        ? { canRun: true }
        : { canRun: false, reason: "Cần có phải thu và phiếu thu nháp." };
    case "allocateCustomerPayment":
      if (targetId) {
        if (!targetCustomerPayment) {
          return { canRun: false, reason: "Không tìm thấy phiếu thu." };
        }
        return ["confirmed", "partially_allocated"].includes(targetCustomerPayment.status) && paymentUnallocatedAmount(targetCustomerPayment) > 0 && getOpenCustomerDebtObligations(state, targetCustomerPayment.customerId).length > 0
          ? { canRun: true }
          : { canRun: false, reason: "Phiếu thu chưa xác nhận, đã phân bổ hết hoặc không còn chứng từ nợ phù hợp." };
      }
      return confirmedCustomerPayment
        ? { canRun: true }
        : { canRun: false, reason: "Cần xác nhận phiếu thu trước." };
    case "reverseCustomerPayment":
      if (!targetId) {
        return { canRun: false, reason: "Chọn phiếu thu cụ thể để đảo." };
      }
      if (!targetCustomerPayment) {
        return { canRun: false, reason: "Không tìm thấy phiếu thu." };
      }
      return ["confirmed", "partially_allocated", "allocated"].includes(targetCustomerPayment.status)
        ? { canRun: true }
        : { canRun: false, reason: "Chỉ phiếu thu đã xác nhận hoặc đã phân bổ mới được đảo." };
    case "confirmSupplierPayment":
      if (targetId) {
        if (!targetSupplierPayment) {
          return { canRun: false, reason: "Không tìm thấy phiếu chi." };
        }
        return targetSupplierPayment.status === "draft" && supplierBalance(state.supplierLedgerEntries, targetSupplierPayment.supplierId) >= targetSupplierPayment.amount && cashBalance(state) >= targetSupplierPayment.amount
          ? { canRun: true }
          : { canRun: false, reason: "Phiếu chi này chưa đủ điều kiện xác nhận." };
      }
      return supplierPayment.status === "draft" && supplierBalance(state.supplierLedgerEntries, supplierPayment.supplierId) >= supplierPayment.amount && cashBalance(state) >= supplierPayment.amount
        ? { canRun: true }
        : { canRun: false, reason: "Cần có đủ công nợ phải trả và số dư quỹ." };
    case "allocateSupplierPayment":
      if (targetId) {
        if (!targetSupplierPayment) {
          return { canRun: false, reason: "Không tìm thấy phiếu chi." };
        }
        return ["confirmed", "partially_allocated"].includes(targetSupplierPayment.status) && paymentUnallocatedAmount(targetSupplierPayment) > 0 && getOpenSupplierDebtObligations(state, targetSupplierPayment.supplierId).length > 0
          ? { canRun: true }
          : { canRun: false, reason: "Phiếu chi chưa xác nhận, đã phân bổ hết hoặc không còn chứng từ nợ phù hợp." };
      }
      return state.supplierPayments.some((payment) => ["confirmed", "partially_allocated"].includes(payment.status) && payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0) < payment.amount)
        ? { canRun: true }
        : { canRun: false, reason: "Cần xác nhận phiếu chi trước khi phân bổ." };
    case "reverseSupplierPayment":
      if (!targetId) {
        return { canRun: false, reason: "Chọn phiếu chi nhà cung cấp cụ thể để đảo." };
      }
      if (!targetSupplierPayment) {
        return { canRun: false, reason: "Không tìm thấy phiếu chi." };
      }
      return ["confirmed", "partially_allocated", "allocated"].includes(targetSupplierPayment.status)
        ? { canRun: true }
        : { canRun: false, reason: "Chỉ phiếu chi đã xác nhận hoặc đã phân bổ mới được đảo." };
    case "confirmCashVoucher":
      if (targetId && !targetCashVoucher) {
        return { canRun: false, reason: "Không tìm thấy phiếu quỹ." };
      }
      if (!cashVoucher || cashVoucher.status !== "draft") {
        return { canRun: false, reason: "Không còn phiếu quỹ nháp." };
      }
      return cashVoucher.direction === "out" && cashBalance(state) < cashVoucher.amount
        ? { canRun: false, reason: "Tồn quỹ không đủ để xác nhận phiếu chi." }
        : { canRun: true };
    case "reverseCashVoucher":
      if (!targetCashVoucher) {
        return { canRun: false, reason: "Chọn phiếu quỹ đã xác nhận để đảo." };
      }
      return targetCashVoucher.status === "confirmed"
        ? { canRun: true }
        : { canRun: false, reason: "Chỉ phiếu quỹ đã xác nhận mới được đảo." };
    case "approveWorkOutput":
      if (targetId && !targetWorkOrder) {
        return { canRun: false, reason: "Không tìm thấy phiếu công." };
      }
      return workOrder.status === "submitted" ? { canRun: true } : { canRun: false, reason: "Sản lượng đã duyệt hoặc đã tính công." };
    case "postCompensation":
      if (targetId) {
        if (!targetWorkOrder) {
          return { canRun: false, reason: "Không tìm thấy phiếu công." };
        }
        return targetWorkOrder.status === "approved" && compensation.status === "draft"
          ? { canRun: true }
          : { canRun: false, reason: "Cần duyệt sản lượng trước khi ghi nhận bảng công." };
      }
      return approvedWorkOrder && compensation.status === "draft"
        ? { canRun: true }
        : { canRun: false, reason: "Cần duyệt sản lượng trước khi ghi nhận bảng công." };
    case "payEmployee":
      if (targetId) {
        if (!targetEmployeePayment) {
          return { canRun: false, reason: "Không tìm thấy phiếu thanh toán nhân viên." };
        }
        return targetEmployeePayment.status === "draft" && employeeBalance(state, targetEmployeePayment.employeeId) >= targetEmployeePayment.amount && cashBalance(state) >= targetEmployeePayment.amount
          ? { canRun: true }
          : { canRun: false, reason: "Phiếu này chưa đủ điều kiện thanh toán." };
      }
      return employeePayment.status === "draft" && employeeBalance(state, employeePayment.employeeId) >= employeePayment.amount && cashBalance(state) >= employeePayment.amount
        ? { canRun: true }
        : { canRun: false, reason: "Cần có công đã chốt và quỹ đủ tiền." };
    case "reverseEmployeePayment":
      if (!targetId) {
        return { canRun: false, reason: "Chọn phiếu thanh toán nhân viên cụ thể để đảo." };
      }
      if (!targetEmployeePayment) {
        return { canRun: false, reason: "Không tìm thấy phiếu thanh toán nhân viên." };
      }
      return targetEmployeePayment.status === "confirmed"
        ? { canRun: true }
        : { canRun: false, reason: "Chỉ phiếu thanh toán đã xác nhận mới được đảo." };
    case "confirmEmployeeAdvance":
      if (targetId && !targetEmployeeAdvance) {
        return { canRun: false, reason: "Không tìm thấy phiếu tạm ứng." };
      }
      return employeeAdvance?.status === "draft" && cashBalance(state) >= employeeAdvance.amount
        ? { canRun: true }
        : { canRun: false, reason: "Cần phiếu tạm ứng nháp và đủ số dư quỹ." };
    case "reverseEmployeeAdvance":
      if (!targetId || !targetEmployeeAdvance) {
        return { canRun: false, reason: "Chọn phiếu tạm ứng đã xác nhận để đảo." };
      }
      return targetEmployeeAdvance.status === "confirmed"
        ? { canRun: true }
        : { canRun: false, reason: "Chỉ phiếu tạm ứng đã xác nhận mới được đảo." };
    case "resolveImportIssue":
      if (targetId) {
        if (!targetImportIssue) {
          return { canRun: false, reason: "Không tìm thấy vấn đề import." };
        }
        return targetImportIssue.status === "open" ? { canRun: true } : { canRun: false, reason: "Vấn đề import đã xử lý." };
      }
      return state.importIssues.some((issue) => issue.status === "open")
        ? { canRun: true }
        : { canRun: false, reason: "Không còn vấn đề import đang mở." };
    case "ignoreImportIssue":
      if (targetId) {
        if (!targetImportIssue) {
          return { canRun: false, reason: "Không tìm thấy cảnh báo import." };
        }
        return targetImportIssue.status === "open" && targetImportIssue.severity === "warning"
          ? { canRun: true }
          : { canRun: false, reason: "Chỉ cảnh báo import đang mở mới được bỏ qua." };
      }
      return state.importIssues.some((issue) => issue.status === "open" && issue.severity === "warning")
        ? { canRun: true }
        : { canRun: false, reason: "Không còn cảnh báo import đang mở." };
  }
}

function findPurchaseLineForUi(state: OperationsState, targetId: string) {
  for (const purchaseOrder of state.purchaseOrders) {
    for (const line of purchaseOrder.lines) {
      if (purchaseOrder.id === targetId || line.id === targetId) {
        return { purchaseOrder, line };
      }
    }
  }
  return undefined;
}

type DocumentUnitFormLine = {
  productUnitId?: string;
  unitName?: string;
  unitFactor?: number;
  actualBaseQuantity?: number;
  quantity?: number;
  orderedQuantity?: number;
};

function productBaseUnit(state: OperationsState, productUnitId: string) {
  return state.productUnits.find((product) => product.id === productUnitId)?.unitName ?? "";
}

function usesProductBaseUnit(state: OperationsState, productUnitId: string, unitName?: string) {
  return normalizeSearch(productBaseUnit(state, productUnitId)) === normalizeSearch(unitName ?? "");
}

function documentUnitOptions(state: OperationsState, productUnitId: string) {
  const candidates = [
    productBaseUnit(state, productUnitId),
    ...state.unitDefinitions.filter((unit) => unit.status === "active").map((unit) => unit.name)
  ].filter(Boolean);
  const seen = new Set<string>();
  return candidates.filter((unit) => {
    const normalized = normalizeSearch(unit);
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function purchaseDocumentUnitOptions(state: OperationsState, productUnitId: string) {
  return configuredPurchaseUnits(state, productUnitId).map((unit) => unit.unitName);
}

function defaultPurchaseUnitId(state: OperationsState, productUnitId: string) {
  const configuredUnitId = state.purchaseUnitConversions.find(
    (conversion) => conversion.productUnitId === productUnitId &&
      state.unitDefinitions.some((unit) => unit.id === conversion.unitId && unit.status === "active")
  )?.unitId;
  if (configuredUnitId) {
    return configuredUnitId;
  }
  const product = state.productUnits.find((item) => item.id === productUnitId);
  return state.unitDefinitions.find(
    (unit) => unit.status === "active" && normalizeUnitName(unit.name) !== normalizeUnitName(product?.unitName ?? "")
  )?.id ?? "";
}

function defaultPurchaseUnitFactor(state: OperationsState, productUnitId: string) {
  const unitId = defaultPurchaseUnitId(state, productUnitId);
  return state.purchaseUnitConversions.find(
    (conversion) => conversion.productUnitId === productUnitId && conversion.unitId === unitId
  )?.factorToBase ?? 1;
}

function defaultPurchaseUnitMode(state: OperationsState, productUnitId: string) {
  const unitId = defaultPurchaseUnitId(state, productUnitId);
  return state.purchaseUnitConversions.find(
    (conversion) => conversion.productUnitId === productUnitId && conversion.unitId === unitId
  )?.conversionMode ?? "fixed";
}

function isVariablePurchaseUnit(state: OperationsState, productUnitId: string, unitName?: string) {
  return configuredPurchaseUnit(state, productUnitId, unitName)?.conversionMode === "variable";
}

function displayUnitName(unitName?: string) {
  if (!unitName) {
    return "đơn vị";
  }
  return normalizeSearch(unitName) === "m3" ? "m³" : unitName;
}

function documentConversionPreview(state: OperationsState, line?: DocumentUnitFormLine) {
  if (!line?.productUnitId) {
    return "Chọn vật tư để xem đơn vị tồn kho.";
  }
  const baseUnit = productBaseUnit(state, line.productUnitId);
  const unitName = line.unitName || baseUnit;
  const configuredUnit = configuredPurchaseUnit(state, line.productUnitId, unitName);
  const quantity = Number(line.quantity ?? line.orderedQuantity ?? 0);
  if (configuredUnit?.conversionMode === "variable") {
    const actualBaseQuantity = Number(line.actualBaseQuantity);
    if (!Number.isFinite(actualBaseQuantity) || actualBaseQuantity <= 0) {
      return `Nhập tổng ${displayUnitName(baseUnit)} thực nhận cho ${formatQuantity(quantity)} ${displayUnitName(unitName)}.`;
    }
    return `${formatQuantity(quantity)} ${displayUnitName(unitName)} · ghi nhận thực tế ${formatQuantity(actualBaseQuantity)} ${displayUnitName(baseUnit)}; không dùng quy đổi cố định.`;
  }
  const factor = usesProductBaseUnit(state, line.productUnitId, unitName) ? 1 : Number(line.unitFactor);
  if (!Number.isFinite(factor) || factor <= 0) {
    return `Nhập số ${displayUnitName(baseUnit)} có trong 1 ${displayUnitName(unitName)}.`;
  }
  return `1 ${displayUnitName(unitName)} = ${formatQuantity(factor)} ${displayUnitName(baseUnit)} · ${formatQuantity(quantity)} ${displayUnitName(unitName)} sẽ ghi ${formatQuantity(quantity * factor)} ${displayUnitName(baseUnit)}.`;
}

function lineDocumentFactor(line: SalesOrderLine | PurchaseOrderLine) {
  return line.documentUnit?.factorToBase ?? 1;
}

function lineDocumentUnitName(state: OperationsState, line: SalesOrderLine | PurchaseOrderLine) {
  return line.documentUnit?.unitName ?? productBaseUnit(state, line.productUnitId);
}

function salesLineQuantityText(state: OperationsState, line: SalesOrderLine, delivered = false) {
  const baseQuantity = delivered ? line.deliveredQuantity : line.quantity;
  const documentQuantity = baseQuantity / lineDocumentFactor(line);
  return `${formatQuantity(documentQuantity)} ${displayUnitName(lineDocumentUnitName(state, line))}`;
}

function purchaseLineProgressText(state: OperationsState, line: PurchaseOrderLine) {
  const factor = lineDocumentFactor(line);
  const unitName = displayUnitName(lineDocumentUnitName(state, line));
  const baseUnit = displayUnitName(productBaseUnit(state, line.productUnitId));
  if (line.documentUnit?.conversionMode === "variable") {
    return `${formatQuantity(line.receivedQuantity)} / ${formatQuantity(line.orderedQuantity)} ${baseUnit} · đơn mua ${formatQuantity(line.documentUnit.quantity)} ${unitName}`;
  }
  const progress = `${formatQuantity(line.receivedQuantity / factor)} / ${formatQuantity(line.orderedQuantity / factor)} ${unitName}`;
  return factor === 1 ? progress : `${progress} (${formatQuantity(line.receivedQuantity)} / ${formatQuantity(line.orderedQuantity)} ${baseUnit})`;
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultAllocationAmounts(
  obligations: Array<{ ledgerEntryId: string; openAmount: number }>,
  availableAmount: number
) {
  const amounts: Record<string, string> = {};
  let remaining = availableAmount;
  for (const obligation of obligations) {
    const amount = Math.min(obligation.openAmount, remaining);
    amounts[obligation.ledgerEntryId] = amount > 0 ? String(amount) : "";
    remaining -= amount;
  }
  return amounts;
}

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function filterRows<T>(rows: T[], searchTerm: string, getValues: (row: T) => Array<string | number | undefined>) {
  const query = normalizeSearch(searchTerm);
  if (!query) {
    return rows;
  }
  return rows.filter((row) => getValues(row).some((value) => normalizeSearch(String(value ?? "")).includes(query)));
}

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function statusText(value: string | undefined) {
  const dictionary: Record<string, string> = {
    active: "Đang dùng",
    adjustment: "Điều chỉnh kiểm kê",
    allocated: "Đã phân bổ",
    approved: "Đã duyệt",
    assigned: "Đã phân công",
    compensated: "Đã tính công",
    confirmed: "Đã xác nhận",
    credit: "Có",
    customer_direct: "Giao thẳng khách",
    debit: "Nợ",
    delivered: "Đã giao",
    draft: "Bản nháp",
    error: "Lỗi",
    failed: "Thất bại",
    fully_received: "Nhận đủ",
    ignored: "Đã bỏ qua",
    inactive: "Ngừng dùng",
    in_transit: "Đang giao",
    issue: "Xuất kho",
    loading: "Đang bốc hàng",
    opening: "Tồn đầu kỳ",
    ordered: "Đã đặt",
    pending: "Chờ duyệt",
    owner: "Chủ cửa hàng",
    partially_allocated: "Phân bổ một phần",
    partially_delivered: "Giao một phần",
    partially_received: "Nhận một phần",
    paid: "Đã thanh toán",
    posted: "Đã ghi nhận",
    receipt: "Nhập kho",
    reverse: "Đảo kho",
    resolved: "Đã xử lý",
    rejected: "Đã từ chối",
    reversed: "Đã đảo",
    submitted: "Chờ duyệt",
    transfer_in: "Nhập chuyển kho",
    transfer_out: "Xuất chuyển kho",
    warning: "Cảnh báo",
    warehouse: "Kho cửa hàng"
  };

  return value ? dictionary[value] ?? value : "-";
}

function debtStatusText(value: "open" | "partially_allocated" | "settled") {
  return value === "settled" ? "Đã tất toán" : value === "partially_allocated" ? "Còn một phần" : "Chưa phân bổ";
}

function roleText(value: string) {
  const dictionary: Record<string, string> = {
    accountant: "Kế toán",
    administrator: "Quản trị hệ thống",
    dispatcher: "Điều phối",
    driver: "Tài xế",
    owner: "Chủ cửa hàng",
    sales: "Bán hàng",
    supervisor: "Giám sát",
    warehouse: "Kho",
    worker: "Thợ",
    viewer: "Chỉ xem"
  };

  return dictionary[value] ?? value;
}

function sourceText(value: string | undefined) {
  if (value === "warehouse") {
    return "Qua kho";
  }
  if (value === "direct_supplier") {
    return "Giao thẳng";
  }
  return "Chưa phân bổ";
}

function formatRoleMetricValue(metric: RoleDashboardMetric) {
  if (metric.valueType === "money" && typeof metric.value === "number") {
    return formatMoney(metric.value);
  }
  if (metric.valueType === "quantity" && typeof metric.value === "number") {
    return formatQuantity(metric.value);
  }
  if (metric.valueType === "count" && typeof metric.value === "number") {
    return metric.value.toString();
  }
  return String(metric.value);
}

function taskStatusClassName(task: RoleDashboardTask) {
  if (task.severity === "success") {
    return "status status-core-ready";
  }
  if (task.severity === "danger") {
    return "status status-danger";
  }
  if (task.severity === "warning") {
    return "status status-hardening-required";
  }
  return "status status-planned";
}

function taskStatusText(task: RoleDashboardTask) {
  if (task.count === 0) {
    return "Ổn";
  }
  if (task.severity === "danger") {
    return "Cần xử lý";
  }
  if (task.severity === "warning") {
    return "Cần chú ý";
  }
  return "Theo dõi";
}
