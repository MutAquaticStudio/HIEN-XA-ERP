import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/mobile/release/route";

afterEach(() => vi.unstubAllEnvs());

describe("mobile release manifest", () => {
  it("stays disabled until a release version is configured", async () => {
    vi.stubEnv("MOBILE_LATEST_VERSION", "");
    const response = await GET();

    expect(await response.json()).toEqual({ ok: true, enabled: false });
  });

  it("exposes only validated public release metadata", async () => {
    vi.stubEnv("MOBILE_LATEST_VERSION", "1.0.1");
    vi.stubEnv("MOBILE_MINIMUM_SUPPORTED_VERSION", "1.0.0");
    vi.stubEnv("MOBILE_ANDROID_DOWNLOAD_URL", "https://downloads.example.test/vlxd-1.0.1.apk");
    vi.stubEnv("MOBILE_RELEASE_NOTES", "Bổ sung bản đồ hành trình cho thợ.");

    const response = await GET();

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: true,
      enabled: true,
      latestVersion: "1.0.1",
      minimumSupportedVersion: "1.0.0",
      downloadUrl: "https://downloads.example.test/vlxd-1.0.1.apk",
      notes: "Bổ sung bản đồ hành trình cho thợ."
    });
  });
});
