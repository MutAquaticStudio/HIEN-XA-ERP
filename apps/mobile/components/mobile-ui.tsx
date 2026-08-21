import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { mobileFonts, useAppTheme } from "../lib/ui";

type ButtonTone = "primary" | "secondary" | "danger";

export function AppButton({ label, onPress, disabled = false, pending = false, tone = "primary", style }: {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  pending?: boolean;
  tone?: ButtonTone;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAppTheme();
  const buttonColor = tone === "danger" ? theme.danger : tone === "secondary" ? theme.surface : theme.brand;
  const textColor = tone === "secondary" ? theme.brand : theme.surface;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: buttonColor, borderColor: tone === "secondary" ? theme.border : buttonColor },
        (pressed || disabled || pending) && styles.buttonPressed,
        style
      ]}
    >
      {pending ? <ActivityIndicator color={textColor} /> : <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>}
    </Pressable>
  );
}

export function StatusChip({ label, tone = "neutral" }: { label: string; tone?: "active" | "neutral" | "warning" }) {
  const theme = useAppTheme();
  const colors = tone === "active"
    ? { backgroundColor: theme.brandSoft, color: theme.brand }
    : tone === "warning"
      ? { backgroundColor: theme.dangerSoft, color: theme.danger }
      : { backgroundColor: theme.surfaceMuted, color: theme.textMuted };

  return <View style={[styles.chip, { backgroundColor: colors.backgroundColor }]}><Text style={[styles.chipText, { color: colors.color }]}>{label}</Text></View>;
}

export function StateMessage({ title, message, actionLabel, onAction, loading = false }: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
}) {
  const theme = useAppTheme();

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.stateSafe, { backgroundColor: theme.background }]}>
      <View style={styles.stateContent}>
        {loading ? <LoadingBlocks /> : <View style={[styles.stateMark, { backgroundColor: theme.brandSoft }]} />}
        <Text style={[styles.stateTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.stateMessage, { color: theme.textMuted }]}>{message}</Text>
        {actionLabel && onAction ? <AppButton label={actionLabel} onPress={() => onAction()} style={styles.stateButton} /> : null}
      </View>
    </SafeAreaView>
  );
}

export function ReviewSheet({ visible, title, message, confirmLabel = "Xác nhận thực hiện", pending = false, onDismiss, onConfirm }: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  pending?: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  const theme = useAppTheme();

  return (
    <Modal animationType="slide" onRequestClose={onDismiss} presentationStyle="pageSheet" transparent visible={visible}>
      <View style={styles.sheetBackdrop}>
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <StatusChip label="Bước rà soát" tone="active" />
            <Text style={[styles.sheetTitle, { color: theme.text }]}>{title}</Text>
            <Text style={[styles.sheetMessage, { color: theme.textMuted }]}>{message}</Text>
            <Text style={[styles.sheetReminder, { backgroundColor: theme.brandSoft, color: theme.text }]}>Máy chủ sẽ kiểm tra lại quyền, trạng thái, số lượng và số tiền trước khi ghi nhận.</Text>
          </ScrollView>
          <View style={styles.sheetActions}>
            <AppButton disabled={pending} label="Quay lại" onPress={onDismiss} tone="secondary" style={styles.sheetButton} />
            <AppButton label={confirmLabel} onPress={onConfirm} pending={pending} style={styles.sheetButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LoadingBlocks() {
  const theme = useAppTheme();
  return (
    <View style={styles.loadingBlocks} accessibilityLabel="Đang tải nội dung">
      <View style={[styles.loadingBlock, styles.loadingBlockWide, { backgroundColor: theme.surfaceMuted }]} />
      <View style={[styles.loadingBlock, styles.loadingBlockShort, { backgroundColor: theme.surfaceMuted }]} />
      <View style={[styles.loadingCard, { backgroundColor: theme.surface, borderColor: theme.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: "center", borderRadius: 14, borderWidth: 1, justifyContent: "center", minHeight: 52, paddingHorizontal: 18 },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  buttonText: { fontFamily: mobileFonts.bold, fontSize: 16, textAlign: "center" },
  chip: { alignSelf: "flex-start", borderRadius: 999, minHeight: 28, justifyContent: "center", paddingHorizontal: 10 },
  chipText: { fontFamily: mobileFonts.semibold, fontSize: 14 },
  stateSafe: { flex: 1 },
  stateContent: { alignItems: "flex-start", flex: 1, justifyContent: "center", padding: 28 },
  stateMark: { borderRadius: 999, height: 44, marginBottom: 20, width: 44 },
  stateTitle: { fontFamily: mobileFonts.bold, fontSize: 24, letterSpacing: -0.45 },
  stateMessage: { fontFamily: mobileFonts.regular, fontSize: 16, lineHeight: 24, marginTop: 9, maxWidth: 390 },
  stateButton: { alignSelf: "stretch", marginTop: 24 },
  loadingBlocks: { gap: 12, width: "100%" },
  loadingBlock: { borderRadius: 8, height: 14 },
  loadingBlockWide: { width: "62%" },
  loadingBlockShort: { width: "42%" },
  loadingCard: { borderRadius: 18, borderWidth: 1, height: 132, marginTop: 10, width: "100%" },
  sheetBackdrop: { backgroundColor: "rgba(15, 23, 42, 0.45)", flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, maxHeight: "82%", minHeight: 340, paddingBottom: 20 },
  sheetHandle: { alignSelf: "center", borderRadius: 999, height: 5, marginTop: 10, width: 48 },
  sheetContent: { padding: 20, paddingBottom: 12 },
  sheetTitle: { fontFamily: mobileFonts.bold, fontSize: 22, lineHeight: 29, marginTop: 14 },
  sheetMessage: { fontFamily: mobileFonts.regular, fontSize: 16, lineHeight: 24, marginTop: 10 },
  sheetReminder: { borderRadius: 14, fontFamily: mobileFonts.semibold, fontSize: 16, lineHeight: 23, marginTop: 16, padding: 14 },
  sheetActions: { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingTop: 8 },
  sheetButton: { flex: 1, minHeight: 52 }
});
