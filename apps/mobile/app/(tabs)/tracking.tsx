import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getTrackingOverview, recordMobileTrackingConsent, startTrackingSession, stopTrackingSession, type MobileTrackingJob, type MobileTrackingOverview, type MobileTrackingSession } from "../../lib/api";
import { getMobileSession, type MobileSession } from "../../lib/session";
import { startBackgroundTracking, stopBackgroundTracking } from "../../lib/location-task";
import { clearNativeTrackingConsent, recordNativeTrackingConsent } from "../../lib/tracking-consent";
import { canStartNativeBackgroundTracking, nativeTrackingConsentPolicyVersion } from "../../lib/tracking-consent-policy";
import { StateMessage, StatusChip } from "../../components/mobile-ui";
import { canViewAssignedDeliveryRoute } from "../../lib/tracking-view-policy";
import { NativeAssignedDeliveryMap } from "../../components/native-assigned-delivery-map";
import { useAppTheme } from "../../lib/ui";
import { createNativeIdempotencyKey } from "../../lib/native-erp-api";
import { registerMobileForegroundRefresh } from "../../lib/mobile-lifecycle";

type Job = MobileTrackingJob;
type Session = MobileTrackingSession;
type Overview = MobileTrackingOverview;

export default function TrackingScreen() {
  const theme = useAppTheme();
  const [session, setSession] = useState<MobileSession>();
  const [overview, setOverview] = useState<Overview>();
  const [pendingId, setPendingId] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      const current = await getMobileSession();
      if (!current) throw new Error("Phiên đăng nhập đã hết hạn.");
      setSession(current);
      setOverview(await getTrackingOverview(current.accessToken));
    } catch (cause) { throw cause; }
  }, []);

  useEffect(() => { void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Không thể tải giao hàng.")); }, [refresh]);
  useEffect(() => registerMobileForegroundRefresh(async () => {
    await refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Không thể tải giao hàng."));
  }), [refresh]);

  const begin = async (job: Job) => {
    if (!session) return;
    if (!canStartNativeBackgroundTracking({ role: session.user.role, deliveryStatus: job.status, trackingEligible: job.trackingEligible })) {
      Alert.alert("Không thể bật GPS", "Chỉ tài xế được phân công mới có thể bật GPS nền khi chuyến đang đi giao.");
      return;
    }
    setPendingId(job.id);
    try {
      const acceptedAt = new Date().toISOString();
      await recordMobileTrackingConsent(session.accessToken, {
        deliveryJobId: job.id,
        policyVersion: nativeTrackingConsentPolicyVersion,
        idempotencyKey: createNativeIdempotencyKey(`tracking-consent-${job.id}`),
        acceptedAt
      });
      const result = await startTrackingSession(session.accessToken, job.id);
      const consent = await recordNativeTrackingConsent(result.session.id, job.id, acceptedAt);
      try {
        await startBackgroundTracking(result.session.id, job.id, consent);
      } catch (cause) {
        await clearNativeTrackingConsent();
        await stopTrackingSession(session.accessToken, result.session.id);
        throw cause;
      }
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
      try {
        await stopBackgroundTracking();
        await clearNativeTrackingConsent();
      } finally {
        await stopTrackingSession(session.accessToken, tracking.id);
      }
      await refresh();
    } catch (cause) {
      Alert.alert("Không thể dừng", cause instanceof Error ? cause.message : "Vui lòng thử lại.");
    } finally {
      setPendingId(undefined);
    }
  };

  if (error) return <StateMessage title="Chưa tải được chuyến giao" message={error} actionLabel="Thử lại" onAction={() => void refresh()} />;
  if (!overview) return <StateMessage loading title="Đang tải chuyến giao" message="Đang kiểm tra các chuyến bạn có thể theo dõi." />;
  if (canViewAssignedDeliveryRoute(session?.user.role, false)) return <NativeAssignedDeliveryMap audience="assigned" jobs={overview.jobs} onRefresh={() => void refresh()} onStartTracking={session?.user.role === "driver" ? (job) => void begin(job) : undefined} onStopTracking={session?.user.role === "driver" ? (tracking) => void stop(tracking) : undefined} pendingTrackingId={pendingId} sessions={overview.sessions} />;
  if (overview.canManage) return <NativeAssignedDeliveryMap audience="management" jobs={overview.jobs} onRefresh={() => void refresh()} sessions={overview.sessions} />;

  return (
    <SafeAreaView edges={["top"]} style={[styles.safe, { backgroundColor: theme.background }]}>
      <FlatList
        contentContainerStyle={styles.list}
        data={overview.jobs}
        keyExtractor={(job) => job.id}
        ListHeaderComponent={<View style={styles.header}><Text style={[styles.title, { color: theme.text }]}>Theo dõi chuyến giao</Text><Text style={[styles.copy, { color: theme.textMuted }]}>Chỉ bật chia sẻ vị trí khi chuyến hàng đang đi đường.</Text><Text style={[styles.listHeading, { color: theme.text }]}>Chuyến được phân công</Text></View>}
        ListEmptyComponent={<View style={[styles.emptyPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.emptyTitle, { color: theme.text }]}>Chưa có chuyến giao</Text><Text style={[styles.empty, { color: theme.textMuted }]}>Khi được phân công một chuyến đang giao, bạn có thể bật chia sẻ vị trí tại đây.</Text></View>}
        renderItem={({ item: job }) => {
          const active = overview.sessions.find((tracking) => tracking.deliveryJobId === job.id && tracking.status === "active");
          const canShareLocation = canStartNativeBackgroundTracking({ role: session?.user.role, deliveryStatus: job.status, trackingEligible: job.trackingEligible });
          const disabled = Boolean(pendingId) || (!active && !canShareLocation);
          return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.cardTop}><View style={styles.documentBlock}><Text style={[styles.document, { color: theme.text }]}>{job.documentNo}</Text><Text style={[styles.meta, { color: theme.textMuted }]}>Ngày giao: {job.plannedDate}</Text></View><StatusChip label={active ? "Đang chia sẻ vị trí" : canShareLocation ? "Sẵn sàng theo dõi" : "Chưa đủ điều kiện GPS"} tone={active ? "active" : canShareLocation ? "neutral" : "warning"} /></View><Text style={[styles.jobState, { color: theme.textMuted }]}>Trạng thái đơn: {job.status}</Text><Pressable accessibilityRole="button" disabled={disabled} onPress={() => void (active ? stop(active) : begin(job))} style={({ pressed }) => [styles.button, { backgroundColor: active ? theme.danger : theme.brand }, (pressed || disabled) && styles.disabled]}><Text style={[styles.buttonText, { color: theme.surface }]}>{pendingId === (active?.id ?? job.id) ? "Đang xử lý" : active ? "Dừng chia sẻ vị trí" : canShareLocation ? "Đồng ý và bắt đầu GPS" : "Chưa đủ điều kiện GPS"}</Text></Pressable></View>;
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, list: { padding: 18, paddingBottom: 30 }, header: { marginBottom: 14 }, title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.85 }, copy: { fontSize: 16, lineHeight: 23, marginTop: 8 }, listHeading: { fontSize: 18, fontWeight: "800", marginTop: 24 }, card: { borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }, cardTop: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" }, documentBlock: { flex: 1 }, document: { fontSize: 18, fontWeight: "800" }, meta: { fontSize: 14, lineHeight: 20, marginTop: 5 }, jobState: { fontSize: 14, lineHeight: 20, marginTop: 13 }, button: { alignItems: "center", borderRadius: 14, justifyContent: "center", marginTop: 16, minHeight: 52, paddingHorizontal: 12 }, disabled: { opacity: 0.48, transform: [{ scale: 0.99 }] }, buttonText: { fontSize: 16, fontWeight: "800", textAlign: "center" }, emptyPanel: { borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 18 }, emptyTitle: { fontSize: 18, fontWeight: "800" }, empty: { fontSize: 15, lineHeight: 22, marginTop: 6 }
});
