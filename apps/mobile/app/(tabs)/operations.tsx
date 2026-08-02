import { useCallback, useEffect, useState } from "react";
import { getMobileSession, type MobileSession } from "../../lib/session";
import { StateMessage } from "../../components/mobile-ui";
import { RoleOperationsHome } from "../../components/role-operations-home";
import { NativeManagementWorkspace } from "../../components/native-management-workspace";
import { usesNativeManagementHome } from "../../lib/role-navigation";

export default function OperationsScreen() {
  const [error, setError] = useState<string>();
  const [session, setSession] = useState<MobileSession>();

  const openOperations = useCallback(async () => {
    setError(undefined);
    try {
      const session = await getMobileSession();
      if (!session) throw new Error("Phiên đăng nhập đã hết hạn.");
      setSession(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể mở ERP.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await openOperations();
      if (!active) return;
    })();
    return () => { active = false; };
  }, [openOperations]);

  if (error) return <StateMessage title="Chưa thể mở nghiệp vụ" message={error} actionLabel="Thử lại" onAction={() => void openOperations()} />;
  if (!session) return <StateMessage loading title="Đang mở nghiệp vụ" message="Đang kiểm tra quyền trên điện thoại này." />;
  if (usesNativeManagementHome(session.user.role)) return <NativeManagementWorkspace session={session} />;
  return <RoleOperationsHome session={session} />;
}
