import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { clearMobileSession, getMobileSession, type MobileSession } from "../../lib/session";
import { AppButton, StateMessage, StatusChip } from "../../components/mobile-ui";
import { useAppTheme } from "../../lib/ui";

export default function AccountScreen() {
  const theme = useAppTheme();
  const [session, setSession] = useState<MobileSession>();
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => { void getMobileSession().then((next) => { setSession(next); setLoaded(true); }); }, []);
  const signOut = async () => { setPending(true); await clearMobileSession(); router.replace("/"); };
  const confirmSignOut = () => Alert.alert("Đăng xuất", "Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng ứng dụng trên điện thoại này.", [{ text: "Ở lại", style: "cancel" }, { text: "Đăng xuất", style: "destructive", onPress: () => void signOut() }]);

  if (!loaded) return <StateMessage loading title="Đang tải tài khoản" message="Đang kiểm tra phiên làm việc trên điện thoại này." />;
  if (!session) return <StateMessage title="Phiên đăng nhập đã hết hạn" message="Đăng nhập lại để tiếp tục nhận đơn và theo dõi giao hàng." actionLabel="Đăng nhập" onAction={() => router.replace("/")} />;

  return <SafeAreaView edges={["top"]} style={[styles.safe, { backgroundColor: theme.background }]}><View style={styles.content}><Text style={[styles.kicker, { color: theme.brand }]}>TÀI KHOẢN ĐANG DÙNG</Text><Text style={[styles.name, { color: theme.text }]}>{session.user.displayName}</Text><StatusChip label={roleLabel(session.user.role ?? "Tài khoản được cấp quyền")} tone="active" /><View style={[styles.privacyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.cardTitle, { color: theme.text }]}>Quyền riêng tư vị trí</Text><Text style={[styles.copy, { color: theme.textMuted }]}>Vị trí chỉ được gửi khi bạn chủ động bắt đầu chia sẻ cho một chuyến giao đang đi đường. Dừng chuyến sẽ ngừng gửi vị trí.</Text></View><View style={[styles.sessionCard, { backgroundColor: theme.surfaceMuted }]}><Text style={[styles.sessionTitle, { color: theme.text }]}>Thiết bị này</Text><Text style={[styles.sessionCopy, { color: theme.textMuted }]}>Phiên đăng nhập được lưu bảo mật trên thiết bị. Đăng xuất nếu bạn không còn sử dụng điện thoại này.</Text></View><AppButton label="Đăng xuất khỏi điện thoại này" onPress={confirmSignOut} pending={pending} tone="secondary" style={styles.button} /></View></SafeAreaView>;
}

function roleLabel(role: string) {
  if (role === "admin") return "Quản trị viên";
  if (role === "delivery_worker" || role === "driver") return "Nhân viên giao hàng";
  if (role === "worker") return "Thợ hiện trường";
  return role;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, padding: 24 },
  kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  name: { fontSize: 29, fontWeight: "800", letterSpacing: -0.9, marginBottom: 13, marginTop: 9 },
  privacyCard: { borderRadius: 18, borderWidth: 1, marginTop: 26, padding: 18 },
  cardTitle: { fontSize: 18, fontWeight: "800" },
  copy: { fontSize: 16, lineHeight: 24, marginTop: 7 },
  sessionCard: { borderRadius: 18, marginTop: 14, padding: 18 },
  sessionTitle: { fontSize: 16, fontWeight: "800" },
  sessionCopy: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  button: { marginTop: 28 }
});
