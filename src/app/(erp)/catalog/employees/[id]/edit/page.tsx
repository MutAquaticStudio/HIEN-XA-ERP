import { CatalogEditForm } from "@/components/erp-v2/catalog-crud";
import { findCatalogRecord, requireCatalogEditAccess } from "@/server/erp-v2/catalog-read-model";
export const dynamic = "force-dynamic";
export default async function EditEmployee({ params }: { params: Promise<{ id: string }> }) { const access = await requireCatalogEditAccess(); const id = (await params).id; return <CatalogEditForm access={access} kind="employees" record={findCatalogRecord(access.snapshot.state, "employees", id)} />; }
