import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  getIdentityUserFromBearerRequest,
  operationsActorForIdentity,
  requireIdentityUser
} from "@/server/identity/auth-context";
import { OperationInputError } from "@/modules/operations/errors";
import { isIdentityPublicError } from "@/server/identity/errors";
import { isPublicApiError, PublicApiError } from "@/server/shared/public-api-error";

const nativeAuthenticationError = "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.";

export async function requireMobileContext(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  const bearerUser = await getIdentityUserFromBearerRequest(request);
  if (authorization && !bearerUser) {
    throw new PublicApiError(401, nativeAuthenticationError);
  }
  const user = bearerUser ?? await requireIdentityUser();
  return { user, actor: operationsActorForIdentity(user) };
}

/**
 * Native routes must never fall back to a browser cookie session. Browser
 * endpoints that deliberately support cookies keep their same-origin guard.
 */
export async function requireNativeMobileContext(request: Request) {
  const user = await getIdentityUserFromBearerRequest(request);
  if (!user) {
    throw new PublicApiError(401, nativeAuthenticationError);
  }
  return { user, actor: operationsActorForIdentity(user) };
}

export function mobileError(error: unknown, fallback: string) {
  if (isPublicApiError(error)) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  if (error instanceof OperationInputError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status ?? 400 });
  }
  if (isIdentityPublicError(error)) {
    return NextResponse.json(
      { ok: false, error: "Bạn không có quyền thực hiện thao tác này." },
      { status: 401 }
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ ok: false, error: fallback }, { status: 400 });
  }
  return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
}
