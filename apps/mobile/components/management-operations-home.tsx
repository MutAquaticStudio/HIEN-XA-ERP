import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  getMobileManagementOverview,
  runMobileManagementAction,
  type MobileManagementOverview,
  type MobileManagementRecord
} from "../lib/api";
import type { MobileSession } from "../lib/session";
import { StateMessage } from "./mobile-ui";
import { useAppTheme } from "../lib/ui";

export function ManagementOperationsHome({ session }: { session: MobileSession }) {
  const theme = useAppTheme();
  const [overview, setOverview] = useState<MobileManagementOverview>();
  const [error, setError] = useState<string>();
  const [selectedModuleId, setSelectedModuleId] = useState<string>();
  const [pendingActionId, setPendingActionId] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setError(undefined);
      setOverview(await getMobileManagementOverview(session.accessToken));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải bảng điều hành.");
    }
  }, [session.accessToken]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (error) return <StateMessage title="Chưa thể mở nghiệp vụ" message={error} actionLabel="Thử lại" onAction={() => void refresh()} />;
  if (!overview) return <StateMessage loading title="Đang mở bảng điều hành" message="Đang kiểm tra quyền và dữ liệu được phép xem trên điện thoại này." />;

  const selectedModule = overview.modules.find((module) => module.id === selectedModuleId);

  const runAction = (record: MobileManagementRecord) => {
    if (!record.action) return;
    Alert.alert(record.action.confirmationTitle, record.action.confirmationMessage, [
      { text: "Quay lại", style: "cancel" },
      {
        text: record.action.label,
        onPress: () => void (async () => {
          setPendingActionId(record.id);
          try {
            const result = await runMobileManagementAction(session.accessToken, {
              operation: record.action!.operation,
              targetId: record.action!.targetId,
              idempotencyKey: `mobile-management-${record.action!.operation}-${record.action!.targetId}-${Date.now().toString(36)}`
            });
            Alert.alert("Đã gửi xác nhận", result.summary);
            await refresh();
          } catch (cause) {
            Alert.alert("Không thể thực hiện", cause instanceof Error ? cause.message : "Vui lòng thử lại.");
          } finally {
            setPendingActionId(undefined);
          }
        })()
      }
    ]);
  };

  return <ScrollView contentContainerStyle={[styles.content, { backgroundColor: theme.background }]}>
    <Text style={[styles.kicker, { color: theme.brand }]}>BẢNG ĐIỀU HÀNH NATIVE</Text>
    <Text style={[styles.title, { color: theme.text }]}>Chào {overview.displayName}</Text>
    <Text style={[styles.copy, { color: theme.textMuted }]}>Theo dõi việc cần xử lý và mở đúng nghiệp vụ được cấp quyền, ngay trong ứng dụng.</Text>

    <View style={[styles.sync, { backgroundColor: theme.brandSoft, borderColor: theme.border }]}>
      <Text style={[styles.syncLabel, { color: theme.brand }]}>Dữ liệu đang đồng bộ</Text>
      <Text style={[styles.syncValue, { color: theme.text }]}>Cập nhật {overview.syncedAt}</Text>
    </View>

    <View style={styles.metrics}>
      {overview.metrics.map((metric) => <View key={metric.id} style={[styles.metric, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{metric.label}</Text>
        <Text style={[styles.metricValue, { color: theme.text }]}>{metric.value}</Text>
      </View>)}
    </View>

    <Text style={[styles.sectionTitle, { color: theme.text }]}>Các mục được cấp quyền</Text>
    <Text style={[styles.copy, { color: theme.textMuted }]}>Chọn một mục để xem chứng từ và trạng thái thực tế. Chỉ thao tác được cấp quyền mới xuất hiện.</Text>
    <View style={styles.modules}>
      {overview.modules.map((module) => <Pressable key={module.id} accessibilityRole="button" accessibilityHint={`Mở mục ${module.label}`} onPress={() => setSelectedModuleId(module.id)} style={({ pressed }) => [styles.module, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && styles.pressed]}>
        <View style={styles.moduleHeader}><Text style={[styles.moduleLabel, { color: theme.text }]}>{module.label}</Text><Text style={[styles.moduleCount, { color: theme.brand }]}>{module.count}</Text></View>
        <Text style={[styles.moduleDescription, { color: theme.textMuted }]}>{module.description}</Text>
        <Text style={[styles.moduleOpen, { color: theme.brand }]}>Xem chứng từ</Text>
      </Pressable>)}
    </View>

    <Modal animationType="slide" transparent={false} visible={Boolean(selectedModule)} onRequestClose={() => setSelectedModuleId(undefined)}>
      <View style={[styles.workspace, { backgroundColor: theme.background }]}>
        <View style={[styles.workspaceHeader, { borderColor: theme.border }]}>
          <Pressable accessibilityRole="button" onPress={() => setSelectedModuleId(undefined)} style={({ pressed }) => [styles.back, { borderColor: theme.border, backgroundColor: theme.surface }, pressed && styles.pressed]}><Text style={[styles.backText, { color: theme.text }]}>Quay lại</Text></Pressable>
          <Text style={[styles.workspaceKicker, { color: theme.brand }]}>NGHIỆP VỤ NATIVE</Text>
        </View>
        {selectedModule ? <ScrollView contentContainerStyle={styles.workspaceContent}>
          <View style={[styles.detail, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
            <Text style={[styles.detailTitle, { color: theme.text }]}>{selectedModule.label}</Text>
            <Text style={[styles.copy, { color: theme.textMuted }]}>{selectedModule.description}</Text>
            <View style={[styles.countPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.countLabel, { color: theme.textMuted }]}>Mục hiện có</Text><Text style={[styles.countValue, { color: theme.brand }]}>{selectedModule.count}</Text></View>
            <Text style={[styles.detailHint, { color: theme.brand }]}>Dữ liệu đã được máy chủ lọc theo quyền. Giá vốn, số dư và thông tin nội bộ chỉ hiển thị khi tài khoản được cấp đúng module.</Text>
          </View>

          <View style={[styles.workflow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.detailTitle, { color: theme.text }]}>Chứng từ và trạng thái</Text>
            <Text style={[styles.copy, { color: theme.textMuted }]}>Mọi xác nhận được máy chủ kiểm tra quyền, trạng thái và chống ghi trùng trước khi lưu.</Text>
            {selectedModule.records.length === 0 ? <Text style={[styles.empty, { color: theme.textMuted }]}>Chưa có dữ liệu được phép xem trong mục này.</Text> : selectedModule.records.map((record) => <View key={record.id} style={[styles.record, { borderColor: theme.border }]}>
              <Text style={[styles.recordTitle, { color: theme.text }]}>{record.title}</Text>
              <Text style={[styles.recordSubtitle, { color: theme.textMuted }]}>{record.subtitle}</Text>
              {record.status ? <Text style={[styles.recordStatus, { color: theme.brand }]}>{record.status}</Text> : null}
              {record.action ? <Pressable accessibilityRole="button" disabled={Boolean(pendingActionId)} onPress={() => runAction(record)} style={({ pressed }) => [styles.confirm, { backgroundColor: theme.brand }, (pressed || pendingActionId) && styles.pressed]}><Text style={[styles.confirmText, { color: theme.surface }]}>{pendingActionId === record.id ? "Đang xử lý" : record.action.label}</Text></Pressable> : null}
            </View>)}
          </View>
        </ScrollView> : null}
      </View>
    </Modal>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 20, paddingBottom: 34 },
  kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 1.15 },
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.9, marginTop: 8 },
  copy: { fontSize: 16, lineHeight: 24, marginTop: 7 },
  sync: { borderRadius: 18, borderWidth: 1, marginTop: 20, padding: 15 },
  syncLabel: { fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  syncValue: { fontSize: 16, fontWeight: "800", marginTop: 5 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 },
  metric: { borderRadius: 17, borderWidth: 1, flexGrow: 1, minHeight: 110, minWidth: "45%", padding: 15 },
  metricLabel: { fontSize: 15, fontWeight: "800" },
  metricValue: { fontSize: 30, fontWeight: "900", marginTop: 9 },
  sectionTitle: { fontSize: 21, fontWeight: "800", letterSpacing: -0.35, marginTop: 28 },
  modules: { gap: 12, marginTop: 16 },
  module: { borderRadius: 18, borderWidth: 1, minHeight: 100, padding: 16 },
  moduleHeader: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  moduleLabel: { flex: 1, fontSize: 18, fontWeight: "800" },
  moduleCount: { fontSize: 20, fontWeight: "900" },
  moduleDescription: { fontSize: 15, lineHeight: 22, marginTop: 7 },
  moduleOpen: { fontSize: 15, fontWeight: "800", marginTop: 11 },
  workspace: { flex: 1 },
  workspaceHeader: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", gap: 13, minHeight: 82, paddingHorizontal: 18, paddingTop: 18 },
  workspaceKicker: { flex: 1, fontSize: 12, fontWeight: "900", letterSpacing: 1.1, textAlign: "right" },
  workspaceContent: { padding: 18, paddingBottom: 34 },
  back: { alignItems: "center", borderRadius: 13, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 16 },
  backText: { fontSize: 16, fontWeight: "800" },
  detail: { borderRadius: 18, borderWidth: 1, marginTop: 16, padding: 16 },
  detailTitle: { fontSize: 19, fontWeight: "800" },
  detailHint: { fontSize: 15, fontWeight: "800", lineHeight: 22, marginTop: 13 },
  countPanel: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 16, minHeight: 62, paddingHorizontal: 14 },
  countLabel: { fontSize: 16, fontWeight: "800" },
  countValue: { fontSize: 26, fontWeight: "900" },
  workflow: { borderRadius: 18, borderWidth: 1, marginTop: 16, padding: 16 },
  record: { borderTopWidth: 1, marginTop: 15, paddingTop: 15 },
  recordTitle: { fontSize: 17, fontWeight: "800", lineHeight: 24 },
  recordSubtitle: { fontSize: 16, lineHeight: 23, marginTop: 4 },
  recordStatus: { fontSize: 15, fontWeight: "800", marginTop: 8 },
  confirm: { alignItems: "center", borderRadius: 13, justifyContent: "center", marginTop: 12, minHeight: 48, paddingHorizontal: 12 },
  confirmText: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  empty: { fontSize: 16, lineHeight: 23, marginTop: 16 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] }
});
