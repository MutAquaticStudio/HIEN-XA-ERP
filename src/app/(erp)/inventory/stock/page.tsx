import { renderErpV2InternalModulePage } from "@/server/erp-v2/internal-module-page";
export const dynamic = "force-dynamic";
export default async function InventoryStockPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams;
  const activeSection = ["movements", "actions", "counts", "exceptions"].includes(section ?? "") ? section : "stock";
  return renderErpV2InternalModulePage("inventory", `/inventory/stock?section=${activeSection}`);
}
