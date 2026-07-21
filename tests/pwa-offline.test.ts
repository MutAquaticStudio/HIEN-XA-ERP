import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const serviceWorker = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const manifestSource = readFileSync(join(process.cwd(), "src", "app", "manifest.ts"), "utf8");

describe("PWA offline-read foundation", () => {
  it("caches only public static assets and never personalized ERP HTML", () => {
    expect(serviceWorker).toContain('const APP_SHELL_URLS = ["/icon.svg", "/manifest.webmanifest"]');
    expect(serviceWorker).toContain("event.respondWith(fetch(request))");
    expect(serviceWorker).not.toContain('APP_SHELL_URLS = ["/"');
    expect(serviceWorker).toContain("staleWhileRevalidate(request)");
  });

  it("does not queue or replay non-GET financial mutations offline", () => {
    expect(serviceWorker).toContain('if (request.method !== "GET")');
    expect(serviceWorker).toContain("return;");
    expect(serviceWorker).not.toContain('addEventListener("sync"');
    expect(serviceWorker).not.toContain("addEventListener('sync'");
    expect(serviceWorker).not.toContain("postMessage");
  });

  it("declares an installable ERP manifest", () => {
    expect(manifestSource).toContain('name: "VLXD Hien Xa ERP"');
    expect(manifestSource).toContain('display: "standalone"');
    expect(manifestSource).toContain('start_url: "/"');
  });
});
