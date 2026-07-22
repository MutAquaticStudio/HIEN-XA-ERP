import { ActivityIndicator, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "../lib/ui";

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
  buttonText: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  chip: { alignSelf: "flex-start", borderRadius: 999, minHeight: 28, justifyContent: "center", paddingHorizontal: 10 },
  chipText: { fontSize: 13, fontWeight: "800" },
  stateSafe: { flex: 1 },
  stateContent: { alignItems: "flex-start", flex: 1, justifyContent: "center", padding: 28 },
  stateMark: { borderRadius: 999, height: 44, marginBottom: 20, width: 44 },
  stateTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.45 },
  stateMessage: { fontSize: 16, lineHeight: 24, marginTop: 9, maxWidth: 390 },
  stateButton: { alignSelf: "stretch", marginTop: 24 },
  loadingBlocks: { gap: 12, width: "100%" },
  loadingBlock: { borderRadius: 8, height: 14 },
  loadingBlockWide: { width: "62%" },
  loadingBlockShort: { width: "42%" },
  loadingCard: { borderRadius: 18, borderWidth: 1, height: 132, marginTop: 10, width: "100%" }
});
