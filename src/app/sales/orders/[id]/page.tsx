import { renderErpV2InternalModulePage } from "@/server/erp-v2/internal-module-page";
export const dynamic = "force-dynamic";
export default async function SalesOrderPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return renderErpV2InternalModulePage("sales", `/sales/orders/${id}`, id); }
