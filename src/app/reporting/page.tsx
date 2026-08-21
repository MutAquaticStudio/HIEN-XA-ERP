import { renderErpV2InternalModulePage } from "@/server/erp-v2/internal-module-page";
export const dynamic = "force-dynamic";
export default function ReportingPage() { return renderErpV2InternalModulePage("reporting", "/reporting"); }
