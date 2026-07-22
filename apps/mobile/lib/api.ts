import type { MobileSession } from "./session";

const apiUrl = process.env.EXPO_PUBLIC_ERP_URL?.replace(/\/$/, "");

function requireApiUrl() {
  if (!apiUrl) throw new Error("Chưa cấu hình EXPO_PUBLIC_ERP_URL cho ứng dụng mobile.");
  return apiUrl;
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${requireApiUrl()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers }
  });
  const payload = await response.json() as { ok?: boolean; error?: string } & T;
  if (!response.ok || payload.ok === false) throw new Error(payload.error ?? "Yêu cầu không thành công.");
  return payload;
}

export async function login(identifier: string, password: string): Promise<MobileSession> {
  const payload = await request<MobileSession>("/api/mobile/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) });
  return { accessToken: payload.accessToken, user: payload.user };
}

export async function createWebBridge(accessToken: string, next: "/" | "/delivery-tracking") {
  return (await request<{ url: string }>("/api/mobile/bridge", { method: "POST", body: JSON.stringify({ next }) }, accessToken)).url;
}

export async function getTrackingOverview(accessToken: string) {
  return request<{ canManage: boolean; jobs: Array<{ id: string; documentNo: string; status: string; plannedDate: string; trackingEligible: boolean }>; sessions: Array<{ id: string; deliveryJobId: string; status: string }> }>("/api/mobile/tracking", {}, accessToken);
}

export async function startTrackingSession(accessToken: string, deliveryJobId: string) {
  return request<{ session: { id: string }; publicUrl?: string }>("/api/mobile/tracking", { method: "POST", body: JSON.stringify({ action: "start", deliveryJobId }) }, accessToken);
}

export async function stopTrackingSession(accessToken: string, sessionId: string) {
  return request<{ session: { id: string } }>("/api/mobile/tracking", { method: "POST", body: JSON.stringify({ action: "stop", sessionId }) }, accessToken);
}

export async function sendTrackingPoint(accessToken: string, body: Record<string, unknown>) {
  return request("/api/mobile/tracking/points", { method: "POST", body: JSON.stringify(body) }, accessToken);
}
