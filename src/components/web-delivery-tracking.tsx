"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./web-delivery-tracking.module.css";

type Job = { id: string; documentNo: string; status: string; plannedDate: string; trackingEligible: boolean };
type Session = { id: string; deliveryJobId: string; status: string };
type QueuedPoint = { sessionId: string; clientPointId: string; recordedAt: string; latitude: number; longitude: number; accuracyMeters?: number; headingDegrees?: number; speedMetersPerSecond?: number };

export function WebDeliveryTracking() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeSession, setActiveSession] = useState<Session | undefined>(undefined);
  const [message, setMessage] = useState<string>("Đang tải chuyến được phân công...");
  const [pending, setPending] = useState(false);
  const watchId = useRef<number | undefined>(undefined);
  const latestReceivedAt = useRef<number | undefined>(undefined);
  const flushing = useRef(false);

  const loadOverview = useCallback(async () => {
    const response = await fetch("/api/tracking/web", { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json() as { ok?: boolean; jobs?: Job[]; sessions?: Session[]; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Không thể tải chuyến giao.");
    setJobs(payload.jobs ?? []);
    setActiveSession((payload.sessions ?? []).find((session) => session.status === "active"));
  }, []);

  const flushQueue = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const point of await listQueuedPoints()) {
        const response = await fetch("/api/tracking/web/points", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(point) });
        if (!response.ok) break;
        await removeQueuedPoint(point.clientPointId);
      }
    } finally {
      flushing.current = false;
    }
  }, []);

  useEffect(() => {
    void loadOverview().then(() => setMessage("Chọn chuyến đang đi đường để bắt đầu chia sẻ vị trí.")).catch((error) => setMessage(error instanceof Error ? error.message : "Không thể tải chuyến giao."));
    const signalTimer = window.setInterval(() => {
      if (activeSession && latestReceivedAt.current && Date.now() - latestReceivedAt.current > 3 * 60 * 1_000) setMessage("Mất tín hiệu GPS quá 3 phút. Kiểm tra quyền vị trí, mạng và giữ trang này mở.");
    }, 15_000);
    return () => window.clearInterval(signalTimer);
  }, [activeSession, loadOverview]);

  useEffect(() => () => {
    if (watchId.current !== undefined) navigator.geolocation.clearWatch(watchId.current);
  }, []);

  async function begin(job: Job) {
    if (!navigator.geolocation) {
      setMessage("Trình duyệt này không hỗ trợ GPS. Hãy mở bằng Chrome hoặc Safari trên điện thoại.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/tracking/web", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "start", deliveryJobId: job.id }) });
      const payload = await response.json() as { ok?: boolean; session?: Session; error?: string };
      if (!response.ok || !payload.ok || !payload.session) throw new Error(payload.error ?? "Không thể bắt đầu theo dõi.");
      setActiveSession(payload.session);
      setMessage("Đang chia sẻ vị trí. Hãy giữ trang này mở trong suốt chuyến giao.");
      watchId.current = navigator.geolocation.watchPosition(
        (position) => void queueAndSend({
          sessionId: payload.session!.id,
          clientPointId: crypto.randomUUID(),
          recordedAt: new Date(position.timestamp).toISOString(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? undefined,
          headingDegrees: position.coords.heading ?? undefined,
          speedMetersPerSecond: position.coords.speed ?? undefined
        }),
        (error) => setMessage(error.code === error.PERMISSION_DENIED ? "Bạn đã từ chối quyền vị trí. Hãy bật quyền GPS rồi thử lại." : "Không lấy được vị trí. Kiểm tra GPS và mạng."),
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 }
      );
      await flushQueue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể bắt đầu theo dõi.");
    } finally {
      setPending(false);
    }
  }

  async function queueAndSend(point: QueuedPoint) {
    latestReceivedAt.current = Date.now();
    await queuePoint(point);
    await flushQueue();
  }

  async function stop() {
    if (!activeSession) return;
    setPending(true);
    try {
      if (watchId.current !== undefined) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = undefined;
      const response = await fetch("/api/tracking/web", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "stop", sessionId: activeSession.id }) });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Không thể dừng theo dõi.");
      await removeQueuedSession(activeSession.id);
      setActiveSession(undefined);
      setMessage("Đã dừng chia sẻ vị trí và thu hồi link khách hàng nếu đang có.");
      await loadOverview();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể dừng theo dõi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.kicker}>Giao hàng trên web</p>
        <h1>Chia sẻ vị trí chuyến giao</h1>
        <p className={styles.copy}>Chỉ bật khi xe đang giao hàng. Trình duyệt web không theo dõi được khi bạn đóng tab hoặc hệ điều hành tắt trang.</p>
        <p className={styles.status} aria-live="polite">{message}</p>
        <section className={styles.privacy}>
          <strong>Quyền riêng tư</strong>
          <span>Vị trí chỉ gửi cho chuyến được phân công. Khách chỉ xem vị trí gần đúng; link công khai chỉ do điều phối hoặc chủ cửa hàng tạo.</span>
        </section>
        <div className={styles.list}>
          {jobs.map((job) => {
            const active = activeSession?.deliveryJobId === job.id;
            const disabled = pending || (!active && !job.trackingEligible) || Boolean(activeSession && !active);
            return <article key={job.id} className={styles.job}><div><strong>{job.documentNo}</strong><span>Ngày giao: {job.plannedDate} · Trạng thái: {job.status}</span></div><button type="button" disabled={disabled} onClick={() => void (active ? stop() : begin(job))}>{pending ? "Đang xử lý" : active ? "Dừng chia sẻ vị trí" : job.trackingEligible ? "Bắt đầu chia sẻ vị trí" : "Chờ xuất bến"}</button></article>;
          })}
          {!jobs.length ? <p className={styles.empty}>Bạn chưa có chuyến giao được phân công.</p> : null}
        </div>
      </section>
    </main>
  );
}

const databaseName = "vlxd-web-tracking";
const storeName = "points";

async function openQueue() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "clientPointId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queuePoint(point: QueuedPoint) {
  const database = await openQueue();
  await transaction(database, "readwrite", (store) => store.put(point));
  database.close();
}

async function listQueuedPoints() {
  const database = await openQueue();
  const points = await new Promise<QueuedPoint[]>((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as QueuedPoint[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return points.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
}

async function removeQueuedPoint(clientPointId: string) {
  const database = await openQueue();
  await transaction(database, "readwrite", (store) => store.delete(clientPointId));
  database.close();
}

async function removeQueuedSession(sessionId: string) {
  for (const point of await listQueuedPoints()) if (point.sessionId === sessionId) await removeQueuedPoint(point.clientPointId);
}

async function transaction(database: IDBDatabase, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest) {
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
