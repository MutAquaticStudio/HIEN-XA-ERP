import { NextResponse } from "next/server";
import { z } from "zod";
import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { communicationService } from "@/server/communications/runtime";
import { mobileError, requireMobileContext } from "@/server/mobile/mobile-api";
import { assertWebMutationOrigin } from "@/server/shared/web-mutation-origin";

const partyTypeSchema = z.enum(["customer", "supplier"]);
const messageSchema = z.object({
  partyType: partyTypeSchema,
  partyId: z.string().trim().min(1).max(128).optional(),
  body: z.string().trim().min(1, "Nhập nội dung tin nhắn.").max(2000, "Tin nhắn tối đa 2.000 ký tự."),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/, "Mã gửi tin nhắn không hợp lệ.")
});

export async function GET(request: Request) {
  try {
    const { user } = await requireMobileContext(request);
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
    assertWebMutationOrigin(request, "Yêu cầu gửi tin nhắn không hợp lệ.");
    const { user } = await requireMobileContext(request);
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
