"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { OperationsModuleRouter } from "@/components/erp-v2/modules/operations-module-router";
import { OperationsActorContext } from "@/components/erp-v2/modules/operations-contract";
import { useOperationsRuntime } from "@/components/erp-v2/modules/use-operations-runtime";
import type { OperationsModuleId } from "@/modules/operations/erp-registry";
import { operationsErpRegistry } from "@/modules/operations/erp-registry";
import type { OperationsActor, OperationsState } from "@/modules/operations/types";
import type { SafeIdentityUser } from "@/server/identity/types";

type ErpV2ModuleWorkspaceProps = {
  user: SafeIdentityUser;
  actor: OperationsActor;
  state: OperationsState;
  revision: number;
  syncedAt: string;
  moduleId: OperationsModuleId;
  activePath: string;
  focusedRecordId?: string;
  visibleModuleIds: OperationsModuleId[];
};

export function ErpV2ModuleWorkspace(props: ErpV2ModuleWorkspaceProps) {
  const runtime = useOperationsRuntime(props.state, props.revision, props.syncedAt);
  const module = operationsErpRegistry.moduleById.get(props.moduleId);
  if (!module || !props.visibleModuleIds.includes(props.moduleId)) {
    return <section className="erp-v2-empty erp-v2-panel"><h1>Không có quyền truy cập</h1><p>Vai trò hiện tại không được phép mở module này.</p></section>;
  }
  return <OperationsActorContext.Provider value={props.actor}>
    <header className="erp-v2-page-header">
      <div><p className="erp-v2-eyebrow">ERP V2 · {module.label}</p><h1>{module.title}</h1><p className="erp-v2-page-description">{module.subtitle}</p></div>
      <span className="erp-v2-count">Revision {runtime.syncMeta.revision} · {runtime.syncMeta.status === "syncing" ? "Đang đồng bộ" : "Đã đồng bộ"}</span>
    </header>
    {runtime.feedback ? <div className={`erp-v2-workspace-alert ${runtime.feedback.type}`} role={runtime.feedback.type === "error" ? "alert" : "status"}>
      {runtime.feedback.type === "error" ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      <span>{runtime.feedback.text}</span>
    </div> : null}
    {runtime.syncMeta.error ? <div className="erp-v2-workspace-alert error" role="alert"><AlertTriangle aria-hidden="true" /><span>{runtime.syncMeta.error}</span><button className="erp-v2-button" type="button" onClick={runtime.retrySync}>Thử lại đồng bộ</button></div> : null}
    <OperationsModuleRouter
      activeModule={props.moduleId}
      focusedRecordId={props.focusedRecordId}
      actor={props.actor}
      state={runtime.state}
      syncMeta={runtime.syncMeta}
      visibleModuleIds={props.visibleModuleIds}
      searchTerm=""
      isPending={runtime.isPending}
      runOperation={runtime.runOperation}
      createCommand={runtime.runCreateCommand}
      importWorkbook={runtime.runWorkbookDryRun}
    />
  </OperationsActorContext.Provider>;
}
