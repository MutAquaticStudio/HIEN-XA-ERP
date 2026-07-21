import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  AuthenticationRateLimiter,
  getTrustedClientAddress
} from "../src/server/security/auth-rate-limit";
import { BoundedReplayStore } from "../src/server/application/idempotency";

describe("authentication rate limiting", () => {
  it("blocks an identifier after ten failures and releases it after the block", () => {
    let now = 1_000;
    const limiter = new AuthenticationRateLimiter(() => now);

    for (let attempt = 0; attempt < 9; attempt += 1) {
      limiter.recordFailure("OWNER@HIENXA.TEST");
      expect(() => limiter.assertAllowed("owner@hienxa.test")).not.toThrow();
    }
    limiter.recordFailure("owner@hienxa.test");
    expect(() => limiter.assertAllowed("owner@hienxa.test")).toThrow("chờ ít phút");

    now += 16 * 60 * 1_000;
    expect(() => limiter.assertAllowed("owner@hienxa.test")).not.toThrow();
  });

  it("only trusts proxy client headers after explicit deployment configuration", () => {
    const original = process.env.ERP_TRUST_PROXY_HEADERS;
    const requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" });
    delete process.env.ERP_TRUST_PROXY_HEADERS;
    expect(getTrustedClientAddress(requestHeaders)).toBeUndefined();

    process.env.ERP_TRUST_PROXY_HEADERS = "true";
    expect(getTrustedClientAddress(requestHeaders)).toBe("203.0.113.10");

    if (original === undefined) {
      delete process.env.ERP_TRUST_PROXY_HEADERS;
    } else {
      process.env.ERP_TRUST_PROXY_HEADERS = original;
    }
  });

  it("clears both identifier and client buckets after a successful login", () => {
    let now = 1_000;
    const limiter = new AuthenticationRateLimiter(() => now);
    const headers = new Headers({ "x-real-ip": "203.0.113.12" });
    const original = process.env.ERP_TRUST_PROXY_HEADERS;
    process.env.ERP_TRUST_PROXY_HEADERS = "true";
    const address = getTrustedClientAddress(headers);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      limiter.recordFailure("worker01", address);
    }
    limiter.recordSuccess("worker01", address);
    for (let attempt = 0; attempt < 49; attempt += 1) {
      limiter.recordFailure("worker02", address);
    }
    expect(() => limiter.assertAllowed("worker01", address)).not.toThrow();

    if (original === undefined) {
      delete process.env.ERP_TRUST_PROXY_HEADERS;
    } else {
      process.env.ERP_TRUST_PROXY_HEADERS = original;
    }
  });
});

describe("production security boundaries", () => {
  it("ships browser security headers and keeps identity pages out of shared caches", async () => {
    const nextConfig = await readFile("next.config.mjs", "utf8");

    expect(nextConfig).toContain("Content-Security-Policy");
    expect(nextConfig).toContain("Strict-Transport-Security");
    expect(nextConfig).toContain("frame-ancestors 'none'");
    expect(nextConfig).toContain("private, no-store, max-age=0");
  });

  it("does not expose unexpected server errors or truncate identity audit history", async () => {
    const [authActions, adminActions, identityService, identityStore] = await Promise.all([
      readFile("src/app/auth-actions.ts", "utf8"),
      readFile("src/app/admin/actions.ts", "utf8"),
      readFile("src/server/identity/identity-service.ts", "utf8"),
      readFile("src/server/identity/file-identity-store.ts", "utf8")
    ]);

    expect(authActions).toContain("isIdentityPublicError(error) ? error.message : fallback");
    expect(adminActions).toContain("isIdentityPublicError(error) ? error.message : fallback");
    expect(await readFile("src/app/actions.ts", "utf8")).toContain("error instanceof OperationInputError ? error.message : fallback");
    expect(identityService).not.toContain("events.length = 2_000");
    expect(identityStore).not.toContain("Admin@123456");
    expect(identityStore).not.toContain("admin@hienxa.local");
  });

  it("hardens Supabase views, function execution and module-scoped RLS", async () => {
    const migration = await readFile(
      "supabase/migrations/202607180004_security_hardening.sql",
      "utf8"
    );

    expect(migration).toContain("security_invoker = true");
    expect(migration).toContain("drop policy if exists active_users_read_sales_orders");
    expect(migration).toContain("public.can_read_delivery_job");
    expect(migration).toContain("public.can_read_work_order");
    expect(migration).toContain("public.has_any_app_module");
    expect(migration).toContain("revoke execute on all functions in schema public from public, anon, authenticated");
  });

  it("bounds in-memory replay results used by the legacy sales action", () => {
    const store = new BoundedReplayStore<number>(2);
    store.set("first", 1).set("second", 2).set("third", 3);

    expect(store.size).toBe(2);
    expect(store.has("first")).toBe(false);
    expect(store.get("third")).toBe(3);
  });
});
