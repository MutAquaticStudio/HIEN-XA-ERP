import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMobileMessages, sendMobileMessage, type MobileMessage } from "../../lib/api";
import { getMobileSession, type MobileSession } from "../../lib/session";
import { AppButton, StateMessage } from "../../components/mobile-ui";
import { useAppTheme } from "../../lib/ui";

export default function MessagesScreen() {
  const theme = useAppTheme();
  const [session, setSession] = useState<MobileSession>();
  const [messages, setMessages] = useState<MobileMessage[]>([]);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setError(undefined);
      const current = await getMobileSession();
      if (!current || (current.user.role !== "customer" && current.user.role !== "supplier")) throw new Error("Tài khoản này không có hộp thư đối tác.");
      setSession(current);
      const result = await getMobileMessages(current.accessToken, current.user.role);
      setMessages(result.messages);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải tin nhắn.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const send = async () => {
    if (!session || !body.trim()) return;
    setPending(true);
    try {
      await sendMobileMessage(session.accessToken, {
        partyType: session.user.role as "customer" | "supplier",
        body: body.trim(),
        idempotencyKey: `message-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
      });
      setBody("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể gửi tin nhắn.");
    } finally {
      setPending(false);
    }
  };

  if (error) return <StateMessage title="Chưa thể mở tin nhắn" message={error} actionLabel="Thử lại" onAction={() => void refresh()} />;
  if (!session) return <StateMessage loading title="Đang tải tin nhắn" message="Đang kiểm tra hộp thư của tài khoản này." />;

  return <SafeAreaView edges={["top"]} style={[styles.safe, { backgroundColor: theme.background }]}>
    <FlatList
      contentContainerStyle={styles.content}
      data={messages}
      keyExtractor={(message) => message.id}
      ListHeaderComponent={<View><Text style={[styles.title, { color: theme.text }]}>Trao đổi với cửa hàng</Text><Text style={[styles.copy, { color: theme.textMuted }]}>Tin nhắn chỉ dùng cho đơn hàng và đối soát của chính bạn.</Text></View>}
      ListEmptyComponent={<Text style={[styles.empty, { color: theme.textMuted }]}>Chưa có tin nhắn. Bạn có thể gửi câu hỏi cho cửa hàng ở bên dưới.</Text>}
      renderItem={({ item }) => <View style={[styles.message, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.sender, { color: theme.text }]}>{item.senderName ?? "Cửa hàng"}</Text><Text style={[styles.messageBody, { color: theme.text }]}>{item.body}</Text><Text style={[styles.time, { color: theme.textMuted }]}>{item.sentAt}</Text></View>}
    />
    <View style={[styles.composer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}><TextInput accessibilityLabel="Nội dung tin nhắn" multiline onChangeText={setBody} placeholder="Nhập nội dung cần trao đổi" placeholderTextColor={theme.textMuted} style={[styles.input, { borderColor: theme.border, color: theme.text }]} value={body} /><AppButton disabled={!body.trim()} label="Gửi tin nhắn" onPress={() => void send()} pending={pending} style={styles.sendButton} /></View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { gap: 12, padding: 20, paddingBottom: 170 },
  title: { fontSize: 27, fontWeight: "800", letterSpacing: -0.7 },
  copy: { fontSize: 16, lineHeight: 23, marginTop: 7 },
  message: { borderRadius: 16, borderWidth: 1, padding: 14 },
  sender: { fontSize: 14, fontWeight: "800" },
  messageBody: { fontSize: 16, lineHeight: 23, marginTop: 5 },
  time: { fontSize: 13, marginTop: 8 },
  empty: { fontSize: 16, lineHeight: 23, marginTop: 24 },
  composer: { borderTopWidth: 1, gap: 10, padding: 14 },
  input: { borderRadius: 14, borderWidth: 1, fontSize: 16, minHeight: 60, padding: 12, textAlignVertical: "top" },
  sendButton: { minHeight: 52 }
});
