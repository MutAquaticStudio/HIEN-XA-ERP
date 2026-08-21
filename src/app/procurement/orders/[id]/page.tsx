import { renderErpV2InternalModulePage } from "@/server/erp-v2/internal-module-page";
export const dynamic = "force-dynamic";
export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return renderErpV2InternalModulePage("procurement", `/procurement/orders/${id}`, id); }
