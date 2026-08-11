import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applySecurityHeaders } from "../cloudflare/security-headers";

const source = readFileSync(join(process.cwd(), "next.config.mjs"), "utf8");

describe("production security headers", () => {
  it("uses host-safe HSTS without preload or includeSubDomains", () => {
    expect(source).toContain('"Strict-Transport-Security", value: "max-age=31536000"');
    expect(source).not.toContain("includeSubDomains");
    expect(source).not.toContain("preload");
  });

  it("keeps CSP, nosniff, no-referrer and private no-store policies", () => {
    expect(source).toContain("Content-Security-Policy");
    expect(source).toContain('"X-Content-Type-Options", value: "nosniff"');
    expect(source).toContain('"Referrer-Policy", value: "no-referrer"');
    expect(source).toContain('"Cache-Control", value: "private, no-store, max-age=0"');
  });

  it("applies the Worker contract without buffering a private response stream", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("worker-stream"));
        controller.close();
      }
    });
    const output = applySecurityHeaders(
      new Request("https://uat.hienxavlxd.com/login"),
      new Response(stream, { headers: { "Cache-Control": "public, max-age=60" } })
    );

    expect(output.headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
    expect(output.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(output.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(output.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(output.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    await expect(output.text()).resolves.toBe("worker-stream");
  });

  it("does not apply private caching to cacheable public assets", () => {
    const output = applySecurityHeaders(
      new Request("https://uat.hienxavlxd.com/_next/static/chunks/app.js"),
      new Response("asset", { headers: { "Cache-Control": "public, max-age=31536000, immutable" } })
    );

    expect(output.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });
});
