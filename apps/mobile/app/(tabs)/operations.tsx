import { useCallback, useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { createWebBridge } from "../../lib/api";
import { getMobileSession } from "../../lib/session";
import { StateMessage } from "../../components/mobile-ui";
import { useAppTheme } from "../../lib/ui";

export default function OperationsScreen() {
  const theme = useAppTheme();
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();

  const openOperations = useCallback(async () => {
    setError(undefined);
    setUrl(undefined);
    try {
      const session = await getMobileSession();
      if (!session) throw new Error("Phiên đăng nhập đã hết hạn.");
      const bridge = await createWebBridge(session.accessToken, "/");
      setUrl(bridge);
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
  if (!url) return <StateMessage loading title="Đang mở nghiệp vụ" message="Đang tạo phiên bảo mật để mở các chức năng ERP." />;
  return <WebView allowsBackForwardNavigationGestures incognito onError={() => setError("Kết nối ERP bị gián đoạn. Vui lòng thử lại.")} originWhitelist={["https://*", "http://*"]} setSupportMultipleWindows={false} source={{ uri: url }} style={[styles.webview, { backgroundColor: theme.background }]} />;
}

const styles = StyleSheet.create({
  webview: { flex: 1 }
});
