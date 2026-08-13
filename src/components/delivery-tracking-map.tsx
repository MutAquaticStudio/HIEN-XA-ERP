"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./delivery-tracking-map.module.css";

type Point = { latitude: number; longitude: number; recordedAt: string; accuracyMeters?: number; quality?: "accepted" | "suspect"; suspectReason?: string };
type Session = {
  id: string;
  documentNo: string;
  status: string;
  driverLabel: string;
  shareActive?: boolean;
  latestPoint?: Point;
  points: Point[];
};
type TrackingResponse = { ok: boolean; sessions?: Session[]; session?: Session; documentNo?: string; updatedAt?: string; error?: string };

const fallbackStyle = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
};

export function DeliveryTrackingMap({ endpoint, mode, enableShare = false }: { endpoint: string; mode: "admin" | "customer"; enableShare?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(undefined);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [message, setMessage] = useState("Đang tải vị trí giao hàng...");
  const [shareMessage, setShareMessage] = useState<string>();
  const [refreshToken, setRefreshToken] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [trackingLoaded, setTrackingLoaded] = useState(false);
  const [mapError, setMapError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let maplibregl: any;
    const updateMap = (nextSessions: Session[]) => {
      const map = mapRef.current;
      if (!map?.isStyleLoaded()) return;
      const points = nextSessions.flatMap((session) => session.points);
      const route = {
        type: "FeatureCollection",
        features: nextSessions.filter((session) => session.points.length > 1).map((session) => ({
          type: "Feature",
          properties: { documentNo: session.documentNo },
          geometry: { type: "LineString", coordinates: session.points.map((point) => [point.longitude, point.latitude]) }
        }))
      };
      const markers = {
        type: "FeatureCollection",
        features: nextSessions.filter((session) => session.latestPoint).map((session) => ({
          type: "Feature",
          properties: { documentNo: session.documentNo, driverLabel: session.driverLabel },
          geometry: { type: "Point", coordinates: [session.latestPoint!.longitude, session.latestPoint!.latitude] }
        }))
      };
      const routeSource = map.getSource("delivery-route");
      const markerSource = map.getSource("delivery-markers");
      if (routeSource) routeSource.setData(route);
      if (markerSource) markerSource.setData(markers);
      if (points.length) {
        const coordinates: [number, number][] = points.map((point): [number, number] => [point.longitude, point.latitude]);
        map.fitBounds(coordinates.reduce((bounds: any, coordinate) => bounds.extend(coordinate), new maplibregl.LngLatBounds(coordinates[0], coordinates[0])), { padding: 56, maxZoom: 15, duration: 700 });
      }
    };
    const load = async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin" });
        const payload = await response.json() as TrackingResponse;
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Không thể tải vị trí giao hàng.");
        const nextSessions = payload.sessions ?? (payload.session ? [payload.session] : []);
        if (cancelled) return;
        setSessions(nextSessions);
        setUpdatedAt(payload.updatedAt);
        setTrackingLoaded(true);
        setMessage(nextSessions.length ? "Vị trí được cập nhật tự động mỗi 10 giây." : "Chưa có chuyến nào đang chia sẻ vị trí.");
        updateMap(nextSessions);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Không thể tải vị trí giao hàng.");
      }
    };
    const initialise = async () => {
      if (!containerRef.current) return;
      maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || fallbackStyle,
        center: [106.660172, 10.762622],
        zoom: 11,
        attributionControl: true
      });
      mapRef.current = map;
      map.on("error", () => {
        if (!cancelled) setMapError("Không thể tải nền bản đồ. Kiểm tra kết nối mạng rồi thử lại.");
      });
      map.on("load", () => {
        map.addSource("delivery-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "delivery-route", type: "line", source: "delivery-route", paint: { "line-color": "#16804b", "line-width": 5, "line-opacity": 0.82 } });
        map.addSource("delivery-markers", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "delivery-markers", type: "circle", source: "delivery-markers", paint: { "circle-radius": 9, "circle-color": "#e4582e", "circle-stroke-width": 3, "circle-stroke-color": "#ffffff" } });
        map.resize();
        setMapReady(true);
        void load();
      });
      timer = setInterval(() => void load(), 10_000);
    };
    void initialise();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      mapRef.current?.remove();
      mapRef.current = undefined;
    };
  }, [endpoint, refreshToken]);

  async function manageShare(session: Session) {
    const action = session.shareActive ? "revoke" : "create";
    setShareMessage("Đang cập nhật liên kết theo dõi...");
    try {
      const response = await fetch("/api/tracking/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action, sessionId: session.id })
      });
      const payload = await response.json() as { ok?: boolean; publicUrl?: string; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Không thể cập nhật liên kết.");
      if (payload.publicUrl) {
        await navigator.clipboard?.writeText(payload.publicUrl).catch(() => undefined);
        setShareMessage("Đã tạo và sao chép liên kết theo dõi cho khách hàng.");
      } else {
        setShareMessage("Đã thu hồi liên kết theo dõi công khai.");
      }
      setRefreshToken((value) => value + 1);
    } catch (error) {
      setShareMessage(error instanceof Error ? error.message : "Không thể cập nhật liên kết theo dõi.");
    }
  }

  return (
    <section className={styles.shell} aria-label="Bản đồ theo dõi giao hàng">
      <div ref={containerRef} className={styles.map} />
      {!mapReady ? <p className={styles.mapState} role="status">Đang mở bản đồ...</p> : null}
      {mapError ? <p className={styles.mapStateError} role="alert">{mapError}</p> : null}
      {mapReady && trackingLoaded && !mapError && sessions.length === 0 ? <div className={styles.emptyMapState} role="status"><strong>Chưa có vị trí trực tiếp</strong><span>Tài xế sẽ xuất hiện ở đây sau khi chuyến chuyển sang “Đang giao” và họ chủ động bật chia sẻ GPS.</span></div> : null}
      <div className={styles.overlay}>
        <strong>{mode === "customer" ? "Chuyến giao của bạn" : "Chuyến giao đang hoạt động"}</strong>
        <span aria-live="polite">{message}</span>
        {updatedAt ? <small>Cập nhật lúc {new Date(updatedAt).toLocaleTimeString("vi-VN")}</small> : null}
      </div>
      {sessions.length ? <ul className={styles.list}>{sessions.map((session) => <li key={session.id}><b>{session.documentNo}</b><span>{session.driverLabel} · {session.status}</span>{enableShare ? <button type="button" onClick={() => void manageShare(session)}>{session.shareActive ? "Thu hồi link khách" : "Tạo link khách"}</button> : null}</li>)}</ul> : null}
      {shareMessage ? <p className={styles.shareMessage} aria-live="polite">{shareMessage}</p> : null}
    </section>
  );
}
