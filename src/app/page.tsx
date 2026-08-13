import { OperationsApp } from "@/components/operations-app";
import { PushNotificationControl } from "@/components/push-notification-control";
import { DisplayPreferences } from "@/components/display-preferences";
import Link from "next/link";
import { redirect } from "next/navigation";
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
  if (user.role === "customer" || user.role === "supplier") {
    redirect(user.role === "customer" ? "/khach-hang" : "/nha-cung-cap");
  }
  const snapshot = projectOperationsSnapshot(await getDemoOperationsSnapshot(), user);
  const actor = operationsActorForIdentity(user);
  const roleLabel = operationsActorRoleOptions.find((option) => option.id === user.role)?.label ?? user.role;

  return (
    <>
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
        accountTools={(
          <>
            <DisplayPreferences />
            {["owner", "administrator", "sales", "accountant", "warehouse", "dispatcher"].includes(user.role) ? (
              <>
                <PushNotificationControl />
                <Link className="account-tool-link" href="/trao-doi">Trao đổi với khách hàng và nhà cung cấp</Link>
              </>
            ) : null}
          </>
        )}
      />
    </>
  );
}
