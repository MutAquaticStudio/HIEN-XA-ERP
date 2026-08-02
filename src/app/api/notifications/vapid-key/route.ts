import { NextResponse } from "next/server";
import { notificationService } from "@/server/notifications/runtime";

export async function GET() {
  return NextResponse.json({ ok: true, publicKey: notificationService.getWebPushPublicKey() ?? null });
}
