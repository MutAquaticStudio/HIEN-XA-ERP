import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { login } from "../lib/api";
import { saveMobileSession } from "../lib/session";
import { useAppTheme } from "../lib/ui";

export default function SignInScreen() {
  const theme = useAppTheme();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setError(undefined);
    setPending(true);
    try {
      await saveMobileSession(await login(identifier, password));
      router.replace("/(tabs)/operations");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể đăng nhập.");
    } finally {
      setPending(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, { backgroundColor: theme.background }]}>
      <View pointerEvents="none" style={[styles.backgroundHalo, { backgroundColor: theme.brandSoft }]} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <View style={[styles.brandMark, { backgroundColor: theme.surfaceStrong }]}><Text style={[styles.brandMarkText, { color: theme.surface }]}>VLXD</Text></View>
            <Text style={[styles.brand, { color: theme.brand }]}>VẬN HÀNH HIỆN TRƯỜNG</Text>
            <Text style={[styles.title, { color: theme.text }]}>Điều phối công việc ngay trên điện thoại</Text>
            <Text style={[styles.copy, { color: theme.textMuted }]}>Nhận đơn, theo dõi giao hàng và mở nghiệp vụ ERP bằng tài khoản hiện có.</Text>
            <View style={[styles.form, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.formTitle, { color: theme.text }]}>Đăng nhập</Text>
              <Text style={[styles.label, { color: theme.text }]}>Tên đăng nhập hoặc email</Text>
              <TextInput
                accessibilityLabel="Tên đăng nhập hoặc email"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!pending}
                onChangeText={setIdentifier}
                placeholder="Ví dụ: tho.nam"
                placeholderTextColor={theme.textMuted}
                selectionColor={theme.focus}
                style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                textContentType="username"
                value={identifier}
              />
              <Text style={[styles.label, { color: theme.text }]}>Mật khẩu</Text>
              <TextInput
                accessibilityLabel="Mật khẩu"
                editable={!pending}
                onChangeText={setPassword}
                placeholder="Nhập mật khẩu"
                placeholderTextColor={theme.textMuted}
                secureTextEntry
                selectionColor={theme.focus}
                style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                textContentType="password"
                value={password}
              />
              {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
              <Pressable accessibilityRole="button" disabled={pending || !identifier.trim() || !password} onPress={() => void submit()} style={({ pressed }) => [styles.button, { backgroundColor: theme.brand }, (pressed || pending || !identifier.trim() || !password) && styles.buttonPressed]}>
                {pending ? <ActivityIndicator color={theme.surface} /> : <Text style={[styles.buttonText, { color: theme.surface }]}>Đăng nhập</Text>}
              </Pressable>
            </View>
            <Text style={[styles.footnote, { color: theme.textMuted }]}>GPS chỉ được chia sẻ khi bạn chủ động bật cho một chuyến giao đang thực hiện.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  keyboard: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center" },
  backgroundHalo: { borderRadius: 999, height: 300, position: "absolute", right: -124, top: -122, width: 300 },
  content: { paddingHorizontal: 24, paddingVertical: 32 },
  brandMark: { alignItems: "center", borderRadius: 16, height: 54, justifyContent: "center", width: 54 },
  brandMarkText: { fontSize: 15, fontWeight: "900", letterSpacing: 0.7 },
  brand: { fontSize: 12, fontWeight: "900", letterSpacing: 1.25, marginTop: 22 },
  title: { fontSize: 32, fontWeight: "800", letterSpacing: -1, lineHeight: 38, marginTop: 9, maxWidth: 390 },
  copy: { fontSize: 16, lineHeight: 24, marginTop: 12, maxWidth: 390 },
  form: { borderRadius: 20, borderWidth: 1, marginTop: 30, padding: 18 },
  formTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  label: { fontSize: 15, fontWeight: "800", marginTop: 18 },
  input: { borderRadius: 13, borderWidth: 1, fontSize: 16, marginTop: 8, minHeight: 52, paddingHorizontal: 14 },
  error: { fontSize: 14, fontWeight: "700", lineHeight: 20, marginTop: 12 },
  button: { alignItems: "center", borderRadius: 14, justifyContent: "center", marginTop: 22, minHeight: 54 },
  buttonPressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
  buttonText: { fontSize: 17, fontWeight: "800" },
  footnote: { fontSize: 14, lineHeight: 21, marginTop: 20, maxWidth: 390 }
});
