import { randomBytes } from "node:crypto";
import { signValue, signaturesMatch } from "./crypto";

export const identitySessionCookieName = "vlxd_session";
export const identitySessionCookieNameSecure = "__Host-vlxd_session";
export const identitySessionLifetimeSeconds = 8 * 60 * 60;
export const mobileWebBridgeLifetimeSeconds = 90;

export type IdentitySessionPayload = {
  sub: string;
  iat: number;
  exp: number;
  ver: number;
  sid: string;
};

type MobileWebBridgePayload = {
  sub: string;
  iat: number;
  exp: number;
  ver: number;
  aud: "mobile_web_bridge";
};

const maximumTokenLength = 1_024;
const maximumClockSkewSeconds = 60;

export function createIdentitySessionToken(
  user: { id: string; sessionVersion: number },
  secret: string,
  now = Date.now()
) {
  const issuedAt = Math.floor(now / 1_000);
  const payload: IdentitySessionPayload = {
    sub: user.id,
    iat: issuedAt,
    exp: issuedAt + identitySessionLifetimeSeconds,
    ver: user.sessionVersion,
    sid: randomBytes(16).toString("base64url")
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signValue(encodedPayload, secret)}`;
}

export function verifyIdentitySessionToken(
  token: string,
  secret: string,
  now = Date.now()
): IdentitySessionPayload | undefined {
  if (!token || token.length > maximumTokenLength) {
    return undefined;
  }
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra || !signaturesMatch(signature, signValue(encodedPayload, secret))) {
    return undefined;
  }

  try {
    if (encodedPayload.length > 768 || signature.length !== 43) {
      return undefined;
    }
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<IdentitySessionPayload>;
    const nowSeconds = Math.floor(now / 1_000);
    if (
      typeof payload.sub !== "string"
      || !payload.sub
      || typeof payload.sid !== "string"
      || !/^[A-Za-z0-9_-]{22}$/.test(payload.sid)
      || !Number.isInteger(payload.iat)
      || !Number.isInteger(payload.exp)
      || !Number.isInteger(payload.ver)
      || (payload.iat as number) > nowSeconds + maximumClockSkewSeconds
      || (payload.exp as number) <= nowSeconds
      || (payload.exp as number) - (payload.iat as number) !== identitySessionLifetimeSeconds
      || (payload.ver as number) < 1
    ) {
      return undefined;
    }
    return payload as IdentitySessionPayload;
  } catch {
    return undefined;
  }
}

export function createMobileWebBridgeToken(
  user: { id: string; sessionVersion: number },
  secret: string,
  now = Date.now()
) {
  const issuedAt = Math.floor(now / 1_000);
  const payload: MobileWebBridgePayload = {
    sub: user.id,
    iat: issuedAt,
    exp: issuedAt + mobileWebBridgeLifetimeSeconds,
    ver: user.sessionVersion,
    aud: "mobile_web_bridge"
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signValue(encodedPayload, secret)}`;
}

export function verifyMobileWebBridgeToken(
  token: string,
  secret: string,
  now = Date.now()
): Pick<MobileWebBridgePayload, "sub" | "ver"> | undefined {
  if (!token || token.length > maximumTokenLength) {
    return undefined;
  }
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra || !signaturesMatch(signature, signValue(encodedPayload, secret))) {
    return undefined;
  }

  try {
    if (encodedPayload.length > 768 || signature.length !== 43) {
      return undefined;
    }
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<MobileWebBridgePayload>;
    const nowSeconds = Math.floor(now / 1_000);
    if (
      payload.aud !== "mobile_web_bridge"
      || typeof payload.sub !== "string"
      || !payload.sub
      || !Number.isInteger(payload.iat)
      || !Number.isInteger(payload.exp)
      || !Number.isInteger(payload.ver)
      || (payload.iat as number) > nowSeconds + maximumClockSkewSeconds
      || (payload.exp as number) <= nowSeconds
      || (payload.exp as number) - (payload.iat as number) !== mobileWebBridgeLifetimeSeconds
      || (payload.ver as number) < 1
    ) {
      return undefined;
    }
    return { sub: payload.sub, ver: payload.ver as number };
  } catch {
    return undefined;
  }
}
