import { CatalogEditForm } from "@/components/erp-v2/catalog-crud";
import { findCatalogRecord, requireCatalogEditAccess } from "@/server/erp-v2/catalog-read-model";
export const dynamic = "force-dynamic";
export default async function EditWarehouse({ params }: { params: Promise<{ id: string }> }) { const access = await requireCatalogEditAccess(); const id = (await params).id; return <CatalogEditForm access={access} kind="warehouses" record={findCatalogRecord(access.snapshot.state, "warehouses", id)} />; }
