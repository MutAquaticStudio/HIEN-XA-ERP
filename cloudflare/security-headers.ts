const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self' https://tile.openstreetmap.org",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests"
].join("; ");

function isPrivatePage(pathname: string) {
  return pathname === "/"
    || pathname === "/login"
    || pathname.startsWith("/admin")
    || pathname.startsWith("/invite")
    || pathname.startsWith("/khach-hang")
    || pathname.startsWith("/giao-hang")
    || pathname.startsWith("/track")
    || pathname.startsWith("/api/");
}

export function applySecurityHeaders(request: Request, response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Permissions-Policy", "camera=(), geolocation=(self), microphone=(), payment=(), usb=()");

  const url = new URL(request.url);
  if (url.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }

  if (isPrivatePage(url.pathname)) {
    headers.set("Cache-Control", "private, no-store, max-age=0");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
