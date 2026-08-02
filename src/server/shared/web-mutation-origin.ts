import { PublicApiError } from "./public-api-error";

/**
 * Cookie-authenticated browser mutations must have a same-origin header.
 * Native clients authenticate exclusively with Bearer tokens and do not send
 * an Origin header, so they intentionally bypass this browser-only check.
 */
export function assertWebMutationOrigin(request: Request, message = "Yêu cầu không đúng nguồn gửi.") {
  if (/^Bearer\s+/i.test(request.headers.get("authorization") ?? "")) {
    return;
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  if (!origin || !host || new URL(origin).host !== host.split(",")[0]?.trim()) {
    throw new PublicApiError(400, message);
  }
}
