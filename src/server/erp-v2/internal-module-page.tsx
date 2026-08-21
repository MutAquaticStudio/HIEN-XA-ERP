import { notFound, redirect } from "next/navigation";
import { ErpV2ModuleWorkspace } from "@/components/erp-v2/module-workspace";
import type { OperationsModuleId } from "@/modules/operations/erp-registry";
import { getErpV2Snapshot } from "./runtime";
import { operationsActorForIdentity, requirePageIdentityUser, visibleModulesForIdentity } from "@/server/identity/auth-context";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";

export async function renderErpV2InternalModulePage(moduleId: OperationsModuleId, activePath: string, focusedRecordId?: string) {
  const user = await requirePageIdentityUser();
  if (user.role === "customer" || user.role === "supplier") redirect(user.role === "customer" ? "/khach-hang" : "/nha-cung-cap");
  const visibleModuleIds = visibleModulesForIdentity(user);
  if (!visibleModuleIds.includes(moduleId)) redirect("/dashboard");
  const snapshot = projectOperationsSnapshot(await getErpV2Snapshot(), user);
  if (focusedRecordId) {
    const exists = moduleId === "sales"
      ? snapshot.state.salesOrders.some((record) => record.id === focusedRecordId)
      : moduleId === "procurement"
        ? snapshot.state.purchaseOrders.some((record) => record.id === focusedRecordId)
        : moduleId === "delivery"
          ? snapshot.state.deliveryJobs.some((record) => record.id === focusedRecordId)
          : false;
    if (!exists) notFound();
  }
  return <ErpV2ModuleWorkspace
    user={user}
    actor={operationsActorForIdentity(user)}
    state={snapshot.state}
    revision={snapshot.revision}
    syncedAt={snapshot.syncedAt}
    moduleId={moduleId}
    activePath={activePath}
    focusedRecordId={focusedRecordId}
    visibleModuleIds={visibleModuleIds}
  />;
}
