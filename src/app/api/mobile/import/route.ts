import { NextResponse } from "next/server";
import { createMobileImportDryRun, getMobileImportOverview } from "@/server/mobile/mobile-import-service";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";

export async function GET(request: Request) {
  try { const { user } = await requireNativeMobileContext(request); return NextResponse.json({ ok: true, ...(await getMobileImportOverview(user)) }); }
  catch (error) { return mobileError(error, "Không thể tải import trên điện thoại."); }
}

export async function POST(request: Request) {
  try {
    const { user, actor } = await requireNativeMobileContext(request);
    const formData = await request.formData() as unknown as { get(name: string): unknown };
    const file = formData.get("workbook");
    if (!isUploadedWorkbook(file)) return NextResponse.json({ ok: false, error: "Chọn file Excel .xlsx để chạy thử import." }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await createMobileImportDryRun(user, actor, file)) });
  } catch (error) { return mobileError(error, "Không thể chạy thử import workbook."); }
}

function isUploadedWorkbook(value: unknown): value is { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === "string" && typeof candidate.size === "number" && typeof candidate.arrayBuffer === "function";
}
