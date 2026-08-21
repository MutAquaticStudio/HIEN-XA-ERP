import { resolveMobileApiPath, resolveMobileApiUrl } from "../lib/api-url";

describe("mobile API URL boundary", () => {
  it("requires HTTPS for release builds", () => {
    expect(resolveMobileApiUrl({ configuredUrl: "https://vlxd.example.vn/", isDevelopment: false })).toBe("https://vlxd.example.vn");
    expect(() => resolveMobileApiUrl({ configuredUrl: "http://10.0.2.2:3000", isDevelopment: false })).toThrow(/HTTPS/);
  });

  it("allows explicit emulator and localhost URLs only in development", () => {
    expect(resolveMobileApiUrl({ configuredUrl: "http://10.0.2.2:3000", isDevelopment: true })).toBe("http://10.0.2.2:3000");
    expect(resolveMobileApiUrl({ configuredUrl: "http://localhost:3000", isDevelopment: true })).toBe("http://localhost:3000");
    expect(() => resolveMobileApiUrl({ configuredUrl: "http://192.168.1.10:3000", isDevelopment: true })).toThrow(/HTTPS/);
  });

  it("keeps API routes relative to the configured ERP origin", () => {
    expect(resolveMobileApiPath("/api/mobile/tracking", { configuredUrl: "https://vlxd.example.vn", isDevelopment: false })).toBe("https://vlxd.example.vn/api/mobile/tracking");
    expect(() => resolveMobileApiPath("https://other.example", { configuredUrl: "https://vlxd.example.vn", isDevelopment: false })).toThrow(/Đường dẫn/);
  });
});
