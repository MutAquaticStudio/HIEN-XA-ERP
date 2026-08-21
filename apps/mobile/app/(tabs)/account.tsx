import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton, StateMessage, StatusChip } from "../../components/mobile-ui";
import {
  disableMobilePushNotifications,
  enableMobilePushNotifications,
  getMobilePushNotificationState,
  type MobilePushNotificationState
} from "../../lib/notifications";
import { getMobileSession, type MobileSession } from "../../lib/session";
import { registerMobileForegroundRefresh } from "../../lib/mobile-lifecycle";
import { endMobileSession } from "../../lib/mobile-runtime-cleanup";
import { NativePushApiError } from "../../lib/native-push-api";
import { useAppTheme } from "../../lib/ui";

export default function AccountScreen() {
  const theme = useAppTheme();
  const [session, setSession] = useState<MobileSession>();
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [pushPending, setPushPending] = useState(false);
  const [pushState, setPushState] = useState<MobilePushNotificationState>({ registered: false, permissionGranted: false, removalPending: false });

  const load = useCallback(async () => {
    const [next, nextPushState] = await Promise.all([getMobileSession(), getMobilePushNotificationState()]);
    setSession(next);
    setPushState(nextPushState);
    setLoaded(true);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => registerMobileForegroundRefresh(load), [load]);

  const signOut = async () => {
    setPending(true);
    try {
      await endMobileSession(session?.accessToken);
    } finally {
      router.replace("/");
    }
  };

  const confirmSignOut = () => Alert.alert(
    "Đăng xuất",
    "Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng ứng dụng trên điện thoại này.",
    [{ text: "Ở lại", style: "cancel" }, { text: "Đăng xuất", style: "destructive", onPress: () => void signOut() }]
  );

  const toggleNotifications = async () => {
    if (!session) return;
    setPushPending(true);
    try {
      if (pushState.registered || pushState.removalPending) {
        const result = await disableMobilePushNotifications(session.accessToken);
        setPushState(result.state);
        Alert.alert(result.disabled ? "Đã tắt thông báo" : "Chưa thể tắt thông báo", result.message);
      } else {
        const result = await enableMobilePushNotifications(session.accessToken);
        setPushState(result.state);
        Alert.alert(result.enabled ? "Đã bật thông báo" : "Chưa bật thông báo", result.message);
      }
    } catch (cause) {
      if (cause instanceof NativePushApiError && cause.status === 401) {
        await endMobileSession(session.accessToken);
        router.replace("/");
        return;
      }
      Alert.alert("Không thể cập nhật thông báo", cause instanceof Error ? cause.message : "Vui lòng thử lại khi có mạng.");
    } finally {
      setPushPending(false);
    }
  };

  if (!loaded) return <StateMessage loading title="Đang tải tài khoản" message="Đang kiểm tra phiên làm việc trên điện thoại này." />;
  if (!session) return <StateMessage title="Phiên đăng nhập đã hết hạn" message="Đăng nhập lại để tiếp tục nhận đơn và theo dõi giao hàng." actionLabel="Đăng nhập" onAction={() => router.replace("/")} />;

  return (
    <SafeAreaView edges={["top"]} style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Text style={[styles.kicker, { color: theme.brand }]}>TÀI KHOẢN ĐANG DÙNG</Text>
        <Text style={[styles.name, { color: theme.text }]}>{session.user.displayName}</Text>
        <StatusChip label={roleLabel(session.user.role ?? "Tài khoản được cấp quyền")} tone="active" />
        <View style={[styles.privacyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Thông báo công việc</Text>
          <Text style={[styles.copy, { color: theme.textMuted }]}>Chỉ bật khi bạn đồng ý. Thông báo chỉ nhắc việc và trạng thái giao hàng, không hiển thị số tiền hoặc nội dung nhạy cảm.</Text>
          <StatusChip label={pushStatusLabel(pushState)} tone={pushState.registered ? "active" : "neutral"} />
          {pushState.registered || pushState.removalPending
            ? <AppButton label={pushState.removalPending ? "Thử tắt lại thông báo" : "Tắt thông báo trên điện thoại này"} onPress={() => void toggleNotifications()} pending={pushPending} tone="secondary" style={styles.pushButton} />
            : <AppButton label="Bật thông báo trên điện thoại" onPress={() => void toggleNotifications()} pending={pushPending} style={styles.pushButton} />}
        </View>
        <View style={[styles.privacyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Quyền riêng tư vị trí</Text>
          <Text style={[styles.copy, { color: theme.textMuted }]}>Vị trí chỉ được gửi khi bạn chủ động bắt đầu chia sẻ cho một chuyến giao đang đi đường. Dừng chuyến sẽ ngừng gửi vị trí.</Text>
        </View>
        <View style={[styles.sessionCard, { backgroundColor: theme.surfaceMuted }]}>
          <Text style={[styles.sessionTitle, { color: theme.text }]}>Thiết bị này</Text>
          <Text style={[styles.sessionCopy, { color: theme.textMuted }]}>Phiên đăng nhập được lưu bảo mật trên thiết bị. Đăng xuất nếu bạn không còn sử dụng điện thoại này.</Text>
        </View>
        <AppButton label="Đăng xuất khỏi điện thoại này" onPress={confirmSignOut} pending={pending} tone="secondary" style={styles.button} />
      </View>
    </SafeAreaView>
  );
}

function roleLabel(role: string) {
  if (role === "admin") return "Quản trị viên";
  if (role === "delivery_worker" || role === "driver") return "Nhân viên giao hàng";
  if (role === "worker") return "Thợ hiện trường";
  return role;
}

function pushStatusLabel(state: MobilePushNotificationState) {
  if (state.registered && state.permissionGranted) return "Đang nhận thông báo";
  if (state.removalPending) return "Đang chờ tắt thông báo";
  if (state.registered) return "Đã đăng ký, nhưng quyền máy đang tắt";
  return "Chưa bật thông báo";
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, padding: 24 },
  kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  name: { fontSize: 29, fontWeight: "800", letterSpacing: -0.9, marginBottom: 13, marginTop: 9 },
  privacyCard: { borderRadius: 18, borderWidth: 1, marginTop: 16, padding: 18 },
  cardTitle: { fontSize: 18, fontWeight: "800" },
  copy: { fontSize: 16, lineHeight: 24, marginTop: 7 },
  pushButton: { marginTop: 16 },
  sessionCard: { borderRadius: 18, marginTop: 14, padding: 18 },
  sessionTitle: { fontSize: 16, fontWeight: "800" },
  sessionCopy: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  button: { marginTop: 28 }
});