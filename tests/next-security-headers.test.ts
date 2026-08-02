import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("PWA security headers", () => {
  it("keeps sensitive browser capabilities denied while allowing consent-gated same-origin GPS", async () => {
    const config = await readFile("next.config.mjs", "utf8");

    expect(config).toContain('"Permissions-Policy", value: "camera=(), geolocation=(self), microphone=(), payment=(), usb=()"');
    expect(config).not.toContain("geolocation=()");
    expect(config).toContain("https://tile.openstreetmap.org");
    expect(config).toContain('"X-Robots-Tag", value: "noindex, nofollow, noarchive"');
  });
});
