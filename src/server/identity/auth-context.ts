import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { operationsErpRegistry, type OperationsModuleId } from "@/modules/operations/erp-registry";
import { createRoleActor, visibleModulesForRole } from "@/modules/operations/identity";
import type { OperationsActor } from "@/modules/operations/types";
import { canManageUsers } from "./identity-service";
import { identityService } from "./runtime";
import {
  createIdentitySessionToken,
  identitySessionCookieName,
  identitySessionCookieNameSecure,
  identitySessionLifetimeSeconds,
  verifyIdentitySessionToken
} from "./session-token";
import type { SafeIdentityUser } from "./types";
import { PublicApiError } from "@/server/shared/public-api-error";
import { getRuntimeEnvironmentVariable } from "@/server/infrastructure/cloudflare-bindings";

const identityGlobal = globalThis as typeof globalThis & {
  vlxdDevelopmentSessionSecret?: string;
};

type SessionContext = {
  cookieName: string;
  secureCookie: boolean;
  allowGeneratedSecret: boolean;
};

export async function getCurrentIdentityUser() {
  const sessionContext = await getSessionContext();
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionContext.cookieName)?.value;
  if (!token) {
    return undefined;
  }

  return getIdentityUserFromSessionToken(token, sessionContext.allowGeneratedSecret);
}
export async function getIdentityUserFromBearerRequest(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) {
    return undefined;
  }
  return getIdentityUserFromSessionToken(match[1], process.env.NODE_ENV !== "production");
}

export function createMobileAccessToken(user: Pick<SafeIdentityUser, "id" | "sessionVersion">) {
  return createIdentitySessionToken(
    user,
    getSessionSecret({ allowGeneratedSecret: process.env.NODE_ENV !== "production" })
  );
}

export async function requireIdentityUser() {
  const user = await getCurrentIdentityUser();
  if (!user) {
    throw new PublicApiError(401, "Phi�n dang nh?p kh�ng h?p l? ho?c d� h?t h?n.");
  }
  return user;
}

export async function requirePageIdentityUser() {
  const user = await getCurrentIdentityUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireIdentityAdmin() {
  const user = await requireIdentityUser();
  if (!canManageUsers(user)) {
    throw new PublicApiError(403, "B?n kh�ng c� quy?n qu?n tr? ngu?i d�ng.");
  }
  return user;
}

export async function requirePageIdentityAdmin() {
  const user = await requirePageIdentityUser();
  if (!canManageUsers(user)) {
    redirect("/");
  }
  return user;
}

export async function establishIdentitySession(user: Pick<SafeIdentityUser, "id" | "sessionVersion">) {
  const sessionContext = await getSessionContext();
  const cookieStore = await cookies();
  cookieStore.set(
    sessionContext.cookieName,
    createIdentitySessionToken(
      user,
      getSessionSecret({ allowGeneratedSecret: sessionContext.allowGeneratedSecret })
    ),
    {
      httpOnly: true,
      sameSite: "strict",
      secure: sessionContext.secureCookie,
      path: "/",
      maxAge: identitySessionLifetimeSeconds,
      priority: "high"
    }
  );
}

export async function clearIdentitySession() {
  const sessionContext = await getSessionContext();
  const cookieStore = await cookies();
  cookieStore.set(sessionContext.cookieName, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: sessionContext.secureCookie,
    path: "/",
    maxAge: 0,
    priority: "high"
  });
}

export function visibleModulesForIdentity(user: SafeIdentityUser) {
  const allowed = new Set(visibleModulesForRole(user.role));
  const selected = new Set(user.moduleIds);
  selected.add("overview");
  return operationsErpRegistry.navigation
    .map((module) => module.id)
    .filter((moduleId) => allowed.has(moduleId) && selected.has(moduleId)) as OperationsModuleId[];
}

export function operationsActorForIdentity(user: SafeIdentityUser): OperationsActor {
  const baseActor = createRoleActor(user.role);
  const visibleModuleIds = new Set(visibleModulesForIdentity(user));
  const permittedByModule = new Set(
    operationsErpRegistry.modules
      .filter((module) => visibleModuleIds.has(module.id))
      .flatMap((module) => module.commands.map((command) => command.permission))
  );

  return {
    ...baseActor,
    id: user.id,
    displayName: user.displayName,
    employeeId: user.employeeId,
    customerId: user.customerId,
    supplierId: user.supplierId,
    permissions: user.role === "customer" || user.role === "supplier"
      ? baseActor.permissions
      : baseActor.permissions.filter((permission) => permittedByModule.has(permission))
  };
}

export async function requireOperationsActor() {
  return operationsActorForIdentity(await requireIdentityUser());
}

async function getIdentityUserFromSessionToken(token: string, allowGeneratedSecret: boolean) {
  const payload = verifyIdentitySessionToken(
    token,
    getSessionSecret({ allowGeneratedSecret })
  );
  if (!payload) {
    return undefined;
  }
  const user = await identityService.getUserById(payload.sub);
  if (!user || user.status !== "active" || user.sessionVersion !== payload.ver) {
    return undefined;
  }
  return normalizeLegacyDisplayName(user);
}

function normalizeLegacyDisplayName(user: SafeIdentityUser): SafeIdentityUser {
  const legacyDisplayNames: Record<string, string> = {
    "Chu cua hang": "Chủ cửa hàng",
    "Ch? c?a h�ng": "Chủ cửa hàng",
    Owner: "Chủ cửa hàng"
  };
  const displayName = legacyDisplayNames[user.displayName];
  return displayName ? { ...user, displayName } : user;
}

function getSessionSecret({ allowGeneratedSecret }: { allowGeneratedSecret: boolean; }) {
  const configuredSecret = getRuntimeEnvironmentVariable("ERP_SESSION_SECRET")?.trim();
  if (configuredSecret) {
    if (configuredSecret.length < 32) {
      throw new Error("ERP_SESSION_SECRET ph?i c� �t nh?t 32 k� t? trong m�i tru?ng production.");
    }
    return configuredSecret;
  }
  if (allowGeneratedSecret || process.env.NODE_ENV !== "production") {
    return identityGlobal.vlxdDevelopmentSessionSecret ??= randomBytes(32).toString("base64url");
  }
  throw new Error("ERP_SESSION_SECRET ph?i c� �t nh?t 32 k� t? trong m�i tru?ng production.");
}

async function getSessionContext(): Promise<SessionContext> {
  const headerStore = await headers();
  const host = headerStore.get("host");
  const forwardedProto = normalizeForwardedProto(headerStore.get("x-forwarded-proto"));
  const configuredSecureCookie = parseOptionalBoolean(getRuntimeEnvironmentVariable("ERP_SESSION_COOKIE_SECURE"));

  const isLocalhost = isLocalHostRequest(host);
  let secureCookie = process.env.NODE_ENV === "production";
  if (configuredSecureCookie !== undefined) {
    secureCookie = configuredSecureCookie;
  } else if (process.env.NODE_ENV === "production") {
    if (isLocalhost) {
      secureCookie = false;
    } else if (forwardedProto === "http") {
      secureCookie = false;
    }
  }

  const allowGeneratedSecret = !secureCookie || process.env.NODE_ENV !== "production";
  const cookieName = secureCookie ? identitySessionCookieNameSecure : identitySessionCookieName;

  return {
    cookieName,
    secureCookie,
    allowGeneratedSecret
  };
}

function isLocalHostRequest(hostValue: string | null) {
  if (!hostValue) {
    return false;
  }
  const host = hostValue.toLowerCase().split(":")[0];
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function normalizeForwardedProto(value: string | null) {
  if (!value) {
    return null;
  }
  return value.split(",")[0]?.trim().toLowerCase() ?? null;
}

function parseOptionalBoolean(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}
