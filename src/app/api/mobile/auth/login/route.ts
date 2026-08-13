import { NextResponse } from "next/server";
import { z } from "zod";
import { createMobileAccessToken } from "@/server/identity/auth-context";
import { identityService } from "@/server/identity/runtime";
import { mobileError } from "@/server/mobile/mobile-api";

const schema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128)
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const user = await identityService.authenticate(input.identifier, input.password);
    return NextResponse.json({
      ok: true,
      accessToken: createMobileAccessToken(user),
      user: {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        moduleIds: user.moduleIds
      }
    });
  } catch (error) {
    return mobileError(error, "Không thể đăng nhập trên ứng dụng di động.");
  }
}
