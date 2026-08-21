import { useEffect, useState } from "react";
import Constants from "expo-constants";
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { getMobileReleaseManifest, type MobileReleaseManifest } from "../lib/api";
import { mobileUpdateStatus } from "../lib/app-update";
import { useAppTheme } from "../lib/ui";

const installedVersion = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "0.0.0";

export function AppUpdateNotice() {
  const theme = useAppTheme();
  const [manifest, setManifest] = useState<MobileReleaseManifest>();
  const [dismissed, setDismissed] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void getMobileReleaseManifest().then((next) => {
      if (active) setManifest(next);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!manifest?.enabled || dismissed || !manifest.latestVersion) return null;
  const status = mobileUpdateStatus(installedVersion, manifest.latestVersion, manifest.minimumSupportedVersion);
  if (status === "current") return null;
  const required = status === "required";

  const openDownload = async () => {
    if (!manifest.downloadUrl) {
      setError("Chưa có link cài đặt. Vui lòng liên hệ chủ cửa hàng để nhận APK mới.");
      return;
    }
    setOpening(true);
    setError(undefined);
    try {
      await Linking.openURL(manifest.downloadUrl);
    } catch {
      setError("Không thể mở link cài đặt. Vui lòng thử lại hoặc liên hệ chủ cửa hàng.");
    } finally {
      setOpening(false);
    }
  };

  return <Modal animationType="fade" onRequestClose={required ? undefined : () => setDismissed(true)} transparent visible>
    <View style={styles.backdrop}>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.kicker, { color: required ? theme.danger : theme.brand }]}>{required ? "CẦN CẬP NHẬT" : "CÓ PHIÊN BẢN MỚI"}</Text>
        <Text style={[styles.title, { color: theme.text }]}>{required ? "Hãy cập nhật ứng dụng để tiếp tục" : "Có bản ứng dụng mới"}</Text>
        <Text style={[styles.copy, { color: theme.textMuted }]}>Bạn đang dùng phiên bản {installedVersion}. Phiên bản mới: {manifest.latestVersion}.</Text>
        {manifest.notes ? <Text style={[styles.notes, { backgroundColor: theme.surfaceMuted, color: theme.text }]}>{manifest.notes}</Text> : null}
        {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={opening} onPress={() => void openDownload()} style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.brand }, (pressed || opening) && styles.pressed]}>
          {opening ? <ActivityIndicator color={theme.surface} /> : <Text style={[styles.primaryText, { color: theme.surface }]}>Tải bản cập nhật</Text>}
        </Pressable>
        {!required ? <Pressable accessibilityRole="button" onPress={() => setDismissed(true)} style={styles.laterButton}><Text style={[styles.laterText, { color: theme.textMuted }]}>Để sau</Text></Pressable> : null}
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { alignItems: "center", backgroundColor: "rgba(9, 25, 17, 0.58)", flex: 1, justifyContent: "center", padding: 22 },
  card: { borderRadius: 22, borderWidth: 1, gap: 14, maxWidth: 480, padding: 22, width: "100%" },
  kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  title: { fontSize: 25, fontWeight: "800", lineHeight: 31 },
  copy: { fontSize: 16, lineHeight: 24 },
  notes: { borderRadius: 14, fontSize: 16, lineHeight: 23, padding: 14 },
  error: { fontSize: 15, fontWeight: "700", lineHeight: 21 },
  primaryButton: { alignItems: "center", borderRadius: 14, justifyContent: "center", minHeight: 52, paddingHorizontal: 16 },
  primaryText: { fontSize: 17, fontWeight: "800" },
  laterButton: { alignItems: "center", justifyContent: "center", minHeight: 48 },
  laterText: { fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] }
});
