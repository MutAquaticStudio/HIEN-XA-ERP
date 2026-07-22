"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./delivery-tracking-map.module.css";

type Point = { latitude: number; longitude: number; recordedAt: string; accuracyMeters?: number };
type Session = {
  id: string;
  documentNo: string;
  status: string;
  driverLabel: string;
  latestPoint?: Point;
  points: Point[];
};
type TrackingResponse = { ok: boolean; sessions?: Session[]; session?: Session; documentNo?: string; updatedAt?: string; error?: string };

const fallbackStyle = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
};

export function DeliveryTrackingMap({ endpoint, mode }: { endpoint: string; mode: "admin" | "customer" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(undefined);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [message, setMessage] = useState("Đang tải vị trí giao hàng...");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const payload = await response.json() as TrackingResponse;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Không thể tải vị trí giao hàng.");
        }
        const nextSessions = payload.sessions ?? (payload.session ? [payload.session] : []);
        if (cancelled) return;
        setSessions(nextSessions);
        setUpdatedAt(payload.updatedAt);
        setMessage(nextSessions.length ? "Vị trí được cập nhật tự động mỗi 10 giây." : "Chưa có chuyến nào đang chia sẻ vị trí.");
        updateMap(nextSessions);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Không thể tải vị trí giao hàng.");
      }
    };
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
        map.fitBounds(coordinates.reduce((bounds: any, coordinate: [number, number]) => bounds.extend(coordinate), new maplibregl.LngLatBounds(coordinates[0], coordinates[0])), { padding: 56, maxZoom: 15, duration: 700 });
      }
    };
    let maplibregl: any;
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
      map.on("load", () => {
        map.addSource("delivery-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "delivery-route", type: "line", source: "delivery-route", paint: { "line-color": "#16804b", "line-width": 5, "line-opacity": 0.82 } });
        map.addSource("delivery-markers", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "delivery-markers", type: "circle", source: "delivery-markers", paint: { "circle-radius": 9, "circle-color": "#e4582e", "circle-stroke-width": 3, "circle-stroke-color": "#ffffff" } });
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
  }, [endpoint]);

  return (
    <section className={styles.shell} aria-label="Bản đồ theo dõi giao hàng">
      <div ref={containerRef} className={styles.map} />
      <div className={styles.overlay}>
        <strong>{mode === "customer" ? "Chuyến giao của bạn" : "Chuyến giao đang hoạt động"}</strong>
        <span>{message}</span>
        {updatedAt ? <small>Cập nhật lúc {new Date(updatedAt).toLocaleTimeString("vi-VN")}</small> : null}
      </div>
      {sessions.length ? <ul className={styles.list}>{sessions.map((session) => <li key={session.id}><b>{session.documentNo}</b><span>{session.driverLabel} · {session.status}</span></li>)}</ul> : null}
    </section>
  );
}
