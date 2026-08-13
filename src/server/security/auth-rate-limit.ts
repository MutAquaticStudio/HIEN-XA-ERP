import { IdentityPublicError } from "@/server/identity/errors";
import { getRuntimeEnvironmentVariable } from "@/server/infrastructure/cloudflare-bindings";

type RateLimitBucket = {
  attempts: number;
  windowStartedAt: number;
  blockedUntil?: number;
};

type RateLimitPolicy = {
  maximumAttempts: number;
  windowMs: number;
  blockMs: number;
};

const identifierPolicy: RateLimitPolicy = {
  maximumAttempts: 10,
  windowMs: 15 * 60 * 1_000,
  blockMs: 15 * 60 * 1_000
};
const clientPolicy: RateLimitPolicy = {
  maximumAttempts: 50,
  windowMs: 15 * 60 * 1_000,
  blockMs: 15 * 60 * 1_000
};
const maximumTrackedBuckets = 5_000;
const throttledMessage = "Không thể đăng nhập lúc này. Vui lòng chờ ít phút rồi thử lại.";

export class AuthenticationRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(private readonly now: () => number = Date.now) {}

  assertAllowed(identifier: string, clientAddress?: string) {
    const now = this.now();
    this.prune(now);
    for (const key of rateLimitKeys(identifier, clientAddress)) {
      const bucket = this.buckets.get(key.value);
      if (bucket?.blockedUntil && bucket.blockedUntil > now) {
        throw new IdentityPublicError(throttledMessage);
      }
    }
  }

  recordFailure(identifier: string, clientAddress?: string) {
    const now = this.now();
    for (const key of rateLimitKeys(identifier, clientAddress)) {
      const current = this.buckets.get(key.value);
      const bucket = !current || now - current.windowStartedAt >= key.policy.windowMs
        ? { attempts: 0, windowStartedAt: now }
        : current;
      bucket.attempts += 1;
      if (bucket.attempts >= key.policy.maximumAttempts) {
        bucket.blockedUntil = now + key.policy.blockMs;
        bucket.attempts = 0;
        bucket.windowStartedAt = now;
      }
      this.buckets.set(key.value, bucket);
    }
    this.prune(now);
  }

  recordSuccess(identifier: string, clientAddress?: string) {
    this.buckets.delete(identifierKey(identifier));
    if (clientAddress) {
      this.buckets.delete(`client:${clientAddress}`);
    }
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) {
      const policy = key.startsWith("client:") ? clientPolicy : identifierPolicy;
      const expired = (!bucket.blockedUntil || bucket.blockedUntil <= now)
        && now - bucket.windowStartedAt >= policy.windowMs;
      if (expired) {
        this.buckets.delete(key);
      }
    }
    while (this.buckets.size > maximumTrackedBuckets) {
      const oldestKey = this.buckets.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.buckets.delete(oldestKey);
    }
  }
}

export function getTrustedClientAddress(requestHeaders: Pick<Headers, "get">) {
  if (getRuntimeEnvironmentVariable("ERP_TRUST_PROXY_HEADERS") !== "true") {
    return undefined;
  }
  const candidate = requestHeaders.get("cf-connecting-ip")
    || requestHeaders.get("x-real-ip")
    || requestHeaders.get("x-forwarded-for")?.split(",")[0]
    || "";
  const normalized = candidate.trim();
  return /^[0-9a-f:.]{3,64}$/i.test(normalized) ? normalized : undefined;
}

function rateLimitKeys(identifier: string, clientAddress?: string) {
  const keys = [{ value: identifierKey(identifier), policy: identifierPolicy }];
  if (clientAddress) {
    keys.push({ value: `client:${clientAddress}`, policy: clientPolicy });
  }
  return keys;
}

function identifierKey(identifier: string) {
  return `identifier:${identifier.trim().toLocaleLowerCase("vi-VN").slice(0, 254)}`;
}

const securityGlobal = globalThis as typeof globalThis & {
  vlxdAuthenticationRateLimiter?: AuthenticationRateLimiter;
};

export const authenticationRateLimiter = securityGlobal.vlxdAuthenticationRateLimiter
  ?? new AuthenticationRateLimiter();

if (process.env.NODE_ENV !== "production") {
  securityGlobal.vlxdAuthenticationRateLimiter = authenticationRateLimiter;
}
