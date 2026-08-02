import { resolveMobileApiPath } from "./api-url";

type NativePushResponse = {
  ok: boolean;
  error?: string;
  subscription?: { id: string; channel: "expo" };
  removed?: boolean;
};

export class NativePushApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "NativePushApiError";
  }
}

async function requestNativePush(accessToken: string, method: "POST" | "DELETE", endpoint: string) {
  let response: Response;
  try {
    response = await fetch(resolveMobileApiPath("/api/mobile/notifications/subscription"), {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ channel: "expo", endpoint })
    });
  } catch {
    throw new NativePushApiError("Không thể cập nhật thông báo khi chưa có mạng.");
  }
  const payload = await response.json().catch(() => undefined) as NativePushResponse | undefined;
  if (!response.ok || !payload?.ok) {
    throw new NativePushApiError(payload?.error || "Không thể cập nhật đăng ký thông báo trên thiết bị này.", response.status);
  }
  return payload;
}

export async function registerNativePushSubscription(accessToken: string, endpoint: string) {
  return requestNativePush(accessToken, "POST", endpoint);
}

export async function removeNativePushSubscription(accessToken: string, endpoint: string) {
  return requestNativePush(accessToken, "DELETE", endpoint);
}