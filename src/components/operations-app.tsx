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
  displayName: "ChÆ°a Ä‘Äƒng nháº­p",
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
            error: error instanceof Error ? error.message : "KhÃ´ng thá»ƒ Ä‘á»“ng bá»™ báº£ng Ä‘iá»u khiá»ƒn."
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
          : operation === "submitDeliveryCompletion"
            ? await (() => {
                const formData = new FormData();
                formData.set("targetId", targetId ?? "");
                formData.set("recipientName", options?.recipientName ?? "");
                formData.set("evidence", options?.evidence ?? "");
                formData.set("lineQuantities", JSON.stringify(options?.lineQuantities ?? {}));
                if (attachment) {
                  formData.set("deliveryImage", attachment);
                }
                return submitDeliveryCompletionWithImageAction(formData);
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
          text: error instanceof Error ? error.message : "KhÃ´ng thá»ƒ thá»±c hiá»‡n thao tÃ¡c."
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
          text: error instanceof Error ? error.message : "KhÃ´ng thá»ƒ táº¡o dá»¯ liá»‡u má»›i."
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
          text: error instanceof Error ? error.message : "KhÃ´ng thá»ƒ cháº¡y thá»­ workbook."
        });
      }
    });
  }

  return (
    <OperationsActorContext.Provider value={activeActor}>
    <div className="app-shell">
      <aside className="sidebar" aria-label="Äiá»u hÆ°á»›ng chÃ­nh">
        <div className="brand">
          <div className="brand-mark">HX</div>
          <div>
            <h1 className="brand-title">VLXD Hien Xa</h1>
            <p className="brand-subtitle">ERP váº­n hÃ nh</p>
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
              <span>Quáº£n trá»‹ ngÆ°á»i dÃ¹ng</span>
            </Link>
          ) : null}
          <form action={logoutAction}>
            <button className="nav-item nav-button account-action" type="submit">
              <LogOut aria-hidden="true" />
              <span>ÄÄƒng xuáº¥t</span>
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
            <h3 className="panel-title">Audit gáº§n nháº¥t</h3>
            <p className="panel-note">Má»i thao tÃ¡c Ä‘á»•i tráº¡ng thÃ¡i hoáº·c ghi nháº­n Ä‘á»u táº¡o nháº­t kÃ½ kiá»ƒm toÃ¡n.</p>
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
          <h3 className="panel-title">Báº£ng Ä‘iá»u khiá»ƒn theo vai trÃ²: {dashboard.label}</h3>
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
          headers={["Viá»‡c cáº§n lÃ m", "Sá»‘ lÆ°á»£ng", "Tráº¡ng thÃ¡i", "Ghi chÃº"]}
          rows={dashboard.tasks.map((item) => [
            item.label,
            item.count.toString(),
            <span className={taskStatusClassName(item)} key={`${item.id}-status`}>
              {taskStatusText(item)}
            </span>,
            item.detail
          ])}
          emptyText="Vai trÃ² nÃ y chÆ°a cÃ³ viá»‡c cáº§n xá»­ lÃ½."
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
    syncMeta.status === "live" ? "Äang cáº­p nháº­t" : syncMeta.status === "syncing" ? "Äang Ä‘á»“ng bá»™" : "Máº¥t káº¿t ná»‘i";

  return (
    <div className="realtime-strip" aria-live="polite">
      <span className={statusClassName}>{statusTextValue}</span>
      <span>
        Cáº­p nháº­t {formatDateTime(syncMeta.syncedAt)} Â· phiÃªn báº£n {syncMeta.revision}
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
    <div className="odoo-actionbar" aria-label="Thanh thao tÃ¡c">
      <div className="odoo-breadcrumb">
        <span>VLXD</span>
        <span>/</span>
        <strong>{action.name}</strong>
      </div>
      {searchEnabled ? (
        <label className="odoo-search">
          <span>TÃ¬m kiáº¿m</span>
          <input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="TÃªn, mÃ£, Ä‘iá»‡n thoáº¡i..."
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
        title="KhÃ¡ch hÃ ng"
        rows={customers.map((customer) => [customer.code, customer.displayName, customer.phone, statusText(customer.status)])}
        headers={["MÃ£", "TÃªn", "Äiá»‡n thoáº¡i", "Tráº¡ng thÃ¡i"]}
      />
      <EntityPanel
        title="NhÃ  cung cáº¥p"
        rows={suppliers.map((supplier) => [supplier.code, supplier.displayName, supplier.phone, statusText(supplier.status)])}
        headers={["MÃ£", "TÃªn", "Äiá»‡n thoáº¡i", "Tráº¡ng thÃ¡i"]}
      />
      <EntityPanel
        title="Váº­t tÆ° - Ä‘Æ¡n vá»‹"
        rows={productUnits.map((product) => [product.productCode, product.productName, product.unitName, statusText(product.status)])}
        headers={["MÃ£", "TÃªn váº­t tÆ°", "ÄÆ¡n vá»‹ tá»“n kho", "Tráº¡ng thÃ¡i"]}
      />
      <EntityPanel
        title="Kho vÃ  bÃ£i"
        rows={warehouses.map((warehouse) => [warehouse.code, warehouse.name, statusText(warehouse.status)])}
        headers={["MÃ£", "TÃªn kho/bÃ£i", "Tráº¡ng thÃ¡i"]}
      />
      <EntityPanel
        title="PhÆ°Æ¡ng tiá»‡n"
        rows={vehicles.map((vehicle) => [vehicle.code, vehicle.plateNumber, `${formatQuantity(vehicle.capacityTons)} táº¥n`, statusText(vehicle.status)])}
        headers={["MÃ£ xe", "Biá»ƒn sá»‘", "Táº£i trá»ng", "Tráº¡ng thÃ¡i"]}
      />
      <EntityPanel
        title="NhÃ¢n sá»±"
        rows={employees.map((employee) => [employee.code, employee.displayName, roleText(employee.roleType), statusText(employee.status)])}
        headers={["MÃ£", "TÃªn", "Vai trÃ²", "Tráº¡ng thÃ¡i"]}
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
              {partyName(state, order.customerId)} Â· ngÃ y {order.orderDate} Â· phiÃªn báº£n {order.version}
            </p>
          </div>
          <StatusBadge value={statusText(order.status)} tone={order.status === "draft" ? "warning" : "success"} />
        </div>
        <div className="panel-body">
          <div className="summary-grid">
            <SummaryItem label="Tá»•ng sau VAT" value={formatMoney(totals.gross)} />
            <SummaryItem label="TrÆ°á»›c VAT" value={formatMoney(totals.net)} />
            <SummaryItem label="ÄÃ£ giao" value={`${order.lines.filter((line) => line.deliveredQuantity >= line.quantity).length}/${order.lines.length} dÃ²ng`} />
            <SummaryItem label="Nguá»“n hÃ ng" value={order.status === "allocated" || order.status.includes("delivered") ? "ÄÃ£ phÃ¢n bá»•" : "ChÆ°a phÃ¢n bá»•"} />
          </div>
          <DataTable
            headers={["Váº­t tÆ°", "Sá»‘ lÆ°á»£ng", "ÄÃ£ giao", "Nguá»“n", "ThÃ nh tiá»n"]}
            rows={order.lines.map((line) => [
              productLabel(state, line.productUnitId),
              salesLineQuantityText(state, line),
              salesLineQuantityText(state, line, true),
              sourceText(line.sourceType),
              formatMoney(lineTotals(line).gross)
            ])}
          />
          <h4 className="section-heading">Danh sÃ¡ch Ä‘Æ¡n bÃ¡n</h4>
          <DataTable
            headers={["ÄÆ¡n bÃ¡n", "KhÃ¡ch", "Tráº¡ng thÃ¡i", "Tá»•ng tiá»n", "ÄÃ£ giao", "áº¢nh", "HÃ nh Ä‘á»™ng"]}
            rows={state.salesOrders.map((salesOrder) => [
              <strong key="document">{salesOrder.documentNo}</strong>,
              partyName(state, salesOrder.customerId),
              <StatusBadge key="status" value={statusText(salesOrder.status)} tone={salesOrder.status === "draft" ? "warning" : "success"} />,
              formatMoney(salesOrderTotals(salesOrder.lines).gross),
              `${salesOrder.lines.filter((line) => line.deliveredQuantity >= line.quantity).length}/${salesOrder.lines.length} dÃ²ng`,
              <ApprovalAttachmentPreview key="attachments" attachments={salesOrder.attachments} emptyText="" />,
              salesOrder.status === "draft" ? (
                <WorkflowActionButton key="confirm" operation="confirmSalesOrder" state={state} runOperation={runOperation} isPending={isPending} label="XÃ¡c nháº­n" targetId={salesOrder.id} />
              ) : salesOrder.status === "confirmed" ? (
                <WorkflowActionButton key="allocate" operation="allocateSalesSources" state={state} runOperation={runOperation} isPending={isPending} label="PhÃ¢n bá»• nguá»“n" targetId={salesOrder.id} />
              ) : (
                <span key="monitor" className="muted">Theo dÃµi giao</span>
              )
            ])}
          />
        </div>
      </section> : (
        <section className="panel">
          <div className="panel-header"><div><h3 className="panel-title">ÄÆ¡n bÃ¡n</h3><p className="panel-note">ChÆ°a cÃ³ Ä‘Æ¡n bÃ¡n.</p></div></div>
          <div className="panel-body"><p className="empty-text">Táº¡o Ä‘Æ¡n bÃ¡n nhÃ¡p Ä‘á»ƒ báº¯t Ä‘áº§u xá»­ lÃ½.</p></div>
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
            <h3 className="panel-title">ÄÆ¡n mua vÃ  Ä‘iá»ƒm nháº­n</h3>
            <p className="panel-note">Má»™t láº§n mua cÃ³ thá»ƒ chia vÃ o kho hoáº·c giao tháº³ng khÃ¡ch.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["ÄÆ¡n mua", "NhÃ  cung cáº¥p", "Váº­t tÆ°", "Äiá»ƒm nháº­n", "ÄÃ£ nháº­n", "áº¢nh", "HÃ nh Ä‘á»™ng"]}
            rows={state.purchaseOrders.flatMap((order) =>
              order.lines.map((line) => [
                `${order.documentNo} Â· ${statusText(order.status)}`,
                partyName(state, order.supplierId),
                productLabel(state, line.productUnitId),
                line.destinationType === "warehouse" ? "Kho cá»­a hÃ ng" : "Giao tháº³ng khÃ¡ch",
                purchaseLineProgressText(state, line),
                <ApprovalAttachmentPreview key="attachments" attachments={order.attachments} emptyText="" />,
                order.status === "draft" ? (
                  <WorkflowActionButton key="confirm" operation="confirmPurchaseOrder" state={state} runOperation={runOperation} isPending={isPending} label="XÃ¡c nháº­n Ä‘Æ¡n" targetId={order.id} />
                ) : line.destinationType === "customer_direct" ? (
                  <div key="direct-actions" className="table-actions">
                    {line.receivedQuantity < line.orderedQuantity ? (
                      <WorkflowActionButton operation="confirmDirectDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Giao tháº³ng" targetId={line.id} />
                    ) : null}
                    {line.receivedQuantity > 0 ? (
                      <WorkflowActionButton operation="reverseDirectDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Äáº£o giao" targetId={line.id} />
                    ) : null}
                  </div>
                ) : line.receivedQuantity >= line.orderedQuantity ? (
                  <span key="done" className="muted">ÄÃ£ nháº­n Ä‘á»§</span>
                ) : state.approvalRequests.some((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id) ? (
                  actor.role === "owner" || actor.role === "accountant" ? (
                    <div key="receipt-approval" className="table-actions">
                      <ApprovalAttachmentPreview attachments={state.approvalRequests.find((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id)?.attachments} />
                      <WorkflowActionButton operation="approveGoodsReceipt" state={state} runOperation={runOperation} isPending={isPending} label="Duyá»‡t nháº­n" targetId={state.approvalRequests.find((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id)?.id} />
                      <WorkflowActionButton operation="rejectGoodsReceipt" state={state} runOperation={runOperation} isPending={isPending} label="Tá»« chá»‘i" targetId={state.approvalRequests.find((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id)?.id} />
                    </div>
                  ) : (
                    <span key="receipt-waiting" className="muted">Chá» Chá»§ cá»­a hÃ ng/Káº¿ toÃ¡n duyá»‡t</span>
                  )
                ) : actor.role === "worker" ? (
                  <WorkflowActionButton key="submit-receipt" operation="submitGoodsReceipt" state={state} runOperation={runOperation} isPending={isPending} label="Gá»­i duyá»‡t nháº­n" targetId={line.id} />
                ) : (
                  <WorkflowActionButton key="receipt" operation="postGoodsReceipt" state={state} runOperation={runOperation} isPending={isPending} label="Ghi nháº­p" targetId={line.id} />
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
            <h3 className="panel-title">Chuyáº¿n giao hÃ´m nay</h3>
            <p className="panel-note">TÃ i xáº¿/thá»£ chá»‰ tháº¥y thÃ´ng tin cáº§n Ä‘á»ƒ hoÃ n thÃ nh viá»‡c.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Chuyáº¿n", "ÄÆ¡n bÃ¡n", "TÃ i xáº¿", "Xe", "Phá»¥ xe/thá»£", "Tráº¡ng thÃ¡i", "HÃ nh Ä‘á»™ng"]}
            rows={state.deliveryJobs.map((job) => [
              job.documentNo,
              state.salesOrders.find((order) => order.id === job.salesOrderId)?.documentNo ?? job.salesOrderId,
              partyName(state, job.driverId),
              state.vehicles.find((vehicle) => vehicle.id === job.vehicleId)?.plateNumber ?? job.vehicleId,
              job.helperIds.map((id) => partyName(state, id)).join(", "),
              statusText(job.status),
              job.status === "assigned" ? (
                <div key="actions" className="table-actions">
                  <WorkflowActionButton operation="startDeliveryLoading" state={state} runOperation={runOperation} isPending={isPending} label="Bá»‘c hÃ ng" targetId={job.id} />
                  <WorkflowActionButton operation="failDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Tháº¥t báº¡i" targetId={job.id} />
                </div>
              ) : job.status === "loading" ? (
                <div key="actions" className="table-actions">
                  <WorkflowActionButton operation="dispatchDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Xuáº¥t báº¿n" targetId={job.id} />
                  <WorkflowActionButton operation="failDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Tháº¥t báº¡i" targetId={job.id} />
                </div>
              ) : job.status === "in_transit" ? (
                <div key="actions" className="table-actions">
                  {state.approvalRequests.some((request) => request.type === "delivery_completion" && request.status === "pending" && request.targetId === job.id) ? (
                    actor.role === "owner" || actor.role === "accountant" ? (
                      <>
                        <ApprovalAttachmentPreview attachments={state.approvalRequests.find((request) => request.type === "delivery_completion" && request.status === "pending" && request.targetId === job.id)?.attachments} />
                        <WorkflowActionButton operation="approveDeliveryCompletion" state={state} runOperation={runOperation} isPending={isPending} label="Duyá»‡t giao" targetId={state.approvalRequests.find((request) => request.type === "delivery_completion" && request.status === "pending" && request.targetId === job.id)?.id} />
                        <WorkflowActionButton operation="rejectDeliveryCompletion" state={state} runOperation={runOperation} isPending={isPending} label="Tá»« chá»‘i" targetId={state.approvalRequests.find((request) => request.type === "delivery_completion" && request.status === "pending" && request.targetId === job.id)?.id} />
                      </>
                    ) : (
                      <span className="muted">Chá» Chá»§ cá»­a hÃ ng/Káº¿ toÃ¡n duyá»‡t</span>
                    )
                  ) : actor.role === "worker" ? (
                    <WorkflowActionButton operation="submitDeliveryCompletion" state={state} runOperation={runOperation} isPending={isPending} label="XÃ¡c nháº­n Ä‘Ã£ giao" targetId={job.id} />
                  ) : (
                    <WorkflowActionButton operation="completeDelivery" state={state} runOperation={runOperation} isPending={isPending} label="HoÃ n táº¥t giao" targetId={job.id} />
                  )}
                  <WorkflowActionButton operation="failDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Tháº¥t báº¡i" targetId={job.id} />
                </div>
              ) : job.status === "delivered" ? (
                <div key="done" className="table-actions"><ApprovalAttachmentPreview attachments={job.completionAttachments} emptyText="" /><span className="muted">ÄÃ£ hoÃ n táº¥t</span></div>
              ) : (
                <span key="failed" className="muted">Cáº§n Ä‘iá»u phá»‘i láº¡i</span>
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
            <h3 className="panel-title">Tá»“n kho hiá»‡n táº¡i</h3>
            <p className="panel-note">Tá»“n kho Ä‘Æ°á»£c tÃ­nh tá»« phÃ¡t sinh kho, khÃ´ng sá»­a trá»±c tiáº¿p.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable headers={["Kho", "Váº­t tÆ°", "ÄÆ¡n vá»‹", "Tá»“n", "Sá»‘ phÃ¡t sinh"]} rows={rows} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">PhÃ¡t sinh kho</h3>
            <p className="panel-note">Chá»‰ ghi thÃªm, cÃ³ chá»©ng tá»« nguá»“n vÃ  mÃ£ ghi sá»•.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Loáº¡i", "Chá»©ng tá»«", "Kho", "Váº­t tÆ°", "Sá»‘ lÆ°á»£ng", "MÃ£ ghi sá»•", "HÃ nh Ä‘á»™ng"]}
            rows={state.inventoryMovements.map((movement) => [
              statusText(movement.movementType),
              movement.sourceDocument,
              state.warehouses.find((warehouse) => warehouse.id === movement.warehouseId)?.name ?? movement.warehouseId,
              productLabel(state, movement.productUnitId),
              formatQuantity(movement.quantity),
              movement.postingKey,
              movement.reversedById ? (
                <span key="reversed" className="muted">ÄÃ£ Ä‘áº£o</span>
              ) : movement.movementType !== "opening" && movement.movementType !== "reverse" ? (
                <WorkflowActionButton key="reverse" operation="reverseInventoryMovement" state={state} runOperation={runOperation} isPending={isPending} label="Äáº£o" targetId={movement.id} />
              ) : movement.movementType === "reverse" ? (
                <span key="reverse-row" className="muted">DÃ²ng Ä‘áº£o</span>
              ) : (
                <span key="opening" className="muted">Tá»“n Ä‘áº§u ká»³</span>
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
      reason: "Äiá»u chuyá»ƒn theo káº¿ hoáº¡ch kho"
    }
  });
  const sourceWarehouseId = watch("sourceWarehouseId");
  const productUnitId = watch("productUnitId");
  const available = sourceWarehouseId && productUnitId ? stockBalance(state, sourceWarehouseId, productUnitId) : 0;

  return (
    <section className="panel">
      <div className="panel-header"><div><h3 className="panel-title">Chuyá»ƒn kho</h3><p className="panel-note">Tá»“n kháº£ dá»¥ng táº¡i kho Ä‘i: {formatQuantity(available)}</p></div></div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => runOperation("postInventoryTransfer", undefined, values))}>
          <FormField label="Kho Ä‘i">
            <select className="input" {...register("sourceWarehouseId", { required: true })}>{availableWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
          </FormField>
          <FormField label="Kho Ä‘áº¿n">
            <select className="input" {...register("destinationWarehouseId", { required: true })}>{availableWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
          </FormField>
          <FormField label="Váº­t tÆ°">
            <select className="input" {...register("productUnitId", { required: true })}>{state.productUnits.map((product) => <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>)}</select>
          </FormField>
          <FormField label="Sá»‘ lÆ°á»£ng" error={errors.quantity?.message}>
            <input className="input" type="number" min="0.001" step="0.001" {...register("quantity", { valueAsNumber: true, min: { value: 0.001, message: "Sá»‘ lÆ°á»£ng pháº£i lá»›n hÆ¡n 0." } })} />
          </FormField>
          <FormField label="LÃ½ do" error={errors.reason?.message}>
            <textarea className="input" rows={2} {...register("reason", { minLength: { value: 5, message: "LÃ½ do pháº£i cÃ³ Ã­t nháº¥t 5 kÃ½ tá»±." } })} />
          </FormField>
          <SubmitButton label="Ghi chuyá»ƒn kho" command="postInventoryTransfer" isPending={isPending} disabled={isPending || availableWarehouses.length < 2} />
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
      reason: "Äiá»u chá»‰nh theo biÃªn báº£n kiá»ƒm kÃª"
    }
  });
  const warehouseId = watch("warehouseId");
  const productUnitId = watch("productUnitId");
  const bookQuantity = warehouseId && productUnitId ? stockBalance(state, warehouseId, productUnitId) : 0;

  return (
    <section className="panel">
      <div className="panel-header"><div><h3 className="panel-title">Kiá»ƒm kÃª kho</h3><p className="panel-note">Tá»“n sá»• hiá»‡n táº¡i: {formatQuantity(bookQuantity)}</p></div></div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => runOperation("postInventoryCountAdjustment", undefined, values))}>
          <FormField label="Kho">
            <select className="input" {...register("warehouseId", { required: true })}>{availableWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
          </FormField>
          <FormField label="Váº­t tÆ°">
            <select className="input" {...register("productUnitId", { required: true })}>{state.productUnits.map((product) => <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>)}</select>
          </FormField>
          <FormField label="Sá»‘ Ä‘áº¿m thá»±c táº¿" error={errors.countedQuantity?.message}>
            <input className="input" type="number" min="0" step="0.001" {...register("countedQuantity", { valueAsNumber: true, min: { value: 0, message: "Sá»‘ lÆ°á»£ng khÃ´ng Ä‘Æ°á»£c Ã¢m." } })} />
          </FormField>
          <FormField label="LÃ½ do" error={errors.reason?.message}>
            <textarea className="input" rows={2} {...register("reason", { minLength: { value: 5, message: "LÃ½ do pháº£i cÃ³ Ã­t nháº¥t 5 kÃ½ tá»±." } })} />
          </FormField>
          <SubmitButton label="Ghi chÃªnh lá»‡ch kiá»ƒm kÃª" command="postInventoryCountAdjustment" isPending={isPending} />
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
            <h3 className="panel-title">Äá»‘i soÃ¡t cÃ´ng ná»£ khÃ¡ch hÃ ng</h3>
            <p className="panel-note">Sá»‘ dÆ° Ä‘á»c tá»« sá»• phá»¥; phÃ¢n bá»• chá»‰ khá»›p phiáº¿u thu vá»›i chá»©ng tá»« giao hÃ ng.</p>
          </div>
          <button className="button button-small" type="button" onClick={exportStatement}>
            <Download aria-hidden="true" /> Xuáº¥t Ä‘á»‘i soÃ¡t
          </button>
        </div>
        <div className="panel-body">
          <div className="debt-filter-row">
            <FormField label="Pháº¡m vi khÃ¡ch hÃ ng">
              <select className="input" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="all">Táº¥t cáº£ khÃ¡ch hÃ ng</option>
                {state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} Â· {customer.displayName}</option>)}
              </select>
            </FormField>
          </div>
          <div className="summary-grid">
            <SummaryItem label="Sá»‘ dÆ° pháº£i thu" value={formatMoney(totalBalance)} />
            <SummaryItem label="Chá»©ng tá»« cÃ²n má»Ÿ" value={`${openCount} chá»©ng tá»«`} />
            <SummaryItem label="GiÃ¡ trá»‹ cÃ²n má»Ÿ" value={formatMoney(totalOpen)} />
            <SummaryItem label="Tiá»n thu chÆ°a phÃ¢n bá»•" value={formatMoney(totalUnapplied)} />
          </div>
          <h4 className="section-heading">Äá»‘i chiáº¿u theo khÃ¡ch hÃ ng</h4>
          <DataTable
            headers={["KhÃ¡ch hÃ ng", "Sá»‘ dÆ° sá»• phá»¥", "NghÄ©a vá»¥ cÃ²n má»Ÿ", "Thu chÆ°a phÃ¢n bá»•", "Chá»©ng tá»« má»Ÿ"]}
            rows={filteredSummaries.map((item) => [
              item.partyName,
              formatMoney(item.balance),
              formatMoney(item.openObligationAmount),
              formatMoney(item.unappliedPaymentAmount),
              item.openObligationCount
            ])}
          />
          <h4 className="section-heading">NghÄ©a vá»¥ pháº£i thu</h4>
          <DataTable
            className="debt-data-table"
            headers={["KhÃ¡ch hÃ ng", "Chá»©ng tá»«", "NgÃ y", "GiÃ¡ trá»‹ gá»‘c", "ÄÃ£ phÃ¢n bá»•", "CÃ²n má»Ÿ", "Tráº¡ng thÃ¡i"]}
            rows={filteredObligations.map((item) => [
              item.partyName,
              item.sourceDocument,
              formatDateTime(item.postingDate),
              formatMoney(item.originalAmount),
              formatMoney(item.allocatedAmount),
              formatMoney(item.openAmount),
              debtStatusText(item.status)
            ])}
            emptyText="ChÆ°a cÃ³ nghÄ©a vá»¥ pháº£i thu. HoÃ n táº¥t giao hÃ ng Ä‘á»ƒ phÃ¡t sinh."
          />
          <h4 className="section-heading">Phiáº¿u thu vÃ  phÃ¢n bá»•</h4>
          <DataTable
            className="debt-data-table"
            headers={["Phiáº¿u", "KhÃ¡ch", "Sá»‘ tiá»n", "Tráº¡ng thÃ¡i", "ÄÃ£ phÃ¢n bá»•", "ChÆ°a phÃ¢n bá»•", "HÃ nh Ä‘á»™ng"]}
            rows={state.customerPayments.filter((payment) => customerId === "all" || payment.customerId === customerId).map((payment) => [
              payment.documentNo,
              partyName(state, payment.customerId),
              formatMoney(payment.amount),
              statusText(payment.status),
              formatMoney(paymentAllocatedAmount(payment)),
              formatMoney(paymentUnallocatedAmount(payment)),
              payment.status === "draft" ? (
                <WorkflowActionButton key="confirm" operation="confirmCustomerPayment" state={state} runOperation={runOperation} isPending={isPending} label="XÃ¡c nháº­n thu" targetId={payment.id} />
              ) : payment.status === "confirmed" || payment.status === "partially_allocated" ? (
                <div key="actions" className="table-actions">
                  <WorkflowActionButton operation="allocateCustomerPayment" state={state} runOperation={runOperation} isPending={isPending} label="Chá»n chá»©ng tá»«" targetId={payment.id} />
                  <WorkflowActionButton operation="reverseCustomerPayment" state={state} runOperation={runOperation} isPending={isPending} label="Äáº£o phiáº¿u" targetId={payment.id} />
                </div>
              ) : payment.status === "allocated" ? (
                <div key="actions" className="table-actions">
                  <span className="muted">ÄÃ£ phÃ¢n bá»• Ä‘á»§</span>
                  <WorkflowActionButton operation="reverseCustomerPayment" state={state} runOperation={runOperation} isPending={isPending} label="Äáº£o phiáº¿u" targetId={payment.id} />
                </div>
              ) : <span key="done" className="muted">ÄÃ£ Ä‘áº£o</span>
            ])}
          />
          <h4 className="section-heading">BÃºt toÃ¡n sá»• phá»¥</h4>
          <DataTable
            headers={["KhÃ¡ch", "Chá»©ng tá»«", "Ná»£", "CÃ³", "NgÃ y"]}
            rows={filteredLedger.map((entry) => [
              partyName(state, entry.customerId),
              entry.sourceDocument,
              entry.direction === "debit" ? formatMoney(entry.amount) : "",
              entry.direction === "credit" ? formatMoney(entry.amount) : "",
              formatDateTime(entry.postingDate)
            ])}
            emptyText="ChÆ°a cÃ³ dÃ²ng cÃ´ng ná»£. HoÃ n táº¥t giao hoáº·c xÃ¡c nháº­n phiáº¿u thu Ä‘á»ƒ phÃ¡t sinh."
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
            <h3 className="panel-title">Äá»‘i soÃ¡t cÃ´ng ná»£ nhÃ  cung cáº¥p</h3>
            <p className="panel-note">Pháº£i tráº£ Ä‘á»c tá»« sá»• phá»¥; phiáº¿u chi Ä‘Æ°á»£c khá»›p riÃªng theo tá»«ng chá»©ng tá»« nháº­n hÃ ng.</p>
          </div>
          <button className="button button-small" type="button" onClick={exportStatement}>
            <Download aria-hidden="true" /> Xuáº¥t Ä‘á»‘i soÃ¡t
          </button>
        </div>
        <div className="panel-body">
          <div className="debt-filter-row">
            <FormField label="Pháº¡m vi nhÃ  cung cáº¥p">
              <select className="input" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="all">Táº¥t cáº£ nhÃ  cung cáº¥p</option>
                {state.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} Â· {supplier.displayName}</option>)}
              </select>
            </FormField>
          </div>
          <div className="summary-grid">
            <SummaryItem label="Sá»‘ dÆ° pháº£i tráº£" value={formatMoney(totalBalance)} />
            <SummaryItem label="Chá»©ng tá»« cÃ²n má»Ÿ" value={`${openCount} chá»©ng tá»«`} />
            <SummaryItem label="GiÃ¡ trá»‹ cÃ²n má»Ÿ" value={formatMoney(totalOpen)} />
            <SummaryItem label="Tiá»n chi chÆ°a phÃ¢n bá»•" value={formatMoney(totalUnapplied)} />
          </div>
          <h4 className="section-heading">Äá»‘i chiáº¿u theo nhÃ  cung cáº¥p</h4>
          <DataTable
            headers={["NhÃ  cung cáº¥p", "Sá»‘ dÆ° sá»• phá»¥", "NghÄ©a vá»¥ cÃ²n má»Ÿ", "Chi chÆ°a phÃ¢n bá»•", "Chá»©ng tá»« má»Ÿ"]}
            rows={filteredSummaries.map((item) => [item.partyName, formatMoney(item.balance), formatMoney(item.openObligationAmount), formatMoney(item.unappliedPaymentAmount), item.openObligationCount])}
          />
          <h4 className="section-heading">NghÄ©a vá»¥ pháº£i tráº£</h4>
          <DataTable
            className="debt-data-table"
            headers={["NhÃ  cung cáº¥p", "Chá»©ng tá»«", "NgÃ y", "GiÃ¡ trá»‹ gá»‘c", "ÄÃ£ phÃ¢n bá»•", "CÃ²n má»Ÿ", "Tráº¡ng thÃ¡i"]}
            rows={filteredObligations.map((item) => [item.partyName, item.sourceDocument, formatDateTime(item.postingDate), formatMoney(item.originalAmount), formatMoney(item.allocatedAmount), formatMoney(item.openAmount), debtStatusText(item.status)])}
            emptyText="ChÆ°a cÃ³ nghÄ©a vá»¥ pháº£i tráº£. Nháº­p kho hoáº·c xÃ¡c nháº­n giao tháº³ng Ä‘á»ƒ phÃ¡t sinh."
          />
          <h4 className="section-heading">Phiáº¿u chi nhÃ  cung cáº¥p</h4>
          <DataTable
            className="debt-data-table"
            headers={["Phiáº¿u", "NhÃ  cung cáº¥p", "Sá»‘ tiá»n", "Tráº¡ng thÃ¡i", "ÄÃ£ phÃ¢n bá»•", "ChÆ°a phÃ¢n bá»•", "HÃ nh Ä‘á»™ng"]}
            rows={state.supplierPayments.filter((payment) => supplierId === "all" || payment.supplierId === supplierId).map((payment) => [
              payment.documentNo,
              partyName(state, payment.supplierId),
              formatMoney(payment.amount),
              statusText(payment.status),
              formatMoney(paymentAllocatedAmount(payment)),
              formatMoney(paymentUnallocatedAmount(payment)),
              payment.status === "draft" ? (
                <WorkflowActionButton key="confirm" operation="confirmSupplierPayment" state={state} runOperation={runOperation} isPending={isPending} label="XÃ¡c nháº­n chi" targetId={payment.id} />
              ) : payment.status === "confirmed" || payment.status === "partially_allocated" ? (
                <div key="actions" className="table-actions">
                  <WorkflowActionButton operation="allocateSupplierPayment" state={state} runOperation={runOperation} isPending={isPending} label="Chá»n chá»©ng tá»«" targetId={payment.id} />
                  <WorkflowActionButton operation="reverseSupplierPayment" state={state} runOperation={runOperation} isPending={isPending} label="Äáº£o phiáº¿u" targetId={payment.id} />
                </div>
              ) : payment.status === "allocated" ? (
                <div key="actions" className="table-actions">
                  <span className="muted">ÄÃ£ phÃ¢n bá»• Ä‘á»§</span>
                  <WorkflowActionButton operation="reverseSupplierPayment" state={state} runOperation={runOperation} isPending={isPending} label="Äáº£o phiáº¿u" targetId={payment.id} />
                </div>
              ) : <span key="done" className="muted">ÄÃ£ Ä‘áº£o</span>
            ])}
          />
          <h4 className="section-heading">BÃºt toÃ¡n sá»• phá»¥</h4>
          <DataTable
            headers={["NCC", "Chá»©ng tá»«", "TÄƒng pháº£i tráº£", "Giáº£m pháº£i tráº£", "NgÃ y"]}
            rows={filteredLedger.map((entry) => [
              partyName(state, entry.supplierId),
              entry.sourceDocument,
              entry.direction === "credit" ? formatMoney(entry.amount) : "",
              entry.direction === "debit" ? formatMoney(entry.amount) : "",
              formatDateTime(entry.postingDate)
            ])}
            emptyText="ChÆ°a cÃ³ dÃ²ng cÃ´ng ná»£ nhÃ  cung cáº¥p. Ghi nháº­n nháº­p kho hoáº·c giao tháº³ng Ä‘á»ƒ phÃ¡t sinh."
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
            <h3 className="panel-title">Sá»• quá»¹ tiá»n máº·t</h3>
            <p className="panel-note">Sá»‘ dÆ° chá»‰ tÃ­nh tá»« giao dá»‹ch quá»¹ Ä‘Ã£ xÃ¡c nháº­n vÃ  bÃºt toÃ¡n Ä‘áº£o.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="summary-grid">
            <SummaryItem label="Tá»•ng thu" value={formatMoney(cashIn)} />
            <SummaryItem label="Tá»•ng chi" value={formatMoney(cashOut)} />
            <SummaryItem label="Tá»“n quá»¹" value={formatMoney(cashBalance(state))} />
            <SummaryItem label="Sá»‘ giao dá»‹ch" value={state.cashTransactions.length.toString()} />
          </div>
          <DataTable
            headers={["TÃ i khoáº£n", "Chá»©ng tá»«", "Thu", "Chi", "Thá»i Ä‘iá»ƒm"]}
            rows={state.cashTransactions.map((entry) => [
              entry.accountName,
              entry.sourceDocument,
              entry.direction === "in" ? formatMoney(entry.amount) : "",
              entry.direction === "out" ? formatMoney(entry.amount) : "",
              formatDateTime(entry.postedAt)
            ])}
            emptyText="ChÆ°a cÃ³ giao dá»‹ch quá»¹. XÃ¡c nháº­n phiáº¿u thu/chi Ä‘á»ƒ phÃ¡t sinh."
          />
          <h4 className="section-heading">Phiáº¿u thu/chi ná»™i bá»™</h4>
          <DataTable
            headers={["Phiáº¿u", "Loáº¡i", "NhÃ³m", "Diá»…n giáº£i", "Sá»‘ tiá»n", "Tráº¡ng thÃ¡i", "HÃ nh Ä‘á»™ng"]}
            rows={state.cashVouchers.map((voucher) => [
              voucher.documentNo,
              voucher.direction === "in" ? "Phiáº¿u thu" : "Phiáº¿u chi",
              voucher.category,
              voucher.description,
              formatMoney(voucher.amount),
              statusText(voucher.status),
              voucher.status === "draft" ? (
                <WorkflowActionButton key="confirm" operation="confirmCashVoucher" state={state} runOperation={runOperation} isPending={isPending} label="XÃ¡c nháº­n" targetId={voucher.id} />
              ) : voucher.status === "confirmed" ? (
                <WorkflowActionButton key="reverse" operation="reverseCashVoucher" state={state} runOperation={runOperation} isPending={isPending} label="Äáº£o phiáº¿u" targetId={voucher.id} />
              ) : (
                <span key="reversed" className="muted">ÄÃ£ Ä‘áº£o</span>
              )
            ])}
            emptyText="ChÆ°a cÃ³ phiáº¿u thu/chi ná»™i bá»™."
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
    defaultValues: { direction: "in", category: "Thu khÃ¡c", description: "", amount: 0 }
  });
  const direction = watch("direction");

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Táº¡o phiáº¿u quá»¹</h3>
          <p className="panel-note">Phiáº¿u nhÃ¡p chÆ°a lÃ m thay Ä‘á»•i sá»‘ dÆ° cho Ä‘áº¿n khi xÃ¡c nháº­n.</p>
        </div>
      </div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => {
          createCommand({ type: "createCashVoucherDraft", ...values });
          reset({ direction: values.direction, category: values.category, description: "", amount: 0 });
        })}>
          <FormField label="Loáº¡i phiáº¿u">
            <select className="input" {...register("direction")}>
              <option value="in">Phiáº¿u thu</option>
              <option value="out">Phiáº¿u chi</option>
            </select>
          </FormField>
          <FormField label="NhÃ³m thu chi" error={errors.category?.message}>
            <input className="input" {...register("category", { required: "Nháº­p nhÃ³m thu chi." })} />
          </FormField>
          <FormField label="Diá»…n giáº£i" error={errors.description?.message}>
            <textarea className="input" rows={3} {...register("description", { required: "Nháº­p diá»…n giáº£i." })} />
          </FormField>
          <FormField label="Sá»‘ tiá»n" error={errors.amount?.message}>
            <input className="input" type="number" min="1" step="1000" {...register("amount", {
              valueAsNumber: true,
              min: { value: 1, message: "Sá»‘ tiá»n pháº£i lá»›n hÆ¡n 0." }
            })} />
          </FormField>
          <SubmitButton label={`Táº¡o ${direction === "in" ? "phiáº¿u thu" : "phiáº¿u chi"}`} command="createCashVoucherDraft" isPending={isPending} />
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
  const actor = useContext(OperationsActorContext);
  return (
    <div className="workbench-grid">
      {actor.role === "worker" ? (
        <OpenWorkOrderClaimPanel state={state} runOperation={runOperation} isPending={isPending} />
      ) : null}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Sáº£n lÆ°á»£ng vÃ  tiá»n cÃ´ng</h3>
            <p className="panel-note">Output Ä‘Ã£ compensated khÃ´ng Ä‘Æ°á»£c tÃ­nh láº¡i.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Phiáº¿u", "CÃ´ng viá»‡c", "Sáº£n lÆ°á»£ng", "Duyá»‡t", "Tráº¡ng thÃ¡i", "HÃ nh Ä‘á»™ng"]}
            rows={state.workOrders.flatMap((order) =>
              order.outputs.map((output) => [
                order.documentNo,
                order.workType,
                `${formatQuantity(output.actualQuantity)} ${productLabel(state, output.productUnitId)}`,
                formatQuantity(output.approvedQuantity),
                statusText(order.status),
                order.status === "submitted" ? (
                  <WorkflowActionButton key="approve" operation="approveWorkOutput" state={state} runOperation={runOperation} isPending={isPending} label="Duyá»‡t" targetId={order.id} />
                ) : order.status === "approved" ? (
                  <WorkflowActionButton key="post" operation="postCompensation" state={state} runOperation={runOperation} isPending={isPending} label="Ghi cÃ´ng" targetId={order.id} />
                ) : (
                  <span key="done" className="muted">ÄÃ£ xá»­ lÃ½</span>
                )
              ])
            )}
          />
          <h4 className="section-heading">Sá»• tiá»n cÃ´ng nhÃ¢n viÃªn</h4>
          <DataTable
            headers={["NhÃ¢n viÃªn", "Chá»©ng tá»«", "TÄƒng pháº£i tráº£", "Giáº£m pháº£i tráº£", "Sá»‘ dÆ°"]}
            rows={state.employeeLedgerEntries.map((entry) => [
              partyName(state, entry.employeeId),
              entry.sourceDocument,
              entry.direction === "credit" ? formatMoney(entry.amount) : "",
              entry.direction === "debit" ? formatMoney(entry.amount) : "",
              formatMoney(employeeBalance(state, entry.employeeId))
            ])}
            emptyText="ChÆ°a cÃ³ dÃ²ng tiá»n cÃ´ng. Duyá»‡t sáº£n lÆ°á»£ng vÃ  ghi nháº­n báº£ng cÃ´ng Ä‘á»ƒ phÃ¡t sinh."
          />
          <h4 className="section-heading">Phiáº¿u thanh toÃ¡n nhÃ¢n viÃªn</h4>
          <DataTable
            headers={["Phiáº¿u", "NhÃ¢n viÃªn", "Sá»‘ tiá»n", "Tráº¡ng thÃ¡i", "HÃ nh Ä‘á»™ng"]}
            rows={state.employeePayments.map((payment) => [
              payment.documentNo,
              partyName(state, payment.employeeId),
              formatMoney(payment.amount),
              statusText(payment.status),
              payment.status === "draft" ? (
                <WorkflowActionButton key="pay" operation="payEmployee" state={state} runOperation={runOperation} isPending={isPending} label="Thanh toÃ¡n" targetId={payment.id} />
              ) : payment.status === "confirmed" ? (
                <div key="actions" className="table-actions">
                  <span className="muted">ÄÃ£ thanh toÃ¡n</span>
                  <WorkflowActionButton operation="reverseEmployeePayment" state={state} runOperation={runOperation} isPending={isPending} label="Äáº£o phiáº¿u" targetId={payment.id} />
                </div>
              ) : (
                <span key="done" className="muted">ÄÃ£ Ä‘áº£o</span>
              )
            ])}
          />
          <h4 className="section-heading">Phiáº¿u táº¡m á»©ng nhÃ¢n viÃªn</h4>
          <DataTable
            headers={["Phiáº¿u", "NhÃ¢n viÃªn", "Má»¥c Ä‘Ã­ch", "Sá»‘ tiá»n", "Tráº¡ng thÃ¡i", "HÃ nh Ä‘á»™ng"]}
            rows={state.employeeAdvances.map((advance) => [
              advance.documentNo,
              partyName(state, advance.employeeId),
              advance.purpose,
              formatMoney(advance.amount),
              statusText(advance.status),
              advance.status === "draft" ? (
                <WorkflowActionButton key="confirm" operation="confirmEmployeeAdvance" state={state} runOperation={runOperation} isPending={isPending} label="XÃ¡c nháº­n" targetId={advance.id} />
              ) : advance.status === "confirmed" ? (
                <WorkflowActionButton key="reverse" operation="reverseEmployeeAdvance" state={state} runOperation={runOperation} isPending={isPending} label="Äáº£o phiáº¿u" targetId={advance.id} />
              ) : (
                <span key="done" className="muted">ÄÃ£ Ä‘áº£o</span>
              )
            ])}
            emptyText="ChÆ°a cÃ³ phiáº¿u táº¡m á»©ng nhÃ¢n viÃªn."
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

function OpenWorkOrderClaimPanel({
  state,
  runOperation,
  isPending
}: {
  state: OperationsState;
  runOperation: OperationHandler;
  isPending: boolean;
}) {
  const openOrders = state.workOrders.filter((order) => order.status === "open" && Boolean(order.salesOrderId));
  const assignedOrders = state.workOrders.filter((order) => order.status === "assigned" && Boolean(order.salesOrderId));

  return (
    <>
      <section className="panel span-12">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Thong bao don moi</h3>
            <p className="panel-note">Don duoc khoa cho tho nhan hop le dau tien. Gia ban va cong no khong hien thi o day.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={['Phieu viec', 'Don ban', 'Cong viec', 'Ngay', 'Trang thai', 'Hanh dong']}
            rows={openOrders.map((order) => [
              order.documentNo,
              order.sourceDocument,
              salesOrderWorkType(order),
              order.workDate,
              statusText(order.status),
              <WorkflowActionButton
                key={order.id}
                operation="claimOpenSalesWorkOrder"
                state={state}
                runOperation={runOperation}
                isPending={isPending}
                label="Nhan don"
                targetId={order.id}
              />
            ])}
            emptyText="Chua co don moi dang cho nhan. Danh sach se tu cap nhat khi co don ban duoc xac nhan."
          />
        </div>
      </section>
      <section className="panel span-12">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Don da nhan</h3>
            <p className="panel-note">Chi hien thi cac don da khoa cho tai khoan cua ban.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={['Phieu viec', 'Don ban', 'Cong viec', 'Ngay', 'Trang thai', 'Hanh dong']}
            rows={assignedOrders.map((order) => [
              order.documentNo,
              order.sourceDocument,
              salesOrderWorkType(order),
              order.workDate,
              statusText(order.status),
              <WorkflowActionButton
                key={`${order.id}-location`}
                operation="recordWorkOrderLocation"
                state={state}
                runOperation={runOperation}
                isPending={isPending}
                label="Ghi vi tri"
                targetId={order.id}
              />
            ])}
            emptyText="Ban chua nhan don nao."
          />
        </div>
      </section>
    </>
  );
}

function salesOrderWorkType(order: { salesOrderId?: string; workType: string }) {
  return order.salesOrderId
    ? "\u004e\u0068\u1ead\u006e \u0076\u00e0 \u0063\u0068\u0075\u1ea9\u006e \u0062\u1ecb \u0111\u01a1\u006e \u0067\u0069\u0061\u006f \u0068\u00e0\u006e\u0067"
    : order.workType;
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
          <h3 className="panel-title">Phiáº¿u thanh toÃ¡n nhÃ¢n viÃªn</h3>
          <p className="panel-note">CÃ´ng cÃ²n pháº£i tráº£: {formatMoney(payable)}. Phiáº¿u nhÃ¡p chÆ°a giáº£m quá»¹.</p>
        </div>
      </div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => {
          createCommand({ type: "createEmployeePaymentDraft", employeeId: values.employeeId, amount: values.amount });
          reset({ employeeId: values.employeeId, amount: 0 });
        })}>
          <FormField label="NhÃ¢n viÃªn">
            <select className="input" {...register("employeeId", { required: "Chá»n nhÃ¢n viÃªn." })}>
              {state.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.code} Â· {employee.displayName}</option>)}
            </select>
          </FormField>
          <FormField label="Sá»‘ tiá»n" error={errors.amount?.message}>
            <input className="input" type="number" min="1" step="1000" {...register("amount", {
              valueAsNumber: true,
              min: { value: 1, message: "Sá»‘ tiá»n pháº£i lá»›n hÆ¡n 0." }
            })} />
          </FormField>
          <SubmitButton label="Táº¡o phiáº¿u thanh toÃ¡n" command="createEmployeePaymentDraft" isPending={isPending} disabled={isPending || state.employees.length === 0} />
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
          <h3 className="panel-title">Phiáº¿u táº¡m á»©ng nhÃ¢n viÃªn</h3>
          <p className="panel-note">Phiáº¿u nhÃ¡p chÆ°a lÃ m giáº£m quá»¹; khi xÃ¡c nháº­n sáº½ kháº¥u trá»« vÃ o sá»‘ dÆ° sá»• nhÃ¢n viÃªn.</p>
        </div>
      </div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => {
          createCommand({ type: "createEmployeeAdvanceDraft", ...values });
          reset({ employeeId: values.employeeId, purpose: "", amount: 0 });
        })}>
          <FormField label="NhÃ¢n viÃªn">
            <select className="input" {...register("employeeId", { required: "Chá»n nhÃ¢n viÃªn." })}>
              {state.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.code} Â· {employee.displayName}</option>)}
            </select>
          </FormField>
          <FormField label="Má»¥c Ä‘Ã­ch" error={errors.purpose?.message}>
            <input className="input" {...register("purpose", { required: "Nháº­p má»¥c Ä‘Ã­ch táº¡m á»©ng." })} />
          </FormField>
          <FormField label="Sá»‘ tiá»n" error={errors.amount?.message}>
            <input className="input" type="number" min="1" step="1000" {...register("amount", {
              valueAsNumber: true,
              min: { value: 1, message: "Sá»‘ tiá»n pháº£i lá»›n hÆ¡n 0." }
            })} />
          </FormField>
          <SubmitButton label="Táº¡o phiáº¿u táº¡m á»©ng" command="createEmployeeAdvanceDraft" isPending={isPending} disabled={isPending || state.employees.length === 0} />
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
            <h3 className="panel-title">Váº¥n Ä‘á» cáº§n kiá»ƒm tra trÆ°á»›c import</h3>
            <p className="panel-note">KhÃ´ng import cá»™t tá»•ng/cÃ²n láº¡i nhÆ° nguá»“n sá»± tháº­t.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Workbook", "SHA-256", "Trang giao dá»‹ch", "Sá»‘ dÃ²ng", "CÃ²n má»Ÿ / Tá»•ng", "Tráº¡ng thÃ¡i", "Thá»i Ä‘iá»ƒm"]}
            rows={state.importJobs.map((job) => {
              const openIssues = state.importIssues.filter((issue) => issue.importJobId === job.id && issue.status === "open").length;
              return [
                job.fileName,
                <code key="hash">{job.fileHash.slice(0, 12)}â€¦</code>,
                job.sheetNames.join(", "),
                job.rowCount.toString(),
                `${openIssues} / ${job.issueCount}`,
                job.status === "dry_run" ? "Chá» rÃ  soÃ¡t" : "ÄÃ£ rÃ  soÃ¡t",
                formatDateTime(job.createdAt)
              ];
            })}
            emptyText="ChÆ°a cÃ³ workbook nÃ o Ä‘Æ°á»£c cháº¡y thá»­."
          />
          <h4 className="section-heading">Váº¥n Ä‘á» cáº§n xá»­ lÃ½</h4>
          <DataTable
            headers={["Batch", "Trang tÃ­nh", "DÃ²ng", "Má»©c", "Váº¥n Ä‘á»", "Tráº¡ng thÃ¡i", "HÃ nh Ä‘á»™ng"]}
            rows={state.importIssues.map((issue) => [
              state.importJobs.find((job) => job.id === issue.importJobId)?.fileName ?? "Thá»§ cÃ´ng",
              issue.sourceSheet,
              issue.rowNumber.toString(),
              issue.severity === "error" ? "Lá»—i" : "Cáº£nh bÃ¡o",
              issue.message,
              statusText(issue.status),
              issue.status === "open" ? (
                <div key="actions" className="table-actions">
                  <WorkflowActionButton operation="resolveImportIssue" state={state} runOperation={runOperation} isPending={isPending} label="Xá»­ lÃ½" targetId={issue.id} />
                  <WorkflowActionButton operation="ignoreImportIssue" state={state} runOperation={runOperation} isPending={isPending} label="Bá» qua" targetId={issue.id} />
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
          <h3 className="panel-title">Cháº¡y thá»­ workbook</h3>
          <p className="panel-note">File .xlsx tá»‘i Ä‘a 40 MB. Cháº¡y thá»­ chá»‰ táº¡o batch vÃ  danh sÃ¡ch lá»—i, chÆ°a ghi giao dá»‹ch.</p>
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
          {file ? <p className="panel-note">{file.name} Â· {(file.size / 1024 / 1024).toFixed(1)} MB</p> : null}
          <SubmitButton label="Cháº¡y thá»­ import" command="createImportDryRun" isPending={isPending} disabled={isPending || !file} />
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
            <h3 className="panel-title">Kiá»ƒm tra tÃ­nh toÃ n váº¹n Audit</h3>
            <p className="panel-note">Äá»‘i chiáº¿u command Ä‘Ã£ xá»­ lÃ½, mÃ£ idempotency, quyá»n, áº£nh chá»¥p trÆ°á»›c/sau vÃ  lÃ½ do Ä‘áº£o chá»©ng tá»«.</p>
          </div>
          <span className={integrity.status === "healthy" ? "status status-confirmed" : "status status-danger"}>
            {integrity.status === "healthy" ? "ToÃ n váº¹n" : "Cáº§n kiá»ƒm tra"}
          </span>
        </div>
        <div className="panel-body">
          <div className="summary-grid">
            <SummaryItem label="Tá»•ng sá»± kiá»‡n" value={String(integrity.auditCount)} />
            <SummaryItem label="CÃ³ mÃ£ liÃªn káº¿t" value={String(integrity.correlatedCount)} />
            <SummaryItem label="Sá»± kiá»‡n Ä‘áº£o" value={String(integrity.reversalCount)} />
            <SummaryItem label="Lá»—i / cáº£nh bÃ¡o" value={`${errorCount} / ${warningCount}`} />
          </div>
          {integrity.issues.length > 0 ? (
            <ul className="audit-integrity-list">
              {integrity.issues.map((item, index) => (
                <li key={`${item.code}-${item.auditId ?? index}`} className={item.severity === "error" ? "audit-integrity-error" : "audit-integrity-warning"}>
                  <strong>{item.severity === "error" ? "Lá»—i" : "Cáº£nh bÃ¡o"}</strong> Â· {item.message}
                </li>
              ))}
            </ul>
          ) : <p className="integrity-ok"><CheckCircle2 aria-hidden="true" /> Má»i command Ä‘Ã£ xá»­ lÃ½ Ä‘á»u cÃ³ audit trail tÆ°Æ¡ng á»©ng.</p>}
        </div>
      </section>

      <section className="panel span-12">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Nháº­t kÃ½ kiá»ƒm toÃ¡n</h3>
            <p className="panel-note">Äang hiá»ƒn thá»‹ {filteredLogs.length} / {state.auditLogs.length} sá»± kiá»‡n.</p>
          </div>
          <button className="button button-small" type="button" onClick={exportAudit} disabled={filteredLogs.length === 0}>
            <Download aria-hidden="true" /> Xuáº¥t CSV
          </button>
        </div>
        <div className="panel-body">
          <div className="audit-filter-grid">
            <FormField label="TÃ¬m kiáº¿m">
              <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Command, chá»©ng tá»«, lÃ½ do..." />
            </FormField>
            <FormField label="NgÆ°á»i thao tÃ¡c">
              <select className="input" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
                <option value="all">Táº¥t cáº£</option>
                {actors.map((actor) => <option key={actor} value={actor}>{actor}</option>)}
              </select>
            </FormField>
            <FormField label="Command">
              <select className="input" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                <option value="all">Táº¥t cáº£</option>
                {actions.map((action) => <option key={action} value={action}>{action}</option>)}
              </select>
            </FormField>
            <FormField label="Tá»« ngÃ y">
              <input className="input" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </FormField>
            <FormField label="Äáº¿n ngÃ y">
              <input className="input" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </FormField>
          </div>
          <DataTable
            className="audit-data-table"
            headers={["Thá»i Ä‘iá»ƒm", "NgÆ°á»i thao tÃ¡c", "Command", "Target", "MÃ£ liÃªn káº¿t", "TÃ³m táº¯t", "Chi tiáº¿t"]}
            rows={filteredLogs.map((event) => [
              formatDateTime(event.occurredAt),
              event.actorName,
              event.action,
              event.targetId ?? "-",
              event.correlationId?.slice(0, 12) ?? "-",
              event.summary,
              <button key="view" className="button button-small" type="button" onClick={() => setSelectedAuditId(event.id)}>Xem</button>
            ])}
            emptyText="ChÆ°a cÃ³ nháº­t kÃ½ kiá»ƒm toÃ¡n."
          />
        </div>
      </section>
      {selectedAudit ? (
        <section className="panel span-12">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Chi tiáº¿t {selectedAudit.action}</h3>
              <p className="panel-note">{selectedAudit.actorName} Â· {formatDateTime(selectedAudit.occurredAt)} Â· {selectedAudit.permission ?? "KhÃ´ng cÃ³ quyá»n nguá»“n"}</p>
            </div>
            <button className="button button-small" type="button" onClick={() => setSelectedAuditId(undefined)}>ÄÃ³ng</button>
          </div>
          <div className="panel-body audit-detail-grid">
            <dl className="audit-metadata">
              <div><dt>Chá»©ng tá»« Ä‘Ã­ch</dt><dd>{selectedAudit.targetId ?? "-"}</dd></div>
              <div><dt>MÃ£ liÃªn káº¿t</dt><dd>{selectedAudit.correlationId ?? "-"}</dd></div>
              <div><dt>LÃ½ do</dt><dd>{selectedAudit.reason ?? "-"}</dd></div>
              <div><dt>Káº¿t quáº£</dt><dd>{selectedAudit.summary}</dd></div>
            </dl>
            <div>
              <h4 className="section-heading">TrÆ°á»›c thao tÃ¡c</h4>
              <pre className="audit-json">{JSON.stringify(selectedAudit.before ?? {}, null, 2)}</pre>
            </div>
            <div>
              <h4 className="section-heading">Sau thao tÃ¡c</h4>
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
            <h3 className="panel-title">Xuáº¥t bÃ¡o cÃ¡o thÃ¡ng</h3>
            <p className="panel-note">Xuáº¥t má»™t gÃ³i ZIP gá»“m bÃ¡o cÃ¡o CSV, dashboard HTML Ä‘Ã­nh kÃ¨m vÃ  manifest Ä‘á»ƒ Ä‘á»‘i soÃ¡t ná»™i dung file.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="report-export-grid">
            <FormField label="ThÃ¡ng bÃ¡o cÃ¡o">
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
              Xuáº¥t gÃ³i bÃ¡o cÃ¡o thÃ¡ng {monthlyReport.monthLabel}
            </button>
          </div>
          <div className="summary-grid report-summary-grid">
            <SummaryItem label="Doanh thu trÆ°á»›c VAT" value={formatMoney(monthlyReport.summary.salesNet)} />
            <SummaryItem label="GiÃ¡ vá»‘n" value={formatMoney(monthlyReport.summary.costOfGoodsSold)} />
            <SummaryItem label="LÃ£i gá»™p" value={formatMoney(monthlyReport.summary.grossProfit)} />
            <SummaryItem label="Tá»· suáº¥t lÃ£i gá»™p" value={`${(monthlyReport.summary.grossMarginRate * 100).toFixed(2)}%`} />
            <SummaryItem label="ÄÃ£ thu" value={formatMoney(monthlyReport.summary.customerCredit)} />
            <SummaryItem label="ÄÃ£ chi quá»¹" value={formatMoney(monthlyReport.summary.cashOut)} />
            <SummaryItem label="Tiá»n cÃ´ng phÃ¡t sinh" value={formatMoney(monthlyReport.summary.employeeCompensation)} />
          </div>
        </div>
      </section>
      <section className="panel span-4">
        <div className="panel-body metric-stack">
          <Metric label="Doanh thu Ä‘Ã£ ghi nháº­n" value={formatMoney(monthlyReport.summary.salesGross)} />
          <Metric label="Pháº£i thu khÃ¡ch" value={formatMoney(customer ? customerBalance(state.customerLedgerEntries, customer.id) : 0)} />
          <Metric label="Quá»¹ tiá»n máº·t" value={formatMoney(cashBalance(state))} />
        </div>
      </section>
      <section className="panel span-8">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Nguá»“n sá»‘ liá»‡u bÃ¡o cÃ¡o</h3>
            <p className="panel-note">Má»—i dÃ²ng Ä‘á»u truy ngÆ°á»£c Ä‘Æ°á»£c vá» chá»©ng tá»« nguá»“n.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["NhÃ³m", "Nguá»“n", "Sá»‘ dÃ²ng", "Ghi chÃº"]}
            rows={[
              ["CÃ´ng ná»£ KH", "Sá»• cÃ´ng ná»£ khÃ¡ch hÃ ng", state.customerLedgerEntries.length.toString(), "Pháº£i thu trá»« Ä‘Ã£ thu"],
              ["CÃ´ng ná»£ NCC", "Sá»• cÃ´ng ná»£ nhÃ  cung cáº¥p", state.supplierLedgerEntries.length.toString(), "Pháº£i tráº£ trá»« Ä‘Ã£ chi"],
              ["Kho", "PhÃ¡t sinh kho", state.inventoryMovements.length.toString(), "PhÃ¡t sinh kho chá»‰ ghi thÃªm"],
              ["DÃ²ng tiá»n", "Sá»• quá»¹", state.cashTransactions.length.toString(), "Phiáº¿u thu/chi Ä‘Ã£ xÃ¡c nháº­n"],
              ["Tiá»n cÃ´ng", "Sá»• tiá»n cÃ´ng nhÃ¢n viÃªn", state.employeeLedgerEntries.length.toString(), "Chá»‰ tá»« sáº£n lÆ°á»£ng Ä‘Ã£ duyá»‡t"]
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
          <h3 className="panel-title">Thao tÃ¡c nghiá»‡p vá»¥</h3>
          <p className="panel-note">Má»—i thao tÃ¡c cÃ³ khÃ³a chá»‘ng cháº¡y trÃ¹ng, nháº­t kÃ½ kiá»ƒm toÃ¡n vÃ  quy táº¯c kiá»ƒm tra.</p>
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
          <h3 className="panel-title">Táº¡o danh má»¥c nhanh</h3>
          <p className="panel-note">Dá»¯ liá»‡u ná»n Ä‘Æ°á»£c kiá»ƒm tra trÃ¹ng tÃªn/mÃ£ phÃ­a mÃ¡y chá»§ trÆ°á»›c khi lÆ°u.</p>
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
      <h4 className="form-title">KhÃ¡ch hÃ ng</h4>
      <FormField label="TÃªn khÃ¡ch hÃ ng" error={errors.displayName?.message}>
        <input className="input" {...register("displayName", { required: "Nháº­p tÃªn khÃ¡ch hÃ ng." })} />
      </FormField>
      <FormField label="Äiá»‡n thoáº¡i">
        <input className="input" {...register("phone")} />
      </FormField>
      <FormField label="Háº¡n má»©c ná»£" error={errors.creditLimit?.message}>
        <input
          className="input"
          type="number"
          min="0"
          step="1"
          {...register("creditLimit", {
            valueAsNumber: true,
            min: { value: 0, message: "KhÃ´ng Ä‘Æ°á»£c Ã¢m." }
          })}
        />
      </FormField>
      <SubmitButton label="Táº¡o khÃ¡ch hÃ ng" command="createCustomer" isPending={isPending} />
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
      <h4 className="form-title">ThÃªm nhÃ  cung cáº¥p</h4>
      <FormField label="TÃªn nhÃ  cung cáº¥p má»›i" error={errors.displayName?.message}>
        <input className="input" {...register("displayName", { required: "Nháº­p tÃªn nhÃ  cung cáº¥p." })} />
      </FormField>
      <FormField label="Äiá»‡n thoáº¡i">
        <input className="input" {...register("phone")} />
      </FormField>
      <SubmitButton label="ThÃªm vÃ o dropdown" command="createSupplier" isPending={isPending} />
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
      <h4 className="form-title">NhÃ  cung cáº¥p</h4>
      <FormField label="TÃªn nhÃ  cung cáº¥p" error={errors.displayName?.message}>
        <input className="input" {...register("displayName", { required: "Nháº­p tÃªn nhÃ  cung cáº¥p." })} />
      </FormField>
      <FormField label="Äiá»‡n thoáº¡i">
        <input className="input" {...register("phone")} />
      </FormField>
      <SubmitButton label="Táº¡o nhÃ  cung cáº¥p" command="createSupplier" isPending={isPending} />
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
      baseProducts.length > 0 ? baseProducts.map((product) => product.productName).join(", ") : "KhÃ´ng",
      conversionCount,
      baseProducts.length > 0 ? (
        <span className="muted">KhÃ´ng thá»ƒ xÃ³a khi Ä‘ang dÃ¹ng lÃ m Ä‘Æ¡n vá»‹ tá»“n kho</span>
      ) : pendingDelete === deleteKey ? (
        <div className="delete-confirmation">
          <span>XÃ³a Ä‘Æ¡n vá»‹ vÃ  {conversionCount} quy Ä‘á»•i hiá»‡n táº¡i?</span>
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
            XÃ¡c nháº­n xÃ³a
          </button>
          <button className="button button-small" type="button" onClick={() => setPendingDelete(null)}>Há»§y</button>
        </div>
      ) : (
        <button
          className="button button-small"
          type="button"
          disabled={isPending || !canManage}
          onClick={() => setPendingDelete(deleteKey)}
        >
          <Trash2 aria-hidden="true" />
          XÃ³a
        </button>
      )
    ];
  });

  const conversionRows: ReactNode[][] = state.purchaseUnitConversions.map((conversion) => {
    const product = state.productUnits.find((item) => item.id === conversion.productUnitId);
    const unit = state.unitDefinitions.find((item) => item.id === conversion.unitId);
    const deleteKey = `conversion:${conversion.id}`;
    return [
      product ? `${product.productCode} Â· ${product.productName}` : conversion.productUnitId,
      conversion.conversionMode === "variable"
        ? `${displayUnitName(unit?.name)} Â· nháº­p ${displayUnitName(product?.unitName)} thá»±c táº¿ trÃªn tá»«ng Ä‘Æ¡n mua`
        : `1 ${displayUnitName(unit?.name)} = ${formatQuantity(conversion.factorToBase ?? 0)} ${displayUnitName(product?.unitName)}`,
      `v${conversion.version}`,
      pendingDelete === deleteKey ? (
        <div className="delete-confirmation">
          <span>XÃ³a quy Ä‘á»•i nÃ y? Chá»©ng tá»« cÅ© khÃ´ng thay Ä‘á»•i.</span>
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
            XÃ¡c nháº­n xÃ³a
          </button>
          <button className="button button-small" type="button" onClick={() => setPendingDelete(null)}>Há»§y</button>
        </div>
      ) : (
        <button
          className="button button-small"
          type="button"
          disabled={isPending || !canManage}
          onClick={() => setPendingDelete(deleteKey)}
        >
          <Trash2 aria-hidden="true" />
          XÃ³a quy Ä‘á»•i
        </button>
      )
    ];
  });

  return (
    <section className="panel span-12">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">CÃ i Ä‘áº·t Ä‘Æ¡n vá»‹ mua</h3>
          <p className="panel-note">Tá»± táº¡o Ä‘Æ¡n vá»‹ vÃ  chá»n cÃ¡ch tÃ­nh riÃªng cho tá»«ng váº­t tÆ°. Chá»©ng tá»« Ä‘Ã£ táº¡o luÃ´n giá»¯ nguyÃªn dá»¯ liá»‡u cÅ©.</p>
        </div>
        {hasPurchaseUnitSettings ? pendingDelete === resetSettingsKey ? (
          <div className="delete-confirmation">
            <span>XÃ³a toÃ n bá»™ Ä‘Æ¡n vá»‹ mua vÃ  cÃ¡ch tÃ­nh hiá»‡n táº¡i?</span>
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
              XÃ¡c nháº­n xÃ³a
            </button>
            <button className="button button-small" type="button" onClick={() => setPendingDelete(null)}>Há»§y</button>
          </div>
        ) : (
          <button
            className="button button-small"
            type="button"
            disabled={isPending || !canManage}
            onClick={() => setPendingDelete(resetSettingsKey)}
          >
            <Trash2 aria-hidden="true" />
            XÃ³a cÃ i Ä‘áº·t hiá»‡n táº¡i
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
            <h4 className="form-title">ThÃªm Ä‘Æ¡n vá»‹</h4>
            <FormField label="TÃªn Ä‘Æ¡n vá»‹" error={unitForm.formState.errors.name?.message}>
              <input
                className="input"
                placeholder="VÃ­ dá»¥: Táº¥n, Táº¡, Xe"
                {...unitForm.register("name", { required: "Nháº­p tÃªn Ä‘Æ¡n vá»‹." })}
              />
            </FormField>
            <SubmitButton label="ThÃªm Ä‘Æ¡n vá»‹" command="createUnitDefinition" isPending={isPending} />
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
            <h4 className="form-title">ÄÆ¡n vá»‹ mua theo váº­t tÆ°</h4>
            <FormField label="Váº­t tÆ°">
              <select
                className="input"
                {...conversionForm.register("productUnitId", {
                  required: "Chá»n váº­t tÆ°.",
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
            <FormField label="ÄÆ¡n vá»‹ mua" error={conversionForm.formState.errors.unitId?.message}>
              <select
                className="input"
                disabled={availableUnits.length === 0}
                {...conversionForm.register("unitId", {
                  required: "Chá»n Ä‘Æ¡n vá»‹ mua.",
                  onChange: (event) => syncConversion(selectedProductUnitId, event.target.value)
                })}
              >
                <option value="">{availableUnits.length === 0 ? "ChÆ°a cÃ³ Ä‘Æ¡n vá»‹ mua" : "Chá»n Ä‘Æ¡n vá»‹ mua"}</option>
                {availableUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{displayUnitName(unit.name)}</option>
                ))}
              </select>
            </FormField>
            <FormField label="CÃ¡ch tÃ­nh">
              <select className="input" {...conversionForm.register("conversionMode") }>
                <option value="fixed">Quy Ä‘á»•i cá»‘ Ä‘á»‹nh</option>
                <option value="variable">Nháº­p sá»‘ lÆ°á»£ng thá»±c táº¿ má»—i láº§n mua</option>
              </select>
            </FormField>
            {selectedMode === "fixed" ? (
              <FormField
                label={`Sá»‘ ${displayUnitName(selectedProduct?.unitName)} trong 1 ${displayUnitName(selectedUnit?.name)}`}
                error={conversionForm.formState.errors.factorToBase?.message}
              >
                <input
                  className="input"
                  type="number"
                  min="0.001"
                  step="0.001"
                  {...conversionForm.register("factorToBase", {
                    valueAsNumber: true,
                    required: "Nháº­p há»‡ sá»‘ quy Ä‘á»•i.",
                    min: { value: 0.001, message: "Há»‡ sá»‘ pháº£i lá»›n hÆ¡n 0." }
                  })}
                />
              </FormField>
            ) : null}
            <p className="conversion-note">
              {selectedMode === "fixed"
                ? `1 ${displayUnitName(selectedUnit?.name)} = ${formatQuantity(Number(selectedFactor || 0))} ${displayUnitName(selectedProduct?.unitName)}`
                : `Má»—i Ä‘Æ¡n mua sáº½ nháº­p tá»•ng ${displayUnitName(selectedProduct?.unitName)} thá»±c nháº­n, khÃ´ng dÃ¹ng há»‡ sá»‘ cá»‘ Ä‘á»‹nh.`}
            </p>
            <SubmitButton
              label={selectedConversion ? "Cáº­p nháº­t quy Ä‘á»•i" : "LÆ°u quy Ä‘á»•i"}
              command="upsertPurchaseUnitConversion"
              isPending={isPending}
              disabled={isPending || availableUnits.length === 0}
            />
          </form>
        </div>

        <h4 className="section-heading">Danh má»¥c Ä‘Æ¡n vá»‹</h4>
        <DataTable
          headers={["ÄÆ¡n vá»‹", "ÄÆ¡n vá»‹ tá»“n kho cá»§a", "Sá»‘ cÃ¡ch tÃ­nh", "HÃ nh Ä‘á»™ng"]}
          rows={unitRows}
          emptyText="ChÆ°a cÃ³ Ä‘Æ¡n vá»‹. HÃ£y thÃªm Ä‘Æ¡n vá»‹ trÆ°á»›c khi táº¡o váº­t tÆ°."
        />
        <h4 className="section-heading">CÃ¡ch tÃ­nh Ä‘ang Ã¡p dá»¥ng</h4>
        <DataTable
          headers={["Váº­t tÆ°", "CÃ¡ch tÃ­nh", "PhiÃªn báº£n", "HÃ nh Ä‘á»™ng"]}
          rows={conversionRows}
          emptyText="ChÆ°a cÃ³ cÃ¡ch tÃ­nh Ä‘Æ¡n vá»‹ mua."
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
      <h4 className="form-title">Váº­t tÆ°</h4>
      <FormField label="MÃ£ váº­t tÆ°" error={errors.productCode?.message}>
        <input className="input" {...register("productCode", { required: "Nháº­p mÃ£ váº­t tÆ°." })} />
      </FormField>
      <FormField label="TÃªn váº­t tÆ°" error={errors.productName?.message}>
        <input className="input" {...register("productName", { required: "Nháº­p tÃªn váº­t tÆ°." })} />
      </FormField>
      <FormField label="ÄÆ¡n vá»‹ tá»“n kho gá»‘c" error={errors.unitName?.message}>
        <select className="input" disabled={state.unitDefinitions.length === 0} {...register("unitName", { required: "Chá»n Ä‘Æ¡n vá»‹ tá»“n kho gá»‘c." })}>
          <option value="">Chá»n Ä‘Æ¡n vá»‹</option>
          {state.unitDefinitions.filter((unit) => unit.status === "active").map((unit) => (
            <option key={unit.id} value={unit.name}>{displayUnitName(unit.name)}</option>
          ))}
        </select>
      </FormField>
      <SubmitButton label="Táº¡o váº­t tÆ°" command="createProductUnit" isPending={isPending} disabled={isPending || state.unitDefinitions.length === 0} />
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
      <h4 className="form-title">Kho / bÃ£i</h4>
      <FormField label="MÃ£ kho" error={errors.code?.message}>
        <input className="input" {...register("code", { required: "Nháº­p mÃ£ kho." })} />
      </FormField>
      <FormField label="TÃªn kho" error={errors.name?.message}>
        <input className="input" {...register("name", { required: "Nháº­p tÃªn kho." })} />
      </FormField>
      <SubmitButton label="Táº¡o kho" command="createWarehouse" isPending={isPending} />
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
      <h4 className="form-title">PhÆ°Æ¡ng tiá»‡n</h4>
      <FormField label="MÃ£ xe" error={errors.code?.message}>
        <input className="input" {...register("code", { required: "Nháº­p mÃ£ xe." })} />
      </FormField>
      <FormField label="Biá»ƒn sá»‘" error={errors.plateNumber?.message}>
        <input className="input" {...register("plateNumber", { required: "Nháº­p biá»ƒn sá»‘ xe." })} />
      </FormField>
      <FormField label="Táº£i trá»ng (táº¥n)" error={errors.capacityTons?.message}>
        <input className="input" type="number" min="0.1" step="0.1" {...register("capacityTons", {
          valueAsNumber: true,
          min: { value: 0.1, message: "Táº£i trá»ng pháº£i lá»›n hÆ¡n 0." }
        })} />
      </FormField>
      <SubmitButton label="Táº¡o xe" command="createVehicle" isPending={isPending} />
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
      <h4 className="form-title">NhÃ¢n sá»±</h4>
      <FormField label="TÃªn nhÃ¢n viÃªn" error={errors.displayName?.message}>
        <input className="input" {...register("displayName", { required: "Nháº­p tÃªn nhÃ¢n viÃªn." })} />
      </FormField>
      <FormField label="Vai trÃ²">
        <select className="input" {...register("roleType")}>
          <option value="worker">Thá»£</option>
          <option value="driver">TÃ i xáº¿</option>
          <option value="warehouse">Kho</option>
          <option value="sales">BÃ¡n hÃ ng</option>
          <option value="accountant">Káº¿ toÃ¡n</option>
          <option value="supervisor">GiÃ¡m sÃ¡t</option>
        </select>
      </FormField>
      <SubmitButton label="Táº¡o nhÃ¢n sá»±" command="createEmployee" isPending={isPending} />
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
          <h3 className="panel-title">Táº¡o Ä‘Æ¡n bÃ¡n nhÃ¡p</h3>
          <p className="panel-note">GiÃ¡ vÃ  VAT Ä‘Æ°á»£c giá»¯ theo dÃ²ng Ä‘Æ¡n khi xÃ¡c nháº­n.</p>
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
          <FormField label="KhÃ¡ch hÃ ng">
            <select className="input" {...register("customerId", { required: "Chá»n khÃ¡ch hÃ ng." })}>
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
                  <legend>DÃ²ng {index + 1}</legend>
                  <button className="button button-small" type="button" disabled={fields.length === 1 || isPending} onClick={() => remove(index)}>
                    <Trash2 aria-hidden="true" />
                    XÃ³a dÃ²ng
                  </button>
                </div>
                <FormField label="Váº­t tÆ°" error={errors.lines?.[index]?.productUnitId?.message}>
                  <select className="input" {...register(`lines.${index}.productUnitId`, {
                    required: "Chá»n váº­t tÆ°.",
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
                  <FormField label="ÄÆ¡n vá»‹ bÃ¡n">
                    <select className="input" {...register(`lines.${index}.unitName`, { required: "Chá»n Ä‘Æ¡n vá»‹ bÃ¡n." })}>
                      {documentUnitOptions(state, watchedLines?.[index]?.productUnitId ?? "").map((unit) => (
                        <option key={unit} value={unit}>{displayUnitName(unit)}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField
                    label={`Quy Ä‘á»•i 1 ${displayUnitName(watchedLines?.[index]?.unitName)} vá» ${displayUnitName(productBaseUnit(state, watchedLines?.[index]?.productUnitId ?? ""))}`}
                    error={errors.lines?.[index]?.unitFactor?.message}
                  >
                    <input
                      className="input"
                      type="number"
                      min="0.001"
                      step="0.001"
                      disabled={usesProductBaseUnit(state, watchedLines?.[index]?.productUnitId ?? "", watchedLines?.[index]?.unitName)}
                      {...register(`lines.${index}.unitFactor`, { valueAsNumber: true, min: { value: 0.001, message: "Há»‡ sá»‘ pháº£i lá»›n hÆ¡n 0." } })}
                    />
                  </FormField>
                </div>
                <div className="document-line-grid">
                  <FormField label={`Sá»‘ lÆ°á»£ng (${displayUnitName(watchedLines?.[index]?.unitName)})`} error={errors.lines?.[index]?.quantity?.message}>
                    <input className="input" type="number" min="0.001" step="0.001" {...register(`lines.${index}.quantity`, {
                      valueAsNumber: true,
                      min: { value: 0.001, message: "Sá»‘ lÆ°á»£ng pháº£i lá»›n hÆ¡n 0." }
                    })} />
                  </FormField>
                  <FormField label={`ÄÆ¡n giÃ¡ / ${displayUnitName(watchedLines?.[index]?.unitName)}`} error={errors.lines?.[index]?.unitPrice?.message}>
                    <input className="input" type="number" min="0" step="1" {...register(`lines.${index}.unitPrice`, {
                      valueAsNumber: true,
                      min: { value: 0, message: "ÄÆ¡n giÃ¡ khÃ´ng Ä‘Æ°á»£c Ã¢m." }
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
            ThÃªm dÃ²ng váº­t tÆ°
          </button>
          <FormField label="áº¢nh chá»©ng tá»« bÃ¡n (khÃ´ng báº¯t buá»™c)">
            <input
              className="input file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(event) => setDocumentImage(event.target.files?.[0] ?? null)}
            />
            {documentImage ? <p className="panel-note">{documentImage.name} Â· {(documentImage.size / 1024 / 1024).toFixed(1)} MB</p> : null}
          </FormField>
          <SubmitButton label="Táº¡o Ä‘Æ¡n bÃ¡n" command="createSalesOrderDraft" isPending={isPending} disabled={disabled} />
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
          <h3 className="panel-title">Táº¡o Ä‘Æ¡n mua nhÃ¡p</h3>
          <p className="panel-note">Chá»n rÃµ nháº­p kho hay giao tháº³ng Ä‘á»ƒ trÃ¡nh ghi kho sai.</p>
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
          <FormField label="NhÃ  cung cáº¥p">
            <select className="input" {...register("supplierId", { required: "Chá»n nhÃ  cung cáº¥p." })}>
              {state.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} Â· {supplier.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <div className="document-lines">
            {fields.map((field, index) => (
              <fieldset className="document-line" key={field.id}>
                <div className="document-line-header">
                  <legend>DÃ²ng {index + 1}</legend>
                  <button className="button button-small" type="button" disabled={fields.length === 1 || isPending} onClick={() => remove(index)}>
                    <Trash2 aria-hidden="true" />
                    XÃ³a dÃ²ng
                  </button>
                </div>
                <FormField label="Váº­t tÆ°" error={errors.lines?.[index]?.productUnitId?.message}>
                    <select className="input" {...register(`lines.${index}.productUnitId`, {
                      required: "Chá»n váº­t tÆ°.",
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
                  <FormField label="ÄÆ¡n vá»‹ mua">
                    <select className="input" {...register(`lines.${index}.unitName`, {
                      required: "Chá»n Ä‘Æ¡n vá»‹ mua.",
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
                      <option value="" disabled>ChÃ¡Â»Ân Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ mua</option>
                      {purchaseDocumentUnitOptions(state, watchedLines?.[index]?.productUnitId ?? "").map((unit) => (
                        <option key={unit} value={unit}>{displayUnitName(unit)}</option>
                      ))}
                    </select>
                  </FormField>
                  {isVariablePurchaseUnit(state, watchedLines?.[index]?.productUnitId ?? "", watchedLines?.[index]?.unitName) ? (
                    <FormField
                      label={`Tá»•ng ${displayUnitName(productBaseUnit(state, watchedLines?.[index]?.productUnitId ?? ""))} thá»±c nháº­n`}
                      error={errors.lines?.[index]?.actualBaseQuantity?.message}
                    >
                      <input
                        className="input"
                        type="number"
                        min="0.001"
                        step="0.001"
                        {...register(`lines.${index}.actualBaseQuantity`, {
                          valueAsNumber: true,
                          required: "Nháº­p sá»‘ lÆ°á»£ng thá»±c nháº­n.",
                          min: { value: 0.001, message: "Sá»‘ lÆ°á»£ng thá»±c nháº­n pháº£i lá»›n hÆ¡n 0." }
                        })}
                      />
                    </FormField>
                  ) : (
                    <FormField
                      label={`Quy Ä‘á»•i 1 ${displayUnitName(watchedLines?.[index]?.unitName)} vá» ${displayUnitName(productBaseUnit(state, watchedLines?.[index]?.productUnitId ?? ""))}`}
                      error={errors.lines?.[index]?.unitFactor?.message}
                    >
                      <input
                        className="input"
                        type="number"
                        min="0.001"
                        step="0.001"
                        readOnly
                        title="Há»‡ sá»‘ Ä‘Æ°á»£c quáº£n lÃ½ táº¡i Danh má»¥c > CÃ i Ä‘áº·t Ä‘Æ¡n vá»‹ mua."
                        {...register(`lines.${index}.unitFactor`, { valueAsNumber: true, min: { value: 0.001, message: "Há»‡ sá»‘ pháº£i lá»›n hÆ¡n 0." } })}
                      />
                    </FormField>
                  )}
                </div>
                <FormField label="Äiá»ƒm nháº­n">
                  <select className="input" {...register(`lines.${index}.destinationType`)}>
                    <option value="warehouse">Kho cá»­a hÃ ng</option>
                    <option value="customer_direct">Giao tháº³ng khÃ¡ch</option>
                  </select>
                </FormField>
                {watchedLines?.[index]?.destinationType === "customer_direct" ? (
                  <FormField label="KhÃ¡ch nháº­n">
                    <select className="input" {...register(`lines.${index}.customerId`, { required: "Chá»n khÃ¡ch nháº­n." })}>
                      {state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}
                    </select>
                  </FormField>
                ) : null}
                <div className="document-line-grid">
                  <FormField label={`Sá»‘ lÆ°á»£ng mua (${displayUnitName(watchedLines?.[index]?.unitName)})`} error={errors.lines?.[index]?.orderedQuantity?.message}>
                    <input className="input" type="number" min="0.001" step="0.001" {...register(`lines.${index}.orderedQuantity`, {
                      valueAsNumber: true,
                      min: { value: 0.001, message: "Sá»‘ lÆ°á»£ng mua pháº£i lá»›n hÆ¡n 0." }
                    })} />
                  </FormField>
                  <FormField label={`GiÃ¡ mua / ${displayUnitName(watchedLines?.[index]?.unitName)}`} error={errors.lines?.[index]?.unitCost?.message}>
                    <input className="input" type="number" min="0" step="1" {...register(`lines.${index}.unitCost`, {
                      valueAsNumber: true,
                      min: { value: 0, message: "GiÃ¡ mua khÃ´ng Ä‘Æ°á»£c Ã¢m." }
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
            ThÃªm dÃ²ng mua
          </button>
          <FormField label="áº¢nh chá»©ng tá»« mua (khÃ´ng báº¯t buá»™c)">
            <input
              className="input file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(event) => setDocumentImage(event.target.files?.[0] ?? null)}
            />
            {documentImage ? <p className="panel-note">{documentImage.name} Â· {(documentImage.size / 1024 / 1024).toFixed(1)} MB</p> : null}
          </FormField>
          <SubmitButton label="Táº¡o Ä‘Æ¡n mua" command="createPurchaseOrderDraft" isPending={isPending} disabled={disabled} />
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
          <h3 className="panel-title">Táº¡o chuyáº¿n giao</h3>
          <p className="panel-note">Chuyáº¿n má»›i á»Ÿ tráº¡ng thÃ¡i Ä‘Ã£ phÃ¢n cÃ´ng, chÆ°a ghi xuáº¥t kho.</p>
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
          <FormField label="ÄÆ¡n bÃ¡n">
            <select className="input" {...register("salesOrderId", { required: true })}>
              {eligibleOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.documentNo} Â· {partyName(state, order.customerId)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="TÃ i xáº¿">
            <select className="input" {...register("driverId", { required: true })}>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Xe giao hÃ ng">
            <select className="input" {...register("vehicleId", { required: true })}>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.code} Â· {vehicle.plateNumber} Â· {formatQuantity(vehicle.capacityTons)} táº¥n
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="NgÃ y giao">
            <input className="input" type="date" {...register("plannedDate", { required: true })} />
          </FormField>
          <SubmitButton label="Táº¡o chuyáº¿n" command="createDeliveryJob" isPending={isPending} disabled={disabled} />
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
          <h3 className="panel-title">Táº¡o phiáº¿u thu nhÃ¡p</h3>
          <p className="panel-note">XÃ¡c nháº­n phiáº¿u thu má»›i ghi tiá»n máº·t vÃ  sá»• cÃ´ng ná»£ khÃ¡ch hÃ ng.</p>
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
          <FormField label="KhÃ¡ch hÃ ng">
            <select className="input" {...register("customerId", { required: true })}>
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Sá»‘ tiá»n thu" error={errors.amount?.message}>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              {...register("amount", {
                valueAsNumber: true,
                min: { value: 1, message: "Sá»‘ tiá»n thu pháº£i lá»›n hÆ¡n 0." }
              })}
            />
          </FormField>
          <SubmitButton label="Táº¡o phiáº¿u thu" command="createCustomerPaymentDraft" isPending={isPending} disabled={disabled} />
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
          <h3 className="panel-title">Táº¡o phiáº¿u chi NCC</h3>
          <p className="panel-note">Phiáº¿u nhÃ¡p chÆ°a lÃ m giáº£m pháº£i tráº£ cho Ä‘áº¿n khi xÃ¡c nháº­n.</p>
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
          <FormField label="NhÃ  cung cáº¥p">
            <select className="input" {...register("supplierId", { required: true })}>
              {state.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} Â· {supplier.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Sá»‘ tiá»n chi" error={errors.amount?.message}>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              {...register("amount", {
                valueAsNumber: true,
                min: { value: 1, message: "Sá»‘ tiá»n chi pháº£i lá»›n hÆ¡n 0." }
              })}
            />
          </FormField>
          <SubmitButton label="Táº¡o phiáº¿u chi" command="createSupplierPaymentDraft" isPending={isPending} disabled={disabled} />
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
          <h3 className="panel-title">Táº¡o phiáº¿u cÃ´ng</h3>
          <p className="panel-note">Sáº£n lÆ°á»£ng pháº£i Ä‘Æ°á»£c duyá»‡t trÆ°á»›c khi ghi nháº­n báº£ng cÃ´ng.</p>
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
          <FormField label="NhÃ¢n viÃªn">
            <select className="input" {...register("employeeId", { required: true })}>
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.displayName} Â· {roleText(employee.roleType)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Sáº£n lÆ°á»£ng">
            <select className="input" {...register("productUnitId", { required: true })}>
              {state.productUnits.map((product) => (
                <option key={product.id} value={product.id}>
                  {productLabel(state, product.id)}
                </option>
              ))}
            </select>
          </FormField>
          <ProductCatalogPreview state={state} productUnitId={selectedProductUnitId} />
          <FormField label="Sá»‘ lÆ°á»£ng thá»±c táº¿" error={errors.actualQuantity?.message}>
            <input
              className="input"
              type="number"
              min="0.001"
              step="0.001"
              {...register("actualQuantity", {
                valueAsNumber: true,
                min: { value: 0.001, message: "Sáº£n lÆ°á»£ng pháº£i lá»›n hÆ¡n 0." }
              })}
            />
          </FormField>
          <FormField label="Tá»•ng tiá»n cÃ´ng" error={errors.totalAmount?.message}>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              {...register("totalAmount", {
                valueAsNumber: true,
                min: { value: 1, message: "Tá»•ng tiá»n cÃ´ng pháº£i lá»›n hÆ¡n 0." }
              })}
            />
          </FormField>
          <SubmitButton label="Táº¡o phiáº¿u cÃ´ng" command="createWorkOrderDraft" isPending={isPending} disabled={disabled} />
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
          <h3 className="panel-title">Táº¡o váº¥n Ä‘á» import</h3>
          <p className="panel-note">DÃ²ng nghi ngá» pháº£i Ä‘Æ°á»£c review trÆ°á»›c khi nháº­p chÃ­nh thá»©c.</p>
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
          <FormField label="Trang tÃ­nh" error={errors.sourceSheet?.message}>
            <input className="input" {...register("sourceSheet", { required: "Nháº­p tÃªn trang tÃ­nh." })} />
          </FormField>
          <FormField label="DÃ²ng" error={errors.rowNumber?.message}>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              {...register("rowNumber", {
                valueAsNumber: true,
                min: { value: 1, message: "Sá»‘ dÃ²ng pháº£i lá»›n hÆ¡n 0." }
              })}
            />
          </FormField>
          <FormField label="Má»©c">
            <select className="input" {...register("severity")}>
              <option value="warning">Cáº£nh bÃ¡o</option>
              <option value="error">Lá»—i</option>
            </select>
          </FormField>
          <FormField label="Váº¥n Ä‘á»" error={errors.message?.message}>
            <textarea className="input textarea" rows={3} {...register("message", { required: "Nháº­p ná»™i dung váº¥n Ä‘á»." })} />
          </FormField>
          <SubmitButton label="Táº¡o váº¥n Ä‘á»" command="createImportIssue" isPending={isPending} />
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
        <dt>MÃ£ váº­t tÆ°</dt>
        <dd>{product.productCode}</dd>
      </div>
      <div className="reference-item">
        <dt>TÃªn váº­t tÆ°</dt>
        <dd>{product.productName}</dd>
      </div>
      <div className="reference-item">
        <dt>ÄÆ¡n vá»‹ tá»“n kho</dt>
        <dd>{displayUnitName(product.unitName)}</dd>
      </div>
      <div className="reference-item">
        <dt>Tá»“n kho</dt>
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
      title={authorized ? undefined : `${actor.displayName} khÃ´ng cÃ³ quyá»n ${permission}.`}
    >
      <PlusCircle aria-hidden="true" />
      {isPending ? "Äang lÆ°u..." : label}
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
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [accuracyMeters, setAccuracyMeters] = useState("");
  const [locationSource, setLocationSource] = useState<"gps" | "manual">("gps");
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
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
  const needsDeliveryImage = operation === "submitDeliveryCompletion";
  const needsPaymentAllocation = operation === "allocateCustomerPayment" || operation === "allocateSupplierPayment";
  const needsLocation = operation === "recordWorkOrderLocation";
  const needsDetails = needsReason || needsQuantity || needsReceiptImage || needsDeliveryImage || needsDeliveryConfirmation || needsPaymentAllocation || needsLocation;
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
  const targetWorkOrder = targetId ? state.workOrders.find((order) => order.id === targetId) : undefined;

  function openDetails() {
    if (needsQuantity && !quantity && targetId) {
      const purchase = findPurchaseLineForUi(state, targetId);
      if (purchase) {
        setQuantity(String((purchase.line.orderedQuantity - purchase.line.receivedQuantity) / lineDocumentFactor(purchase.line)));
      }
    }
    if (needsLocation && !latitude && !longitude) {
      setLatitude("");
      setLongitude("");
      setAccuracyMeters("");
      setLocationSource("gps");
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
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const parsedAccuracy = accuracyMeters.trim() === "" ? undefined : Number(accuracyMeters);
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
    if (needsLocation) {
      if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
        return;
      }
        options.location = {
          latitude: parsedLatitude,
          longitude: parsedLongitude,
          source: locationSource,
          recordedAt: new Date().toISOString(),
          accuracyMeters: parsedAccuracy === undefined || !Number.isFinite(parsedAccuracy) ? undefined : parsedAccuracy
        };
    }
    runOperation(operation, targetId, options, () => setExpanded(false), receiptImage ?? undefined);
  }

  function readCurrentLocation() {
    if (!navigator.geolocation) {
      setAccuracyMeters("0");
      return;
    }
    setIsFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(String(position.coords.latitude));
        setLongitude(String(position.coords.longitude));
        setAccuracyMeters(position.coords.accuracy >= 0 ? String(position.coords.accuracy) : "");
        setLocationSource("gps");
        setIsFetchingLocation(false);
      },
      () => {
        setIsFetchingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  return (
    <div className="workflow-action">
      <button
        className="button button-small table-action"
        type="button"
        disabled={!readiness.canRun || isPending}
        title={readiness.canRun ? operationDescriptions[operation] : readiness.reason}
        aria-expanded={needsDetails ? expanded : undefined}
        onClick={() => needsDetails ? openDetails() : runOperation(
          operation,
          targetId,
          operation === "claimOpenSalesWorkOrder" ? { expectedVersion: targetWorkOrder?.version ?? 1 } : undefined
        )}
      >
        {label ?? operationLabels[operation]}
      </button>
      {expanded ? (
        <div className="inline-action-form">
          {needsReason ? (
            <FormField label="LÃ½ do báº¯t buá»™c">
              <textarea className="input" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
            </FormField>
          ) : null}
          {needsQuantity ? (
            <>
              <FormField label={`Sá»‘ lÆ°á»£ng thá»±c táº¿ (${displayUnitName(targetPurchase ? lineDocumentUnitName(state, targetPurchase.line) : undefined)})`}>
                <input className="input" type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </FormField>
              {targetPurchase && lineDocumentFactor(targetPurchase.line) !== 1 ? (
                <p className="conversion-note">Há»‡ thá»‘ng sáº½ ghi {formatQuantity(Number(quantity || 0) * lineDocumentFactor(targetPurchase.line))} {displayUnitName(productBaseUnit(state, targetPurchase.line.productUnitId))} vÃ o sá»•.</p>
              ) : null}
            </>
          ) : null}
          {needsReceiptImage ? (
            <FormField label="áº¢nh thá»±c nháº­n báº¯t buá»™c">
              <input
                className="input file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(event) => setReceiptImage(event.target.files?.[0] ?? null)}
              />
              <p className="conversion-note">Chá»¥p rÃµ hÃ ng, xe hoáº·c phiáº¿u cÃ¢n Ä‘á»ƒ Chá»§ cá»­a hÃ ng/Káº¿ toÃ¡n kiá»ƒm tra trÆ°á»›c khi duyá»‡t.</p>
              {receiptImage ? <p className="muted">ÄÃ£ chá»n: {receiptImage.name}</p> : null}
            </FormField>
          ) : null}
          {needsDeliveryConfirmation ? (
            <>
              {needsDeliveryImage ? (
                <FormField label="áº¢nh xÃ¡c nháº­n Ä‘Ã£ giao báº¯t buá»™c">
                  <input
                    className="input file-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={(event) => setReceiptImage(event.target.files?.[0] ?? null)}
                  />
                  <p className="conversion-note">Chá»¥p rÃµ hÃ ng Ä‘Ã£ giao táº¡i Ä‘iá»ƒm nháº­n. áº¢nh Ä‘Æ°á»£c gá»­i riÃªng cho Chá»§ cá»­a hÃ ng/Káº¿ toÃ¡n duyá»‡t.</p>
                  {receiptImage ? <p className="muted">ÄÃ£ chá»n: {receiptImage.name}</p> : null}
                </FormField>
              ) : null}
              <FormField label="NgÆ°á»i nháº­n">
                <input className="input" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
              </FormField>
              <FormField label="Báº±ng chá»©ng giao nháº­n">
                <input className="input" placeholder="Sá»‘ phiáº¿u, áº£nh hoáº·c chá»¯ kÃ½" value={evidence} onChange={(event) => setEvidence(event.target.value)} />
              </FormField>
              {openDeliveryLines.map((line) => (
                <FormField key={line.id} label={`${productLabel(state, line.productUnitId)} Â· thá»±c giao (${displayUnitName(lineDocumentUnitName(state, line))})`}>
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
          {needsLocation ? (
            <>
              <div className="inline-location-actions">
                <button
                  className="button button-small"
                  type="button"
                  disabled={isPending || isFetchingLocation}
                  onClick={readCurrentLocation}
                >
                  {isFetchingLocation ? "Đang lay vi tri..." : "Lay vi tri hien tai"}
                </button>
              </div>
              <FormField label="Nguon vi tri">
                <select
                  className="input"
                  value={locationSource}
                  onChange={(event) => setLocationSource(event.target.value as "gps" | "manual")}
                >
                  <option value="gps">GPS</option>
                  <option value="manual">Nhap tay</option>
                </select>
              </FormField>
              <FormField label="Vi do">
                <input
                  className="input"
                  type="number"
                  step="0.000001"
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                />
              </FormField>
              <FormField label="Kinh do">
                <input
                  className="input"
                  type="number"
                  step="0.000001"
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                />
              </FormField>
              <FormField label="Do chinh xac (m), khong bat buoc">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={accuracyMeters}
                  onChange={(event) => setAccuracyMeters(event.target.value)}
                />
              </FormField>
            </>
          ) : null}
          {needsPaymentAllocation ? (
            <>
              <p className="allocation-summary">
                CÃ³ thá»ƒ phÃ¢n bá»• {formatMoney(allocationAvailable)}. Kiá»ƒm tra sá»‘ tiá»n tá»«ng chá»©ng tá»« trÆ°á»›c khi xÃ¡c nháº­n.
              </p>
              <div className="allocation-list">
                {openPaymentObligations.map((obligation) => (
                  <div className="allocation-row" key={obligation.ledgerEntryId}>
                    <div>
                      <strong>{obligation.sourceDocument}</strong>
                      <span>{formatDateTime(obligation.postingDate)} Â· cÃ²n {formatMoney(obligation.openAmount)}</span>
                    </div>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max={obligation.openAmount}
                      step="1"
                      aria-label={`PhÃ¢n bá»• vÃ o ${obligation.sourceDocument}`}
                      value={allocationAmounts[obligation.ledgerEntryId] ?? ""}
                      onChange={(event) => setAllocationAmounts((current) => ({ ...current, [obligation.ledgerEntryId]: event.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <div className="table-actions">
            <button
              className="button button-small button-primary"
              type="button"
                  disabled={isPending || ((needsReceiptImage || needsDeliveryImage) && !receiptImage) || (needsLocation && (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))))}
              onClick={submitDetails}
            >
              {needsDeliveryImage ? "XÃ¡c nháº­n Ä‘Ã£ giao vÃ  gá»­i duyá»‡t" : "XÃ¡c nháº­n"}
            </button>
            <button className="button button-small" type="button" disabled={isPending} onClick={() => setExpanded(false)}>Há»§y</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ApprovalAttachmentPreview({
  attachments,
  emptyText = "Thiáº¿u áº£nh"
}: {
  attachments?: OperationsAttachment[];
  emptyText?: string;
}) {
  if (!attachments || attachments.length === 0) {
    return emptyText ? <span className="muted">{emptyText}</span> : null;
  }
  return (
    <div className="approval-attachments" aria-label="áº¢nh Ä‘Ã­nh kÃ¨m phiáº¿u nháº­p">
      {attachments.map((attachment) => (
        <a key={attachment.id} href={`/api/operations/attachments/${attachment.id}`} target="_blank" rel="noreferrer" title={`Má»Ÿ ${attachment.fileName}`}>
          <img src={`/api/operations/attachments/${attachment.id}`} alt={`áº¢nh ${attachment.fileName}`} loading="lazy" />
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
        <p className="timeline-text">{completed ? "ÄÃ£ xá»­ lÃ½" : operationDescriptions[operation]}</p>
        {!readiness.canRun && !completed ? <p className="timeline-reason">{readiness.reason}</p> : null}
      </div>
      {requiresDocumentInput ? (
        <span className="muted">Thá»±c hiá»‡n táº¡i dÃ²ng chá»©ng tá»«</span>
      ) : (
        <button className="button button-small" type="button" disabled={!readiness.canRun || isPending} onClick={() => onRun(operation)}>
          Cháº¡y
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
              {event.actorName} Â· {formatDateTime(event.occurredAt)}
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
  emptyText = "ChÆ°a cÃ³ dá»¯ liá»‡u.",
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
    return { canRun: false, reason: `${actor.displayName} khÃ´ng cÃ³ quyá»n ${permission}.` };
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
  const actorWorkerEmployee = actor
    ? state.employees.find((employee) =>
      employee.roleType === "worker" && normalizeSearch(employee.displayName) === normalizeSearch(actor.displayName)
    )
    : undefined;

  switch (operation) {
    case "confirmSalesOrder":
      if (targetId && !targetSalesOrder) {
        return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n bÃ¡n." };
      }
      return order.status === "draft" ? { canRun: true } : { canRun: false, reason: "ÄÆ¡n bÃ¡n Ä‘Ã£ xÃ¡c nháº­n." };
    case "claimOpenSalesWorkOrder":
      if (actor?.role !== "worker") {
        return { canRun: false, reason: "Chá»‰ tÃ i khoáº£n Thá»£ má»›i Ä‘Æ°á»£c nháº­n Ä‘Æ¡n má»›i." };
      }
      if (!targetWorkOrder || !targetWorkOrder.salesOrderId) {
        return { canRun: false, reason: "Chá»n Ä‘Æ¡n má»›i cá»¥ thá»ƒ Ä‘á»ƒ nháº­n." };
      }
      if (!actorWorkerEmployee || actorWorkerEmployee.status !== "active") {
        return { canRun: false, reason: "TÃ i khoáº£n thá»“ không cÃ²n hoáº¡t Ä‘á»™ng hoáº·c chưa gáº¯n nhân sá»Ÿ." };
      }
      return targetWorkOrder.status === "open" && targetWorkOrder.participants.length === 0
        ? { canRun: true }
        : { canRun: false, reason: "ÄÆ¡n nÃ y Ä‘Ã£ cÃ³ ngÆ°á»i nháº­n." };
    case "recordWorkOrderLocation":
      if (actor?.role !== "worker") {
        return { canRun: false, reason: "Chá»‰ tÃ i khoáº£n thá»“ thá»‹ cÃ³ quyá»n ghi vÄ© trí." };
      }
      if (!targetWorkOrder || !targetWorkOrder.salesOrderId) {
        return { canRun: false, reason: "Chá»‰ chÃ¹n Ä‘Æ¡n gÃ³p cÅ©ng Ä‘Æ¡n Ä‘á»ƒ ghi vÄ© trí." };
      }
      if (!actorWorkerEmployee || actorWorkerEmployee.status !== "active") {
        return { canRun: false, reason: "TÃ i khoáº£n thá»“ không cÃ²n hoáº¡t Ä‘á»™ng hoáº·c chưa gáº¯n nhân sá»Ÿ." };
      }
      if (targetWorkOrder.status === "open" || !targetWorkOrder.claimedByEmployeeId) {
        return { canRun: false, reason: "Chá»‰ Ä‘Æ°á»£c gá»‘i khi Ä‘Ã£ co nhÃ¢n viÃªn nháº­n." };
      }
      return targetWorkOrder.participants.some((participant) => participant.employeeId === actorWorkerEmployee.id)
        ? { canRun: true }
        : { canRun: false, reason: "Báº¡n khÃ´ng Ä‘Æ°á»£c phân quyá»ƒn ghi vÄ© trí cho Ä‘Æ¡n nÃ y." };
    case "allocateSalesSources":
      if (targetId) {
        if (!targetSalesOrder) {
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n bÃ¡n." };
        }
        return targetSalesOrder.status === "confirmed" ? { canRun: true } : { canRun: false, reason: "Cáº§n xÃ¡c nháº­n Ä‘Æ¡n bÃ¡n trÆ°á»›c." };
      }
      return confirmedOrder ? { canRun: true } : { canRun: false, reason: "Cáº§n xÃ¡c nháº­n Ä‘Æ¡n bÃ¡n trÆ°á»›c." };
    case "confirmPurchaseOrder": {
      const targetOrder = targetId ? state.purchaseOrders.find((item) => item.id === targetId) : state.purchaseOrders.find((item) => item.status === "draft");
      return targetOrder?.status === "draft"
        ? { canRun: true }
        : { canRun: false, reason: targetId ? "ÄÆ¡n mua khÃ´ng cÃ²n á»Ÿ tráº¡ng thÃ¡i nhÃ¡p." : "KhÃ´ng cÃ²n Ä‘Æ¡n mua nhÃ¡p." };
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
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y dÃ²ng mua." };
        }
        if (state.approvalRequests.some((request) => request.type === "goods_receipt" && request.status === "pending" && (request.targetId === targetId || request.id === targetId))) {
          return { canRun: false, reason: "Dong mua dang cho Chu cua hang hoac Ke toan duyet." };
        }
        return targetPurchase.purchaseOrder.status !== "draft" && targetPurchase.line.destinationType === "warehouse" && Boolean(targetPurchase.line.warehouseId) && targetPurchase.line.receivedQuantity < targetPurchase.line.orderedQuantity
          ? { canRun: true }
          : { canRun: false, reason: targetPurchase.purchaseOrder.status === "draft" ? "Cáº§n xÃ¡c nháº­n Ä‘Æ¡n mua trÆ°á»›c." : "DÃ²ng mua nÃ y khÃ´ng cÃ²n cáº§n nháº­p kho." };
      }
      if (!poWarehouse) {
        return { canRun: false, reason: "ChÆ°a cÃ³ Ä‘Æ¡n mua nháº­p kho." };
      }
      return { canRun: true };
    case "postInventoryTransfer":
      return state.warehouses.length >= 2 && state.productUnits.length > 0
        ? { canRun: true }
        : { canRun: false, reason: "Cáº§n Ã­t nháº¥t hai kho vÃ  má»™t váº­t tÆ° Ä‘á»ƒ chuyá»ƒn kho." };
    case "postInventoryCountAdjustment":
      return state.warehouses.length > 0 && state.productUnits.length > 0
        ? { canRun: true }
        : { canRun: false, reason: "Cáº§n kho vÃ  váº­t tÆ° Ä‘á»ƒ kiá»ƒm kÃª." };
    case "reverseInventoryMovement":
      if (!targetId) {
        return { canRun: false, reason: "Chá»n phÃ¡t sinh kho cá»¥ thá»ƒ Ä‘á»ƒ Ä‘áº£o." };
      }
      if (!targetInventoryMovement) {
        return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y phÃ¡t sinh kho." };
      }
      if (targetInventoryMovement.reversedById) {
        return { canRun: false, reason: "PhÃ¡t sinh kho Ä‘Ã£ Ä‘Æ°á»£c Ä‘áº£o." };
      }
      if (targetInventoryMovement.movementType === "opening" || targetInventoryMovement.movementType === "reverse") {
        return { canRun: false, reason: "Tá»“n Ä‘áº§u ká»³ vÃ  dÃ²ng Ä‘áº£o khÃ´ng Ä‘Æ°á»£c Ä‘áº£o báº±ng thao tÃ¡c nÃ y." };
      }
      return stockBalance(state, targetInventoryMovement.warehouseId, targetInventoryMovement.productUnitId) - targetInventoryMovement.quantity >= 0
        ? { canRun: true }
        : { canRun: false, reason: "Äáº£o phÃ¡t sinh nÃ y sáº½ lÃ m Ã¢m tá»“n kho." };
    case "confirmDirectDelivery":
      if (targetId) {
        if (!targetPurchase) {
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y dÃ²ng mua." };
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
          : { canRun: false, reason: targetPurchase.purchaseOrder.status === "draft" ? "Cáº§n xÃ¡c nháº­n Ä‘Æ¡n mua trÆ°á»›c." : "Cáº§n phÃ¢n bá»• nguá»“n giao tháº³ng trÆ°á»›c." };
      }
      if (!poDirect) {
        return { canRun: false, reason: "ChÆ°a cÃ³ Ä‘Æ¡n mua giao tháº³ng." };
      }
      return poDirect.status !== "fully_received" && state.salesOrders.some((item) => item.status === "allocated" || item.status === "partially_delivered")
        ? { canRun: true }
        : { canRun: false, reason: "Cáº§n phÃ¢n bá»• nguá»“n vÃ  dÃ²ng giao tháº³ng chÆ°a xÃ¡c nháº­n." };
    case "reverseDirectDelivery":
      if (!targetId || !targetPurchase) {
        return { canRun: false, reason: "Chá»n dÃ²ng mua giao tháº³ng Ä‘Ã£ ghi nháº­n Ä‘á»ƒ Ä‘áº£o." };
      }
      return targetPurchase.line.destinationType === "customer_direct" && targetPurchase.line.receivedQuantity > 0
        ? { canRun: true }
        : { canRun: false, reason: "DÃ²ng mua chÆ°a cÃ³ láº§n giao tháº³ng Ä‘á»ƒ Ä‘áº£o." };
    case "startDeliveryLoading":
      if (targetId) {
        if (!targetDelivery || !targetDeliveryOrder) {
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y chuyáº¿n giao." };
        }
        return targetDelivery.status === "assigned" && deliveryJobCanMove(targetDelivery)
          ? { canRun: true }
          : { canRun: false, reason: "Chuyáº¿n nÃ y chÆ°a sáºµn sÃ ng bá»‘c hÃ ng." };
      }
      return deliveryAssigned ? { canRun: true } : { canRun: false, reason: "Cáº§n chuyáº¿n giao Ä‘Ã£ phÃ¢n cÃ´ng vÃ  Ä‘Æ¡n Ä‘Ã£ phÃ¢n bá»• qua kho." };
    case "dispatchDelivery":
      if (targetId) {
        if (!targetDelivery || !targetDeliveryOrder) {
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y chuyáº¿n giao." };
        }
        return targetDelivery.status === "loading" && deliveryJobCanMove(targetDelivery)
          ? { canRun: true }
          : { canRun: false, reason: "Cáº§n bá»‘c hÃ ng trÆ°á»›c khi xuáº¥t báº¿n." };
      }
      return deliveryLoading ? { canRun: true } : { canRun: false, reason: "Cáº§n chuyáº¿n Ä‘ang bá»‘c hÃ ng." };
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
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y chuyáº¿n giao." };
        }
        if (state.approvalRequests.some((request) => request.type === "delivery_completion" && request.status === "pending" && (request.targetId === targetId || request.id === targetId))) {
          return { canRun: false, reason: "Chuyen giao dang cho Chu cua hang hoac Ke toan duyet." };
        }
        return targetDelivery.status === "in_transit" &&
          (targetDeliveryOrder.status === "allocated" || targetDeliveryOrder.status === "partially_delivered") &&
          targetDeliveryOrder.lines.some((line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity)
          ? { canRun: true }
          : { canRun: false, reason: "Chuyáº¿n nÃ y chÆ°a Ä‘á»§ Ä‘iá»u kiá»‡n hoÃ n táº¥t." };
      }
      return deliveryInTransit ? { canRun: true } : { canRun: false, reason: "Cáº§n chuyáº¿n Ä‘Ã£ xuáº¥t báº¿n, Ä‘Æ¡n Ä‘Ã£ phÃ¢n bá»• vÃ  Ä‘á»§ tá»“n kho pháº§n qua kho." };
    case "failDelivery":
      if (targetId) {
        if (!targetDelivery || !targetDeliveryOrder) {
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y chuyáº¿n giao." };
        }
        return ["assigned", "loading", "in_transit"].includes(targetDelivery.status) && deliveryJobCanMove(targetDelivery)
          ? { canRun: true }
          : { canRun: false, reason: "Chuyáº¿n nÃ y khÃ´ng thá»ƒ bÃ¡o tháº¥t báº¡i." };
      }
      return deliveryActive ? { canRun: true } : { canRun: false, reason: "KhÃ´ng cÃ³ chuyáº¿n giao Ä‘ang xá»­ lÃ½." };
    case "confirmCustomerPayment":
      if (targetId) {
        if (!targetCustomerPayment) {
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y phiáº¿u thu." };
        }
        return targetCustomerPayment.status === "draft" && state.customerLedgerEntries.some((entry) => entry.customerId === targetCustomerPayment.customerId && entry.direction === "debit")
          ? { canRun: true }
          : { canRun: false, reason: "Phiáº¿u thu nÃ y chÆ°a Ä‘á»§ Ä‘iá»u kiá»‡n xÃ¡c nháº­n." };
      }
      return customerPayment.status === "draft" && state.customerLedgerEntries.some((entry) => entry.direction === "debit")
        ? { canRun: true }
        : { canRun: false, reason: "Cáº§n cÃ³ pháº£i thu vÃ  phiáº¿u thu nhÃ¡p." };
    case "allocateCustomerPayment":
      if (targetId) {
        if (!targetCustomerPayment) {
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y phiáº¿u thu." };
        }
        return ["confirmed", "partially_allocated"].includes(targetCustomerPayment.status) && paymentUnallocatedAmount(targetCustomerPayment) > 0 && getOpenCustomerDebtObligations(state, targetCustomerPayment.customerId).length > 0
          ? { canRun: true }
          : { canRun: false, reason: "Phiáº¿u thu chÆ°a xÃ¡c nháº­n, Ä‘Ã£ phÃ¢n bá»• háº¿t hoáº·c khÃ´ng cÃ²n chá»©ng tá»« ná»£ phÃ¹ há»£p." };
      }
      return confirmedCustomerPayment
        ? { canRun: true }
        : { canRun: false, reason: "Cáº§n xÃ¡c nháº­n phiáº¿u thu trÆ°á»›c." };
    case "reverseCustomerPayment":
      if (!targetId) {
        return { canRun: false, reason: "Chá»n phiáº¿u thu cá»¥ thá»ƒ Ä‘á»ƒ Ä‘áº£o." };
      }
      if (!targetCustomerPayment) {
        return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y phiáº¿u thu." };
      }
      return ["confirmed", "partially_allocated", "allocated"].includes(targetCustomerPayment.status)
        ? { canRun: true }
        : { canRun: false, reason: "Chá»‰ phiáº¿u thu Ä‘Ã£ xÃ¡c nháº­n hoáº·c Ä‘Ã£ phÃ¢n bá»• má»›i Ä‘Æ°á»£c Ä‘áº£o." };
    case "confirmSupplierPayment":
      if (targetId) {
        if (!targetSupplierPayment) {
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y phiáº¿u chi." };
        }
        return targetSupplierPayment.status === "draft" && supplierBalance(state.supplierLedgerEntries, targetSupplierPayment.supplierId) >= targetSupplierPayment.amount && cashBalance(state) >= targetSupplierPayment.amount
          ? { canRun: true }
          : { canRun: false, reason: "Phiáº¿u chi nÃ y chÆ°a Ä‘á»§ Ä‘iá»u kiá»‡n xÃ¡c nháº­n." };
      }
      return supplierPayment.status === "draft" && supplierBalance(state.supplierLedgerEntries, supplierPayment.supplierId) >= supplierPayment.amount && cashBalance(state) >= supplierPayment.amount
        ? { canRun: true }
        : { canRun: false, reason: "Cáº§n cÃ³ Ä‘á»§ cÃ´ng ná»£ pháº£i tráº£ vÃ  sá»‘ dÆ° quá»¹." };
    case "allocateSupplierPayment":
      if (targetId) {
        if (!targetSupplierPayment) {
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y phiáº¿u chi." };
        }
        return ["confirmed", "partially_allocated"].includes(targetSupplierPayment.status) && paymentUnallocatedAmount(targetSupplierPayment) > 0 && getOpenSupplierDebtObligations(state, targetSupplierPayment.supplierId).length > 0
          ? { canRun: true }
          : { canRun: false, reason: "Phiáº¿u chi chÆ°a xÃ¡c nháº­n, Ä‘Ã£ phÃ¢n bá»• háº¿t hoáº·c khÃ´ng cÃ²n chá»©ng tá»« ná»£ phÃ¹ há»£p." };
      }
      return state.supplierPayments.some((payment) => ["confirmed", "partially_allocated"].includes(payment.status) && payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0) < payment.amount)
        ? { canRun: true }
        : { canRun: false, reason: "Cáº§n xÃ¡c nháº­n phiáº¿u chi trÆ°á»›c khi phÃ¢n bá»•." };
    case "reverseSupplierPayment":
      if (!targetId) {
        return { canRun: false, reason: "Chá»n phiáº¿u chi nhÃ  cung cáº¥p cá»¥ thá»ƒ Ä‘á»ƒ Ä‘áº£o." };
      }
      if (!targetSupplierPayment) {
        return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y phiáº¿u chi." };
      }
      return ["confirmed", "partially_allocated", "allocated"].includes(targetSupplierPayment.status)
        ? { canRun: true }
        : { canRun: false, reason: "Chá»‰ phiáº¿u chi Ä‘Ã£ xÃ¡c nháº­n hoáº·c Ä‘Ã£ phÃ¢n bá»• má»›i Ä‘Æ°á»£c Ä‘áº£o." };
    case "confirmCashVoucher":
      if (targetId && !targetCashVoucher) {
        return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y phiáº¿u quá»¹." };
      }
      if (!cashVoucher || cashVoucher.status !== "draft") {
        return { canRun: false, reason: "KhÃ´ng cÃ²n phiáº¿u quá»¹ nhÃ¡p." };
      }
      return cashVoucher.direction === "out" && cashBalance(state) < cashVoucher.amount
        ? { canRun: false, reason: "Tá»“n quá»¹ khÃ´ng Ä‘á»§ Ä‘á»ƒ xÃ¡c nháº­n phiáº¿u chi." }
        : { canRun: true };
    case "reverseCashVoucher":
      if (!targetCashVoucher) {
        return { canRun: false, reason: "Chá»n phiáº¿u quá»¹ Ä‘Ã£ xÃ¡c nháº­n Ä‘á»ƒ Ä‘áº£o." };
      }
      return targetCashVoucher.status === "confirmed"
        ? { canRun: true }
        : { canRun: false, reason: "Chá»‰ phiáº¿u quá»¹ Ä‘Ã£ xÃ¡c nháº­n má»›i Ä‘Æ°á»£c Ä‘áº£o." };
    case "approveWorkOutput":
      if (targetId && !targetWorkOrder) {
        return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y phiáº¿u cÃ´ng." };
      }
      return workOrder.status === "submitted" ? { canRun: true } : { canRun: false, reason: "Sáº£n lÆ°á»£ng Ä‘Ã£ duyá»‡t hoáº·c Ä‘Ã£ tÃ­nh cÃ´ng." };
    case "postCompensation":
      if (targetId) {
        if (!targetWorkOrder) {
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y phiáº¿u cÃ´ng." };
        }
        return targetWorkOrder.status === "approved" && compensation.status === "draft"
          ? { canRun: true }
          : { canRun: false, reason: "Cáº§n duyá»‡t sáº£n lÆ°á»£ng trÆ°á»›c khi ghi nháº­n báº£ng cÃ´ng." };
      }
      return approvedWorkOrder && compensation.status === "draft"
        ? { canRun: true }
        : { canRun: false, reason: "Cáº§n duyá»‡t sáº£n lÆ°á»£ng trÆ°á»›c khi ghi nháº­n báº£ng cÃ´ng." };
    case "payEmployee":
      if (targetId) {
        if (!targetEmployeePayment) {
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y phiáº¿u thanh toÃ¡n nhÃ¢n viÃªn." };
        }
        return targetEmployeePayment.status === "draft" && employeeBalance(state, targetEmployeePayment.employeeId) >= targetEmployeePayment.amount && cashBalance(state) >= targetEmployeePayment.amount
          ? { canRun: true }
          : { canRun: false, reason: "Phiáº¿u nÃ y chÆ°a Ä‘á»§ Ä‘iá»u kiá»‡n thanh toÃ¡n." };
      }
      return employeePayment.status === "draft" && employeeBalance(state, employeePayment.employeeId) >= employeePayment.amount && cashBalance(state) >= employeePayment.amount
        ? { canRun: true }
        : { canRun: false, reason: "Cáº§n cÃ³ cÃ´ng Ä‘Ã£ chá»‘t vÃ  quá»¹ Ä‘á»§ tiá»n." };
    case "reverseEmployeePayment":
      if (!targetId) {
        return { canRun: false, reason: "Chá»n phiáº¿u thanh toÃ¡n nhÃ¢n viÃªn cá»¥ thá»ƒ Ä‘á»ƒ Ä‘áº£o." };
      }
      if (!targetEmployeePayment) {
        return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y phiáº¿u thanh toÃ¡n nhÃ¢n viÃªn." };
      }
      return targetEmployeePayment.status === "confirmed"
        ? { canRun: true }
        : { canRun: false, reason: "Chá»‰ phiáº¿u thanh toÃ¡n Ä‘Ã£ xÃ¡c nháº­n má»›i Ä‘Æ°á»£c Ä‘áº£o." };
    case "confirmEmployeeAdvance":
      if (targetId && !targetEmployeeAdvance) {
        return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y phiáº¿u táº¡m á»©ng." };
      }
      return employeeAdvance?.status === "draft" && cashBalance(state) >= employeeAdvance.amount
        ? { canRun: true }
        : { canRun: false, reason: "Cáº§n phiáº¿u táº¡m á»©ng nhÃ¡p vÃ  Ä‘á»§ sá»‘ dÆ° quá»¹." };
    case "reverseEmployeeAdvance":
      if (!targetId || !targetEmployeeAdvance) {
        return { canRun: false, reason: "Chá»n phiáº¿u táº¡m á»©ng Ä‘Ã£ xÃ¡c nháº­n Ä‘á»ƒ Ä‘áº£o." };
      }
      return targetEmployeeAdvance.status === "confirmed"
        ? { canRun: true }
        : { canRun: false, reason: "Chá»‰ phiáº¿u táº¡m á»©ng Ä‘Ã£ xÃ¡c nháº­n má»›i Ä‘Æ°á»£c Ä‘áº£o." };
    case "resolveImportIssue":
      if (targetId) {
        if (!targetImportIssue) {
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y váº¥n Ä‘á» import." };
        }
        return targetImportIssue.status === "open" ? { canRun: true } : { canRun: false, reason: "Váº¥n Ä‘á» import Ä‘Ã£ xá»­ lÃ½." };
      }
      return state.importIssues.some((issue) => issue.status === "open")
        ? { canRun: true }
        : { canRun: false, reason: "KhÃ´ng cÃ²n váº¥n Ä‘á» import Ä‘ang má»Ÿ." };
    case "ignoreImportIssue":
      if (targetId) {
        if (!targetImportIssue) {
          return { canRun: false, reason: "KhÃ´ng tÃ¬m tháº¥y cáº£nh bÃ¡o import." };
        }
        return targetImportIssue.status === "open" && targetImportIssue.severity === "warning"
          ? { canRun: true }
          : { canRun: false, reason: "Chá»‰ cáº£nh bÃ¡o import Ä‘ang má»Ÿ má»›i Ä‘Æ°á»£c bá» qua." };
      }
      return state.importIssues.some((issue) => issue.status === "open" && issue.severity === "warning")
        ? { canRun: true }
        : { canRun: false, reason: "KhÃ´ng cÃ²n cáº£nh bÃ¡o import Ä‘ang má»Ÿ." };
    default:
      return { canRun: false, reason: "Không có quy tắc cho thao tác này." };
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
    return "Ä‘Æ¡n vá»‹";
  }
  return normalizeSearch(unitName) === "m3" ? "mÂ³" : unitName;
}

function documentConversionPreview(state: OperationsState, line?: DocumentUnitFormLine) {
  if (!line?.productUnitId) {
    return "Chá»n váº­t tÆ° Ä‘á»ƒ xem Ä‘Æ¡n vá»‹ tá»“n kho.";
  }
  const baseUnit = productBaseUnit(state, line.productUnitId);
  const unitName = line.unitName || baseUnit;
  const configuredUnit = configuredPurchaseUnit(state, line.productUnitId, unitName);
  const quantity = Number(line.quantity ?? line.orderedQuantity ?? 0);
  if (configuredUnit?.conversionMode === "variable") {
    const actualBaseQuantity = Number(line.actualBaseQuantity);
    if (!Number.isFinite(actualBaseQuantity) || actualBaseQuantity <= 0) {
      return `Nháº­p tá»•ng ${displayUnitName(baseUnit)} thá»±c nháº­n cho ${formatQuantity(quantity)} ${displayUnitName(unitName)}.`;
    }
    return `${formatQuantity(quantity)} ${displayUnitName(unitName)} Â· ghi nháº­n thá»±c táº¿ ${formatQuantity(actualBaseQuantity)} ${displayUnitName(baseUnit)}; khÃ´ng dÃ¹ng quy Ä‘á»•i cá»‘ Ä‘á»‹nh.`;
  }
  const factor = usesProductBaseUnit(state, line.productUnitId, unitName) ? 1 : Number(line.unitFactor);
  if (!Number.isFinite(factor) || factor <= 0) {
    return `Nháº­p sá»‘ ${displayUnitName(baseUnit)} cÃ³ trong 1 ${displayUnitName(unitName)}.`;
  }
  return `1 ${displayUnitName(unitName)} = ${formatQuantity(factor)} ${displayUnitName(baseUnit)} Â· ${formatQuantity(quantity)} ${displayUnitName(unitName)} sáº½ ghi ${formatQuantity(quantity * factor)} ${displayUnitName(baseUnit)}.`;
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
    return `${formatQuantity(line.receivedQuantity)} / ${formatQuantity(line.orderedQuantity)} ${baseUnit} Â· Ä‘Æ¡n mua ${formatQuantity(line.documentUnit.quantity)} ${unitName}`;
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
    .replace(/Ä‘/g, "d");
}

function statusText(value: string | undefined) {
  const dictionary: Record<string, string> = {
    active: "Äang dÃ¹ng",
    adjustment: "Äiá»u chá»‰nh kiá»ƒm kÃª",
    allocated: "ÄÃ£ phÃ¢n bá»•",
    approved: "ÄÃ£ duyá»‡t",
    assigned: "ÄÃ£ phÃ¢n cÃ´ng",
    compensated: "ÄÃ£ tÃ­nh cÃ´ng",
    confirmed: "ÄÃ£ xÃ¡c nháº­n",
    credit: "CÃ³",
    customer_direct: "Giao tháº³ng khÃ¡ch",
    debit: "Ná»£",
    delivered: "ÄÃ£ giao",
    draft: "Báº£n nhÃ¡p",
    error: "Lá»—i",
    failed: "Tháº¥t báº¡i",
    fully_received: "Nháº­n Ä‘á»§",
    ignored: "ÄÃ£ bá» qua",
    inactive: "Ngá»«ng dÃ¹ng",
    in_transit: "Äang giao",
    issue: "Xuáº¥t kho",
    loading: "Äang bá»‘c hÃ ng",
    opening: "Tá»“n Ä‘áº§u ká»³",
    open: "Chá» nháº­n",
    ordered: "ÄÃ£ Ä‘áº·t",
    pending: "Chá» duyá»‡t",
    owner: "Chá»§ cá»­a hÃ ng",
    partially_allocated: "PhÃ¢n bá»• má»™t pháº§n",
    partially_delivered: "Giao má»™t pháº§n",
    partially_received: "Nháº­n má»™t pháº§n",
    paid: "ÄÃ£ thanh toÃ¡n",
    posted: "ÄÃ£ ghi nháº­n",
    receipt: "Nháº­p kho",
    reverse: "Äáº£o kho",
    resolved: "ÄÃ£ xá»­ lÃ½",
    rejected: "ÄÃ£ tá»« chá»‘i",
    reversed: "ÄÃ£ Ä‘áº£o",
    submitted: "Chá» duyá»‡t",
    transfer_in: "Nháº­p chuyá»ƒn kho",
    transfer_out: "Xuáº¥t chuyá»ƒn kho",
    warning: "Cáº£nh bÃ¡o",
    warehouse: "Kho cá»­a hÃ ng"
  };

  return value ? dictionary[value] ?? value : "-";
}

function debtStatusText(value: "open" | "partially_allocated" | "settled") {
  return value === "settled" ? "ÄÃ£ táº¥t toÃ¡n" : value === "partially_allocated" ? "CÃ²n má»™t pháº§n" : "ChÆ°a phÃ¢n bá»•";
}

function roleText(value: string) {
  const dictionary: Record<string, string> = {
    accountant: "Káº¿ toÃ¡n",
    administrator: "Quáº£n trá»‹ há»‡ thá»‘ng",
    dispatcher: "Äiá»u phá»‘i",
    driver: "TÃ i xáº¿",
    owner: "Chá»§ cá»­a hÃ ng",
    sales: "BÃ¡n hÃ ng",
    supervisor: "GiÃ¡m sÃ¡t",
    warehouse: "Kho",
    worker: "Thá»£",
    viewer: "Chá»‰ xem"
  };

  return dictionary[value] ?? value;
}

function sourceText(value: string | undefined) {
  if (value === "warehouse") {
    return "Qua kho";
  }
  if (value === "direct_supplier") {
    return "Giao tháº³ng";
  }
  return "ChÆ°a phÃ¢n bá»•";
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
    return "á»”n";
  }
  if (task.severity === "danger") {
    return "Cáº§n xá»­ lÃ½";
  }
  if (task.severity === "warning") {
    return "Cáº§n chÃº Ã½";
  }
  return "Theo dÃµi";
}
