import { NextResponse } from "next/server";
import {
  getIdentityUserFromBearerRequest,
  operationsActorForIdentity,
  requireIdentityUser
} from "@/server/identity/auth-context";

export async function requireMobileContext(request: Request) {
  const user = await getIdentityUserFromBearerRequest(request) ?? await requireIdentityUser();
  return { user, actor: operationsActorForIdentity(user) };
}

export function mobileError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const unauthorized = /phien|x[aÃ¡]c thuc|bearer/i.test(message);
  return NextResponse.json({ ok: false, error: message }, { status: unauthorized ? 401 : 400 });
}
