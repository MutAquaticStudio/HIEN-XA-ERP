const localDevelopmentHosts = new Set(["localhost", "127.0.0.1", "10.0.2.2"]);

export function resolveMobileApiUrl(input: {
  configuredUrl?: string;
  isDevelopment?: boolean;
} = {}) {
  const configuredUrl = input.configuredUrl ?? process.env.EXPO_PUBLIC_ERP_URL;
  const isDevelopment = input.isDevelopment ?? (typeof __DEV__ !== "undefined" && __DEV__ === true);
  if (!configuredUrl?.trim()) {
    throw new Error("Chưa cấu hình EXPO_PUBLIC_ERP_URL cho ứng dụng mobile.");
  }

  let url: URL;
  try {
    url = new URL(configuredUrl.trim());
  } catch {
    throw new Error("EXPO_PUBLIC_ERP_URL không phải địa chỉ máy chủ hợp lệ.");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("EXPO_PUBLIC_ERP_URL không được chứa tài khoản, tham số hoặc mã bí mật.");
  }
  if (url.protocol === "https:") return url.toString().replace(/\/$/, "");
  if (isDevelopment && url.protocol === "http:" && localDevelopmentHosts.has(url.hostname)) {
    return url.toString().replace(/\/$/, "");
  }
  throw new Error("Bản phát hành chỉ kết nối máy chủ HTTPS. Địa chỉ nội bộ chỉ dùng khi chạy debug.");
}

export function resolveMobileApiPath(path: string, options?: Parameters<typeof resolveMobileApiUrl>[0]) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("Đường dẫn API mobile không hợp lệ.");
  }
  return `${resolveMobileApiUrl(options)}${path}`;
}
