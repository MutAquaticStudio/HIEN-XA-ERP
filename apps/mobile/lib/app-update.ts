export type MobileUpdateStatus = "current" | "optional" | "required";

function versionParts(version: string) {
  return version.replace(/^v/i, "").split(".").map((part) => {
    const value = Number(part);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  });
}

export function compareMobileVersions(left: string, right: string) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function mobileUpdateStatus(currentVersion: string, latestVersion?: string, minimumSupportedVersion?: string): MobileUpdateStatus {
  if (!latestVersion) return "current";
  if (minimumSupportedVersion && compareMobileVersions(currentVersion, minimumSupportedVersion) < 0) return "required";
  return compareMobileVersions(currentVersion, latestVersion) < 0 ? "optional" : "current";
}
