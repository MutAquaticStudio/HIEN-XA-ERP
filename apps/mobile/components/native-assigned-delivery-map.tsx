import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Camera, GeoJSONSource, Layer, Map } from "@maplibre/maplibre-react-native";
import type { MobileTrackingJob, MobileTrackingSession } from "../lib/api";
import { acceptedTrackingCoordinates, latestAcceptedTrackingCoordinate } from "../lib/tracking-map-model";
import { useAppTheme } from "../lib/ui";
import { AppButton } from "./mobile-ui";

const openStreetMapStyle = { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] } as const;

type NativeAssignedDeliveryMapProps = {
  jobs: MobileTrackingJob[];
  sessions: MobileTrackingSession[];
  onRefresh: () => void;
  audience?: "assigned" | "management";
  pendingTrackingId?: string;
  onStartTracking?: (job: MobileTrackingJob) => void;
  onStopTracking?: (session: MobileTrackingSession) => void;
};

export function NativeAssignedDeliveryMap({ audience = "assigned", jobs, sessions, onRefresh, pendingTrackingId, onStartTracking, onStopTracking }: NativeAssignedDeliveryMapProps) {
  const theme = useAppTheme();
  const [selectedJobId, setSelectedJobId] = useState<string>();
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? jobs[0];
  const activeSession = selectedJob ? sessions.find((session) => session.deliveryJobId === selectedJob.id && session.status === "active") : undefined;
  const coordinates = useMemo(() => acceptedTrackingCoordinates(activeSession?.points ?? []), [activeSession?.points]);
  const latestCoordinate = latestAcceptedTrackingCoordinate(activeSession?.points ?? []);
  const route = useMemo(() => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates } }), [coordinates]);
  const latestMarker = useMemo(() => latestCoordinate ? ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: latestCoordinate } }) : undefined, [latestCoordinate]);
  const isManagement = audience === "management";

  if (!selectedJob) return <View style={[styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.emptyTitle, { color: theme.text }]}>{isManagement ? "Chưa có chuyến để điều phối" : "Chưa có hành trình được giao"}</Text><Text style={[styles.copy, { color: theme.textMuted }]}>{isManagement ? "Khi có chuyến đang giao và tài xế bật GPS, bản đồ điều hành sẽ hiển thị tại đây." : "Khi bạn nhận một công việc có chuyến giao, hành trình của chuyến đó sẽ hiện tại đây."}</Text></View>;

  const openNavigation = async () => {
    const query = selectedJob.deliveryAddress ?? selectedJob.documentNo;
    await Linking.openURL(`geo:0,0?q=${encodeURIComponent(query)}`).catch(() => undefined);
  };

  return <ScrollView contentContainerStyle={[styles.content, { backgroundColor: theme.background }]}>
    <Text style={[styles.kicker, { color: theme.brand }]}>{isManagement ? "BẢN ĐỒ ĐIỀU HÀNH" : "HÀNH TRÌNH CỦA TÔI"}</Text>
    <Text style={[styles.title, { color: theme.text }]}>{isManagement ? "Theo dõi chuyến đang giao" : "Theo dõi chuyến được giao"}</Text>
    <Text style={[styles.copy, { color: theme.textMuted }]}>{isManagement ? "Bản đồ chỉ dùng dữ liệu GPS được cấp quyền, không mở trình duyệt trong ứng dụng." : "Bản đồ chỉ hiển thị vị trí do tài xế của chuyến chia sẻ. Thợ không thể tự bật hoặc sửa GPS."}</Text>
    <View style={styles.jobList}>{jobs.map((job) => <Pressable key={job.id} accessibilityRole="button" onPress={() => setSelectedJobId(job.id)} style={({ pressed }) => [styles.jobButton, { backgroundColor: selectedJob.id === job.id ? theme.brandSoft : theme.surface, borderColor: selectedJob.id === job.id ? theme.brand : theme.border }, pressed && styles.pressed]}><Text style={[styles.jobDocument, { color: theme.text }]}>{job.documentNo}</Text><Text style={[styles.jobMeta, { color: theme.textMuted }]}>{job.status} · {job.plannedDate}</Text></Pressable>)}</View>
    <View style={[styles.mapShell, { borderColor: theme.border }]}>{latestCoordinate && latestMarker ? <Map androidView="texture" mapStyle={openStreetMapStyle as never} style={styles.map}><Camera center={latestCoordinate} duration={500} zoom={14} />{coordinates.length > 1 ? <GeoJSONSource data={route} id="assigned-delivery-route"><Layer id="assigned-delivery-route-line" paint={{ "line-color": "#16794c", "line-width": 5, "line-opacity": 0.86 }} source="assigned-delivery-route" type="line" /></GeoJSONSource> : null}<GeoJSONSource data={latestMarker} id="assigned-delivery-marker"><Layer id="assigned-delivery-marker-circle" paint={{ "circle-color": "#e4582e", "circle-radius": 9, "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 }} source="assigned-delivery-marker" type="circle" /></GeoJSONSource></Map> : <View style={[styles.noSignal, { backgroundColor: theme.surfaceMuted }]}><Text style={[styles.noSignalTitle, { color: theme.text }]}>Chưa có vị trí trực tiếp</Text><Text style={[styles.copy, { color: theme.textMuted }]}>Khi tài xế chuyển chuyến sang đang giao và bật GPS, vị trí sẽ hiển thị tại đây.</Text></View>}<View style={[styles.mapStatus, { backgroundColor: theme.surface }]}><Text style={[styles.mapStatusText, { color: theme.text }]}>{activeSession ? "Đang nhận vị trí của chuyến" : "Tài xế chưa chia sẻ vị trí"}</Text></View></View>
    {onStartTracking && onStopTracking ? <View style={[styles.trackingControl, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.trackingTitle, { color: theme.text }]}>Chia sẻ vị trí chuyến này</Text><Text style={[styles.copy, { color: theme.textMuted }]}>{activeSession ? "GPS đang hoạt động. Dừng chia sẻ khi chuyến kết thúc hoặc khi bạn không còn giao chuyến này." : selectedJob.status === "in_transit" && selectedJob.trackingEligible ? "Chỉ bật GPS trong thời gian đang giao chuyến được phân công." : "Chuyến chưa ở trạng thái đang giao hoặc chưa được phân công cho bạn."}</Text><AppButton disabled={!activeSession && (selectedJob.status !== "in_transit" || !selectedJob.trackingEligible)} label={activeSession ? "Dừng chia sẻ vị trí" : "Đồng ý và bắt đầu GPS"} onPress={() => activeSession ? onStopTracking(activeSession) : onStartTracking(selectedJob)} pending={pendingTrackingId === (activeSession?.id ?? selectedJob.id)} tone={activeSession ? "danger" : "primary"} /></View> : null}
    <Pressable accessibilityRole="button" onPress={() => void openNavigation()} style={({ pressed }) => [styles.navigateButton, { backgroundColor: theme.brand }, pressed && styles.pressed]}><Text style={[styles.navigateText, { color: theme.surface }]}>Mở ứng dụng bản đồ để dẫn đường</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={onRefresh} style={({ pressed }) => [styles.refreshButton, { borderColor: theme.brand }, pressed && styles.pressed]}><Text style={[styles.refreshText, { color: theme.brand }]}>Cập nhật hành trình</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({ content: { flexGrow: 1, gap: 14, padding: 18, paddingBottom: 30 }, kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 1.1 }, title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.8 }, copy: { fontSize: 16, lineHeight: 24 }, jobList: { gap: 9 }, jobButton: { borderRadius: 16, borderWidth: 1, minHeight: 66, padding: 13 }, jobDocument: { fontSize: 17, fontWeight: "800" }, jobMeta: { fontSize: 15, lineHeight: 21, marginTop: 4 }, mapShell: { borderRadius: 20, borderWidth: 1, height: 450, overflow: "hidden", position: "relative" }, map: { flex: 1 }, noSignal: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 }, noSignalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 10, textAlign: "center" }, mapStatus: { borderRadius: 14, bottom: 14, left: 14, paddingHorizontal: 14, paddingVertical: 10, position: "absolute", right: 14 }, mapStatusText: { fontSize: 16, fontWeight: "800", textAlign: "center" }, trackingControl: { borderRadius: 18, borderWidth: 1, gap: 12, padding: 16 }, trackingTitle: { fontSize: 18, fontWeight: "800" }, refreshButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, justifyContent: "center", minHeight: 52, paddingHorizontal: 16 }, refreshText: { fontSize: 17, fontWeight: "800" }, navigateButton: { alignItems: "center", borderRadius: 14, justifyContent: "center", minHeight: 52, paddingHorizontal: 16 }, navigateText: { fontSize: 16, fontWeight: "800", textAlign: "center" }, empty: { borderRadius: 18, borderWidth: 1, gap: 8, margin: 18, padding: 18 }, emptyTitle: { fontSize: 20, fontWeight: "800" }, pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] } });
