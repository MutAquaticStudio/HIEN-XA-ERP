import { renderErpV2InternalModulePage } from "@/server/erp-v2/internal-module-page";
export const dynamic = "force-dynamic";
export default function PurchaseOrdersPage() { return renderErpV2InternalModulePage("procurement", "/procurement/orders"); }
