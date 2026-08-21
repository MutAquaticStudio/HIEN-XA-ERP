"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  HandCoins,
  Home,
  LogOut,
  MessageCircle,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  WalletCards,
  Warehouse
} from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import { operationsErpRegistry, operationsOdooMetadata, type OperationsModuleId } from "@/modules/operations/erp-registry";
import type { OperationsActor, OperationsState } from "@/modules/operations/types";
import { AppShell, InlineAlert, PageHeader } from "@/components/ui/primitives";
import { OperationsActorContext } from "./operations/operations-contract";
import { OperationsModuleRouter } from "./operations/operations-module-router";
import { OdooActionBar } from "./operations/overview-view";
import { OperationsCommunicationsSidebar } from "./partner-conversation";
import { useOperationsRuntime } from "./operations/use-operations-runtime";

type OperationsAppProps = {
  initialState: OperationsState;
  initialRevision: number;
  initialSyncedAt: string;
  initialActor: OperationsActor;
  visibleModuleIds: OperationsModuleId[];
  initialActiveModule?: OperationsModuleId;
  currentUser: {
    displayName: string;
    accountName: string;
    roleLabel: string;
    canManageUsers: boolean;
  };
  accountTools?: ReactNode;
};

const modules = operationsErpRegistry.navigation;
const communicationRoles = new Set(["owner", "administrator", "sales", "accountant", "warehouse", "dispatcher"]);
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
  initialActiveModule = "overview",
  currentUser,
  accountTools
}: OperationsAppProps) {
  const [activeModule, setActiveModule] = useState<OperationsModuleId>(initialActiveModule);
  const [isTabletNavigationOpen, setIsTabletNavigationOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const runtime = useOperationsRuntime(initialState, initialRevision, initialSyncedAt);
  const visibleModules = useMemo(() => {
    const allowedModuleIds = new Set(visibleModuleIds);
    return modules.filter((module) => allowedModuleIds.has(module.id));
  }, [visibleModuleIds]);
  const title = modules.find((module) => module.id === activeModule) ?? modules[0];
  const activeOdooAction = operationsOdooMetadata.actionByModuleId.get(activeModule);
  const canUseCommunications = communicationRoles.has(initialActor.role);
  const communicationContacts = useMemo(() => [
    ...runtime.state.customers
      .filter((customer) => customer.status === "active")
      .map((customer) => ({ id: customer.id, partyType: "customer" as const, label: customer.displayName, code: customer.code })),
    ...runtime.state.suppliers
      .filter((supplier) => supplier.status === "active")
      .map((supplier) => ({ id: supplier.id, partyType: "supplier" as const, label: supplier.displayName, code: supplier.code }))
  ], [runtime.state.customers, runtime.state.suppliers]);

  return (
    <OperationsActorContext.Provider value={initialActor}>
      <AppShell className={canUseCommunications ? "app-shell app-shell-with-communications" : "app-shell"}>
        <aside className={isTabletNavigationOpen ? "sidebar sidebar-open" : "sidebar"} aria-label="Điều hướng chính">
          <div className="brand">
            <div className="brand-mark">HX</div>
            <div><h1 className="brand-title">VLXD Hiền Xa</h1><p className="brand-subtitle">ERP vận hành</p></div>
          </div>
          <button
            aria-controls="tablet-navigation"
            aria-expanded={isTabletNavigationOpen}
            className="tablet-nav-toggle"
            onClick={() => setIsTabletNavigationOpen((current) => !current)}
            type="button"
          >
            {isTabletNavigationOpen ? "Đóng menu" : "Mở menu"}
          </button>
          <nav className="nav-list nav-list-compact" id="tablet-navigation">
            <span className="nav-section-label">VẬN HÀNH</span>
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
                    setIsTabletNavigationOpen(false);
                  }}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon aria-hidden="true" /><span>{item.label}</span>
                </button>
              );
            })}
            {visibleModuleIds.includes("masterData") ? (
              <>
                <span className="nav-section-label">DANH MỤC</span>
                <div className="nav-catalog-links">
                  {["customers", "suppliers", "products", "warehouses", "vehicles", "employees"].map((kind) => {
                    const labels: Record<string, string> = { customers: "Khách hàng", suppliers: "Nhà cung cấp", products: "Vật tư", warehouses: "Kho / bãi", vehicles: "Phương tiện", employees: "Nhân sự" };
                    return <Link className="nav-item nav-catalog-link" href={`/catalog/${kind}`} key={kind} onClick={() => setIsTabletNavigationOpen(false)}><Database aria-hidden="true" /><span>{labels[kind]}</span></Link>;
                  })}
                </div>
              </>
            ) : null}
            <Link className="nav-item nav-catalog-link" href="/dashboard" onClick={() => setIsTabletNavigationOpen(false)}><Home aria-hidden="true" /><span>Tổng quan V2</span></Link>
            {canUseCommunications ? (
              <Link
                className="nav-item communications-nav-item"
                href="/trao-doi"
                onClick={() => setIsTabletNavigationOpen(false)}
              >
                <MessageCircle aria-hidden="true" /><span>Tin nhắn</span>
              </Link>
            ) : null}
          </nav>
          <div className="sidebar-account">
            <div className="account-summary">
              <span className="account-name">{currentUser.displayName}</span>
              <span className="account-role">{currentUser.roleLabel}</span>
              <span className="account-email">{currentUser.accountName}</span>
            </div>
            {currentUser.canManageUsers ? (
              <Link className="nav-item account-action" href="/admin"><ShieldCheck aria-hidden="true" /><span>Quản trị người dùng</span></Link>
            ) : null}
            {accountTools ? <div className="account-tools">{accountTools}</div> : null}
            <form action={logoutAction}>
              <button className="nav-item nav-button account-action" type="submit"><LogOut aria-hidden="true" /><span>Đăng xuất</span></button>
            </form>
          </div>
        </aside>
        <main className="main" aria-busy={runtime.isPending}>
          <PageHeader title={title.title} description={title.subtitle} />
          <OdooActionBar action={activeOdooAction} searchEnabled={activeModule === "masterData"} searchTerm={searchTerm} onSearchTermChange={setSearchTerm} />
          {runtime.isPending ? <div className="ops-pending-indicator" role="status" aria-live="polite">Đang lưu thay đổi…</div> : null}
          {runtime.feedback ? (
            <InlineAlert tone={runtime.feedback.type === "error" ? "danger" : runtime.feedback.type}>
              {runtime.feedback.type === "error" ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
              <span>{runtime.feedback.text}</span>
            </InlineAlert>
          ) : null}
          <OperationsModuleRouter
            activeModule={activeModule}
            actor={initialActor}
            state={runtime.state}
            syncMeta={runtime.syncMeta}
            visibleModuleIds={visibleModuleIds}
            searchTerm={searchTerm}
            isPending={runtime.isPending}
            runOperation={runtime.runOperation}
            createCommand={runtime.runCreateCommand}
            importWorkbook={runtime.runWorkbookDryRun}
          />
        </main>
        {canUseCommunications ? <OperationsCommunicationsSidebar contacts={communicationContacts} /> : null}
      </AppShell>
    </OperationsActorContext.Provider>
  );
}
