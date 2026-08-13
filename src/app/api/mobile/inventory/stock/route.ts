import { NextResponse } from "next/server";
import { z } from "zod";
import { mobileError, requireNativeMobileContext } from "@/server/mobile/mobile-api";
import { getMobileInventoryStockDetail } from "@/server/mobile/mobile-inventory-delivery-service";

const querySchema = z.object({
  warehouseId: z.string().trim().min(1).max(128),
  productUnitId: z.string().trim().min(1).max(128)
});

export async function GET(request: Request) {
  try {
    const { user } = await requireNativeMobileContext(request);
    const url = new URL(request.url);
    const query = querySchema.parse({
      warehouseId: url.searchParams.get("warehouseId"),
      productUnitId: url.searchParams.get("productUnitId")
    });
    return NextResponse.json({ ok: true, ...(await getMobileInventoryStockDetail(user, query.warehouseId, query.productUnitId)) });
  } catch (error) {
    return mobileError(error, "Không thể tải chi tiết tồn kho.");
  }
}
