import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const versionPattern = /^\d+\.\d+\.\d+$/;
const mojibakePattern = /(?:\u00c3|\u00c2|\u00e1\u00ba|\u00e1\u00bb|\u00e1\u00b8|\u00c4)/;

function configuredVersion(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && versionPattern.test(normalized) ? normalized : undefined;
}

function configuredDownloadUrl(value: string | undefined) {
  try {
    const url = new URL(value?.trim() ?? "");
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function configuredReleaseNotes(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  const utf8 = mojibakePattern.test(normalized)
    ? Buffer.from(normalized, "latin1").toString("utf8")
    : normalized;

  return utf8.slice(0, 800);
}

export async function GET() {
  const latestVersion = configuredVersion(process.env.MOBILE_LATEST_VERSION);
  const response = NextResponse.json(latestVersion ? {
    ok: true,
    enabled: true,
    latestVersion,
    minimumSupportedVersion: configuredVersion(process.env.MOBILE_MINIMUM_SUPPORTED_VERSION) ?? latestVersion,
    downloadUrl: configuredDownloadUrl(process.env.MOBILE_ANDROID_DOWNLOAD_URL),
    notes: configuredReleaseNotes(process.env.MOBILE_RELEASE_NOTES)
  } : { ok: true, enabled: false });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
