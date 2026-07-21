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

  const payload = verifyIdentitySessionToken(
    token,
    getSessionSecret({ allowGeneratedSecret: sessionContext.allowGeneratedSecret })
  );
  if (!payload) {
    return undefined;
  }
  const user = await identityService.getUserById(payload.sub);
  if (!user || user.status !== "active" || user.sessionVersion !== payload.ver) {
    return undefined;
  }
  return user;
}

export async function requireIdentityUser() {
  const user = await getCurrentIdentityUser();
  if (!user) {
    throw new Error("Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
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
    throw new Error("Bạn không có quyền quản lí người dùng.");
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
    permissions: baseActor.permissions.filter((permission) => permittedByModule.has(permission))
  };
}

export async function requireOperationsActor() {
  return operationsActorForIdentity(await requireIdentityUser());
}

function getSessionSecret({ allowGeneratedSecret }: { allowGeneratedSecret: boolean; }) {
  const configuredSecret = process.env.ERP_SESSION_SECRET?.trim();
  if (configuredSecret) {
    if (configuredSecret.length < 32) {
      throw new Error("ERP_SESSION_SECRET phải có ít nhất 32 ký tự trong môi trường production.");
    }
    return configuredSecret;
  }
  if (allowGeneratedSecret || process.env.NODE_ENV !== "production") {
    return identityGlobal.vlxdDevelopmentSessionSecret ??= randomBytes(32).toString("base64url");
  }
  throw new Error("ERP_SESSION_SECRET phải có ít nhất 32 ký tự trong môi trường production.");
}

async function getSessionContext(): Promise<SessionContext> {
  const headerStore = await headers();
  const host = headerStore.get("host");
  const forwardedProto = normalizeForwardedProto(headerStore.get("x-forwarded-proto"));
  const configuredSecureCookie = parseOptionalBoolean(process.env.ERP_SESSION_COOKIE_SECURE);

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
