import type { MobileSession } from "./session";
import { resolveMobileApiPath } from "./api-url";
import { handleMobileUnauthorizedResponse } from "./mobile-auth-boundary";
import { requireMobileNetworkForMutation } from "./mobile-network";

export class NativeErpApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "NativeErpApiError";
  }
}

export function createNativeIdempotencyKey(scope: string) {
  const random = Math.random().toString(36).slice(2, 12);
  return `${scope}-${Date.now()}-${random}`;
}

export async function nativeErpGet<T>(session: MobileSession, path: string): Promise<T> {
  return request<T>(session, path, { method: "GET" });
}

export async function nativeErpPost<T>(session: MobileSession, path: string, body: Record<string, unknown>): Promise<T> {
  return request<T>(session, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function nativeErpUpload<T>(session: MobileSession, path: string, formData: FormData): Promise<T> {
  return request<T>(session, path, { method: "POST", body: formData });
}

async function request<T>(session: MobileSession, path: string, init: RequestInit): Promise<T> {
  const isMutation = (init.method ?? "GET").toUpperCase() !== "GET";
  if (isMutation) await requireMobileNetworkForMutation();

  let response: Response;
  try {
    response = await fetch(resolveMobileApiPath(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json",
        ...(init.headers ?? {})
      }
    });
  } catch {
    throw new NativeErpApiError("Không thể kết nối máy chủ. Kiểm tra mạng rồi thử lại.");
  }

  const raw = await response.text();
  let payload: { ok?: boolean; error?: string } & T;
  try {
    payload = raw ? JSON.parse(raw) as { ok?: boolean; error?: string } & T : {} as { ok?: boolean; error?: string } & T;
  } catch {
    throw new NativeErpApiError("Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.", response.status);
  }
  if (!response.ok || payload.ok === false) {
    if (response.status === 401) await handleMobileUnauthorizedResponse();
    throw new NativeErpApiError(payload.error || "Không thể thực hiện thao tác.", response.status);
  }
  return payload;
}