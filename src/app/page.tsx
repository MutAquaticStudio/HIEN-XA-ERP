import { OperationsApp } from "@/components/operations-app";
import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { operationsActorRoleOptions } from "@/modules/operations/identity";
import {
  operationsActorForIdentity,
  requirePageIdentityUser,
  visibleModulesForIdentity
} from "@/server/identity/auth-context";
import { canManageUsers } from "@/server/identity/identity-service";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requirePageIdentityUser();
  const snapshot = projectOperationsSnapshot(await getDemoOperationsSnapshot(), user);
  const actor = operationsActorForIdentity(user);
  const roleLabel = operationsActorRoleOptions.find((option) => option.id === user.role)?.label ?? user.role;

  return (
    <OperationsApp
      initialState={snapshot.state}
      initialRevision={snapshot.revision}
      initialSyncedAt={snapshot.syncedAt}
      initialActor={actor}
      visibleModuleIds={visibleModulesForIdentity(user)}
      currentUser={{
        displayName: user.displayName,
        accountName: user.username || user.email,
        roleLabel,
        canManageUsers: canManageUsers(user)
      }}
    />
  );
}
