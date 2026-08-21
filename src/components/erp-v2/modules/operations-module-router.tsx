"use client";

import type { OperationsActor, OperationsState } from "@/modules/operations/types";
import type { OperationsModuleId } from "@/modules/operations/erp-registry";
import { dashboardRoleForActor } from "@/modules/operations/identity";
import type { CreateCommandHandler, OperationHandler, SyncMeta, WorkbookImportHandler } from "./operations-contract";
import { OverviewView } from "./overview-view";
import { MasterDataView } from "./catalog-view";
import { SalesView } from "./sales-view";
import { ProcurementView, WorkerProcurementView } from "./procurement-view";
import { DeliveryView, WorkerDeliveryView } from "./delivery-view";
import { InventoryView } from "./inventory-view";
import { ReceivablesView } from "./receivables-view";
import { PayablesView } from "./payables-view";
import { CashView } from "./cash-view";
import { WorkforceView, WorkerWorkforceView } from "./workforce-view";
import { ImportView } from "./import-view";
import { AuditView } from "./audit-view";
import { ReportingView } from "./reporting-view";

type OperationsModuleRouterProps = {
  activeModule: OperationsModuleId;
  focusedRecordId?: string;
  actor: OperationsActor;
  state: OperationsState;
  syncMeta: SyncMeta;
  visibleModuleIds: OperationsModuleId[];
  searchTerm: string;
  isPending: boolean;
  runOperation: OperationHandler;
  createCommand: CreateCommandHandler;
  importWorkbook: WorkbookImportHandler;
};

export function OperationsModuleRouter(props: OperationsModuleRouterProps) {
  const { activeModule, focusedRecordId, actor, state, syncMeta, visibleModuleIds, searchTerm, isPending, runOperation, createCommand, importWorkbook } = props;
  switch (activeModule) {
    case "overview":
      return <OverviewView state={state} syncMeta={syncMeta} activeRole={dashboardRoleForActor(actor.role)} canViewAudit={visibleModuleIds.includes("audit")} />;
    case "masterData":
      return <MasterDataView state={state} createCommand={createCommand} isPending={isPending} searchTerm={searchTerm} />;
    case "sales":
      return <SalesView state={state} runOperation={runOperation} createCommand={createCommand} isPending={isPending} focusedRecordId={focusedRecordId} />;
    case "procurement":
      return actor.role === "worker"
        ? <WorkerProcurementView state={state} runOperation={runOperation} isPending={isPending} focusedRecordId={focusedRecordId} />
        : <ProcurementView state={state} runOperation={runOperation} createCommand={createCommand} isPending={isPending} focusedRecordId={focusedRecordId} />;
    case "delivery":
      return actor.role === "worker"
        ? <WorkerDeliveryView state={state} runOperation={runOperation} isPending={isPending} focusedRecordId={focusedRecordId} />
        : <DeliveryView state={state} runOperation={runOperation} createCommand={createCommand} isPending={isPending} focusedRecordId={focusedRecordId} />;
    case "inventory":
      return <InventoryView key={actor.role} state={state} runOperation={runOperation} isPending={isPending} />;
    case "receivables":
      return <ReceivablesView state={state} runOperation={runOperation} createCommand={createCommand} isPending={isPending} />;
    case "payables":
      return <PayablesView state={state} runOperation={runOperation} createCommand={createCommand} isPending={isPending} />;
    case "cash":
      return <CashView state={state} runOperation={runOperation} createCommand={createCommand} isPending={isPending} />;
    case "workforce":
      return actor.role === "worker"
        ? <WorkerWorkforceView state={state} runOperation={runOperation} isPending={isPending} />
        : <WorkforceView state={state} runOperation={runOperation} createCommand={createCommand} isPending={isPending} />;
    case "import":
      return <ImportView state={state} runOperation={runOperation} createCommand={createCommand} importWorkbook={importWorkbook} isPending={isPending} />;
    case "audit":
      return <AuditView state={state} />;
    case "reporting":
      return <ReportingView state={state} />;
    default:
      return null;
  }
}
