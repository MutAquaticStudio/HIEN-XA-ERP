import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { createWebBridge, getTrackingOverview, startTrackingSession, stopTrackingSession } from "../../lib/api";
import { getMobileSession, type MobileSession } from "../../lib/session";
import { startBackgroundTracking, stopBackgroundTracking } from "../../lib/location-task";
import { StateMessage, StatusChip } from "../../components/mobile-ui";
import { useAppTheme } from "../../lib/ui";

type Job = { id: string; documentNo: string; status: string; plannedDate: string; trackingEligible: boolean };
type Session = { id: string; deliveryJobId: string; status: string; latestPoint?: unknown };
type Overview = { canManage: boolean; jobs: Job[]; sessions: Session[] };

export default function TrackingScreen() {
  const theme = useAppTheme();
  const [session, setSession] = useState<MobileSession>();
  const [overview, setOverview] = useState<Overview>();
  const [adminMapUrl, setAdminMapUrl] = useState<string>();
  const [pendingId, setPendingId] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    const current = await getMobileSession();
    if (!current) throw new Error("Phiên đăng nhập đã hết hạn.");
    setSession(current);
    const next = await getTrackingOverview(current.accessToken);
    setOverview(next);
    if (next.canManage) setAdminMapUrl(await createWebBridge(current.accessToken, "/delivery-tracking"));
  }, []);

  useEffect(() => { void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Không thể tải giao hàng.")); }, [refresh]);

  const begin = async (job: Job) => {
    if (!session) return;
    setPendingId(job.id);
    try {
      const result = await startTrackingSession(session.accessToken, job.id);
      try {
        await startBackgroundTracking(result.session.id, job.id);
      } catch (cause) {
        await stopTrackingSession(session.accessToken, result.session.id);
        throw cause;
      }
      if (result.publicUrl) await Share.share({ message: `Theo dõi chuyến ${job.documentNo}: ${result.publicUrl}` });
      await refresh();
    } catch (cause) {
      Alert.alert("Không thể bắt đầu", cause instanceof Error ? cause.message : "Vui lòng thử lại.");
    } finally {
      setPendingId(undefined);
    }
  };

  const stop = async (tracking: Session) => {
    if (!session) return;
    setPendingId(tracking.id);
    try {
      await stopBackgroundTracking();
      await stopTrackingSession(session.accessToken, tracking.id);
      await refresh();
    } catch (cause) {
      Alert.alert("Không thể dừng", cause instanceof Error ? cause.message : "Vui lòng thử lại.");
    } finally {
      setPendingId(undefined);
    }
  };

  if (error) return <StateMessage title="Chưa tải được chuyến giao" message={error} actionLabel="Thử lại" onAction={() => void refresh()} />;
  if (!overview) return <StateMessage loading title="Đang tải chuyến giao" message="Đang kiểm tra các chuyến bạn có thể theo dõi." />;
  if (overview.canManage && adminMapUrl) return <WebView allowsBackForwardNavigationGestures incognito onError={() => setError("Không thể kết nối bản đồ theo dõi. Vui lòng thử lại.")} setSupportMultipleWindows={false} source={{ uri: adminMapUrl }} style={[styles.webview, { backgroundColor: theme.background }]} />;

  return (
    <SafeAreaView edges={["top"]} style={[styles.safe, { backgroundColor: theme.background }]}>
      <FlatList
        contentContainerStyle={styles.list}
        data={overview.jobs}
        keyExtractor={(job) => job.id}
        ListHeaderComponent={<View style={styles.header}><Text style={[styles.title, { color: theme.text }]}>Theo dõi chuyến giao</Text><Text style={[styles.copy, { color: theme.textMuted }]}>Chỉ bật chia sẻ vị trí khi chuyến hàng đang đi đường.</Text><View style={[styles.privacyPanel, { backgroundColor: theme.brandSoft, borderColor: theme.border }]}><Text style={[styles.privacyTitle, { color: theme.text }]}>Chia sẻ có kiểm soát</Text><Text style={[styles.privacyCopy, { color: theme.textMuted }]}>Ứng dụng hiển thị trạng thái hệ thống khi GPS nền đang hoạt động. Dừng chuyến để ngừng gửi vị trí.</Text></View><Text style={[styles.listHeading, { color: theme.text }]}>Chuyến được phân công</Text></View>}
        ListEmptyComponent={<View style={[styles.emptyPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.emptyTitle, { color: theme.text }]}>Chưa có chuyến giao</Text><Text style={[styles.empty, { color: theme.textMuted }]}>Khi được phân công một chuyến đang giao, bạn có thể bật chia sẻ vị trí tại đây.</Text></View>}
        renderItem={({ item: job }) => {
          const active = overview.sessions.find((tracking) => tracking.deliveryJobId === job.id && tracking.status === "active");
          const disabled = Boolean(pendingId) || (!active && !job.trackingEligible);
          const statusLabel = active ? "Đang chia sẻ vị trí" : job.trackingEligible ? "Sẵn sàng theo dõi" : "Chờ xuất bến";
          return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.cardTop}><View style={styles.documentBlock}><Text style={[styles.document, { color: theme.text }]}>{job.documentNo}</Text><Text style={[styles.meta, { color: theme.textMuted }]}>Ngày giao: {job.plannedDate}</Text></View><StatusChip label={statusLabel} tone={active ? "active" : job.trackingEligible ? "neutral" : "warning"} /></View><Text style={[styles.jobState, { color: theme.textMuted }]}>Trạng thái đơn: {job.status}</Text><Pressable accessibilityRole="button" disabled={disabled} onPress={() => void (active ? stop(active) : begin(job))} style={({ pressed }) => [styles.button, { backgroundColor: active ? theme.danger : theme.brand }, (pressed || disabled) && styles.disabled]}><Text style={[styles.buttonText, { color: theme.surface }]}>{pendingId === (active?.id ?? job.id) ? "Đang xử lý" : active ? "Dừng chia sẻ vị trí" : job.trackingEligible ? "Bắt đầu chia sẻ vị trí" : "Chờ xuất bến"}</Text></Pressable></View>;
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  webview: { flex: 1 },
  list: { padding: 18, paddingBottom: 30 },
  header: { marginBottom: 14 },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.85 },
  copy: { fontSize: 16, lineHeight: 23, marginTop: 8, maxWidth: 380 },
  privacyPanel: { borderRadius: 18, borderWidth: 1, marginTop: 20, padding: 15 },
  privacyTitle: { fontSize: 16, fontWeight: "800" },
  privacyCopy: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  listHeading: { fontSize: 18, fontWeight: "800", marginTop: 24 },
  card: { borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 },
  cardTop: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  documentBlock: { flex: 1 },
  document: { fontSize: 18, fontWeight: "800" },
  meta: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  jobState: { fontSize: 14, lineHeight: 20, marginTop: 13 },
  button: { alignItems: "center", borderRadius: 14, justifyContent: "center", marginTop: 16, minHeight: 52, paddingHorizontal: 12 },
  disabled: { opacity: 0.48, transform: [{ scale: 0.99 }] },
  buttonText: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  emptyPanel: { borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 18 },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  empty: { fontSize: 15, lineHeight: 22, marginTop: 6 }
});
