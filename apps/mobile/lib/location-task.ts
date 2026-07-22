import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getMobileSession } from "./session";
import { sendTrackingPoint } from "./api";

export const backgroundLocationTaskName = "vlxd-background-delivery-location";
const contextKey = "vlxd.mobile.tracking.context.v1";
const queueKey = "vlxd.mobile.tracking.queue.v1";

type TrackingContext = { sessionId: string; deliveryJobId: string };
type QueuedPoint = TrackingContext & { clientPointId: string; recordedAt: string; latitude: number; longitude: number; accuracyMeters?: number; headingDegrees?: number; speedMetersPerSecond?: number };

TaskManager.defineTask(backgroundLocationTaskName, async ({ data, error }) => {
  if (error || !data) return;
  const locations = (data as { locations?: Location.LocationObject[] }).locations ?? [];
  for (const location of locations) await sendOrQueue(location);
});

export async function startBackgroundTracking(sessionId: string, deliveryJobId: string) {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") throw new Error("Cần cho phép vị trí chính xác để theo dõi chuyến giao.");
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted") throw new Error("Cần cho phép vị trí nền trong phần cài đặt để theo dõi khi bạn mở ứng dụng khác.");
  await AsyncStorage.setItem(contextKey, JSON.stringify({ sessionId, deliveryJobId } satisfies TrackingContext));
  await flushQueue();
  const started = await Location.hasStartedLocationUpdatesAsync(backgroundLocationTaskName);
  if (!started) {
    await Location.startLocationUpdatesAsync(backgroundLocationTaskName, {
      accuracy: Location.Accuracy.Highest,
      timeInterval: 15_000,
      distanceInterval: 20,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
      foregroundService: { notificationTitle: "Đang chia sẻ vị trí giao hàng", notificationBody: "Chạm để quay lại ứng dụng VLXD." }
    });
  }
}

export async function stopBackgroundTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(backgroundLocationTaskName)) {
    await Location.stopLocationUpdatesAsync(backgroundLocationTaskName);
  }
  await AsyncStorage.multiRemove([contextKey, queueKey]);
}

async function sendOrQueue(location: Location.LocationObject) {
  const context = await readContext();
  const session = await getMobileSession();
  if (!context || !session) return;
  const point: QueuedPoint = {
    ...context,
    clientPointId: `${location.timestamp}-${Math.random().toString(36).slice(2, 12)}`,
    recordedAt: new Date(location.timestamp).toISOString(),
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyMeters: location.coords.accuracy ?? undefined,
    headingDegrees: location.coords.heading ?? undefined,
    speedMetersPerSecond: location.coords.speed ?? undefined
  };
  try {
    await sendTrackingPoint(session.accessToken, point);
    await flushQueue();
  } catch {
    await enqueue(point);
  }
}

async function flushQueue() {
  const session = await getMobileSession();
  if (!session) return;
  const queue = await readQueue();
  const remaining: QueuedPoint[] = [];
  for (const point of queue) {
    try { await sendTrackingPoint(session.accessToken, point); } catch { remaining.push(point); }
  }
  await AsyncStorage.setItem(queueKey, JSON.stringify(remaining));
}

async function enqueue(point: QueuedPoint) {
  const queue = await readQueue();
  queue.push(point);
  await AsyncStorage.setItem(queueKey, JSON.stringify(queue.slice(-200)));
}

async function readContext(): Promise<TrackingContext | undefined> {
  const raw = await AsyncStorage.getItem(contextKey);
  if (!raw) return undefined;
  try { return JSON.parse(raw) as TrackingContext; } catch { return undefined; }
}

async function readQueue(): Promise<QueuedPoint[]> {
  const raw = await AsyncStorage.getItem(queueKey);
  if (!raw) return [];
  try { return JSON.parse(raw) as QueuedPoint[]; } catch { return []; }
}
