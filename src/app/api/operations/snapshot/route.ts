import { NextResponse } from "next/server";
import { getErpV2Snapshot } from "@/server/erp-v2/runtime";
import { requireIdentityUser } from "@/server/identity/auth-context";
import { isIdentityPublicError } from "@/server/identity/errors";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireIdentityUser();
    const snapshot = projectOperationsSnapshot(await getErpV2Snapshot(), user);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    if (isIdentityPublicError(error)) {
      return NextResponse.json(
        { ok: false, error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." },
        { status: 401, headers: { "Cache-Control": "private, no-store, max-age=0" } }
      );
    }
    return NextResponse.json(
      { ok: false, error: "Không thể tải dữ liệu vận hành." },
      { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }
}
