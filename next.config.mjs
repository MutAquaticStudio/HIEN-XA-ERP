const production = process.env.NODE_ENV === "production";
const enforceHttps = production && process.env.ERP_ALLOW_INSECURE_LOCAL_HTTP !== "true";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self' data:",
  `connect-src 'self' https://tile.openstreetmap.org${production ? "" : " ws: wss:"}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(enforceHttps ? ["upgrade-insecure-requests"] : [])
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // GPS is required for an assigned delivery only. Browser permission and the
  // server-side tracking authorization remain mandatory; this simply avoids
  // disabling the PWA capability at the response-header layer.
  { key: "Permissions-Policy", value: "camera=(), geolocation=(self), microphone=(), payment=(), usb=()" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(enforceHttps
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : [])
];

const privatePageHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" }
];

const serverActionAllowedOrigins = process.env.NODE_ENV === "production"
  ? (process.env.ERP_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : ["localhost:3000", "127.0.0.1:3000"];

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  serverExternalPackages: ["read-excel-file", "unzipper"],
  experimental: {
    serverActions: {
      bodySizeLimit: "40mb",
      allowedOrigins: serverActionAllowedOrigins
    }
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/", headers: privatePageHeaders },
      { source: "/admin/:path*", headers: privatePageHeaders },
      { source: "/login", headers: privatePageHeaders },
      { source: "/invite/:path*", headers: privatePageHeaders }
      ,{ source: "/track/:token*", headers: [...privatePageHeaders, { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }
      ,{ source: "/khach-hang/:path*", headers: privatePageHeaders }
      ,{ source: "/giao-hang/:path*", headers: privatePageHeaders }
    ];
  }
};

export default nextConfig;
