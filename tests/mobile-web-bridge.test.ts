import { describe, expect, it } from "vitest";
import {
  createMobileWebBridgeToken,
  mobileWebBridgeLifetimeSeconds,
  verifyMobileWebBridgeToken
} from "@/server/identity/session-token";

describe("mobile web bridge token", () => {
  it("accepts the short-lived token only for the matching user session version", () => {
    const secret = "a-very-long-test-secret-that-is-more-than-thirty-two-characters";
    const issuedAt = Date.UTC(2026, 6, 22, 8, 0, 0);
    const token = createMobileWebBridgeToken({ id: "user-mobile", sessionVersion: 3 }, secret, issuedAt);

    expect(verifyMobileWebBridgeToken(token, secret, issuedAt + 60_000)).toEqual({ sub: "user-mobile", ver: 3 });
    expect(verifyMobileWebBridgeToken(token, secret, issuedAt + (mobileWebBridgeLifetimeSeconds + 1) * 1_000)).toBeUndefined();
  });
});
