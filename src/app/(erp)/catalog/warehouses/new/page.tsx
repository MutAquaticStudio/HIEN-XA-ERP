import { CatalogCreateForm } from "@/components/erp-v2/catalog-crud";
import { requireCatalogCreateAccess } from "@/server/erp-v2/catalog-read-model";
export const dynamic = "force-dynamic";
export default async function NewWarehouse() { return <CatalogCreateForm access={await requireCatalogCreateAccess("warehouses")} kind="warehouses" />; }
