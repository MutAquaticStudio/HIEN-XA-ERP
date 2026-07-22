import { NextResponse } from "next/server";
import { z } from "zod";
import { createMobileWebBridgeCode } from "@/server/identity/auth-context";
import { mobileError, requireMobileContext } from "@/server/mobile/mobile-api";

const schema = z.object({ next: z.enum(["/", "/delivery-tracking"]).default("/") });

export async function POST(request: Request) {
  try {
    const { user } = await requireMobileContext(request);
    const input = schema.parse(await request.json().catch(() => ({})));
    const url = new URL("/mobile/bridge", request.url);
    url.searchParams.set("token", createMobileWebBridgeCode(user));
    url.searchParams.set("next", input.next);
    return NextResponse.json({ ok: true, url: url.toString() });
  } catch (error) {
    return mobileError(error, "Khong the mo phien web tren ung dung di dong.");
  }
}
