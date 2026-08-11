import { NextResponse, type NextRequest } from "next/server";

export const runtime = "edge";

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
    || pathname.startsWith("/track");
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Permissions-Policy", "camera=(), geolocation=(self), microphone=(), payment=(), usb=()");

  if (request.nextUrl.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  }

  if (isPrivatePage(request.nextUrl.pathname)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
