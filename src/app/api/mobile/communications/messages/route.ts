import { NextResponse } from "next/server";
import { z } from "zod";
import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { communicationService } from "@/server/communications/runtime";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

const partyTypeSchema = z.enum(["customer", "supplier"]);
const messageSchema = z.object({
  partyType: partyTypeSchema,
  partyId: z.string().trim().min(1).max(128).optional(),
  body: z.string().trim().min(1).max(2000),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/)
});

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    const url = new URL(request.url);
    const partyType = partyTypeSchema.parse(url.searchParams.get("partyType"));
    const partyId = url.searchParams.get("partyId") || undefined;
    const snapshot = await getDemoOperationsSnapshot();
    return NextResponse.json({ ok: true, ...(await communicationService.listMessages(user, snapshot.state, partyType, partyId)) });
  } catch (error) {
    return mobileError(error, "Không thể tải tin nhắn.");
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    const input = messageSchema.parse(await request.json());
    const snapshot = await getDemoOperationsSnapshot();
    return NextResponse.json({ ok: true, ...(await communicationService.sendMessage({
      user,
      state: snapshot.state,
      partyType: input.partyType,
      requestedPartyId: input.partyId,
      body: input.body,
      idempotencyKey: input.idempotencyKey
    })) });
  } catch (error) {
    return mobileError(error, "Không thể gửi tin nhắn.");
  }
}
