import { CatalogListPage } from "@/components/erp-v2/catalog-ui";
import { requireCatalogAccess } from "@/server/erp-v2/catalog-read-model";
export const dynamic = "force-dynamic";
export default async function SuppliersCatalog({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) { return <CatalogListPage access={await requireCatalogAccess()} kind="suppliers" query={await searchParams} />; }
