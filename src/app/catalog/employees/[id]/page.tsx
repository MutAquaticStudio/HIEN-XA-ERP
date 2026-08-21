import { CatalogDetailPage } from "@/components/erp-v2/catalog-ui";
import { findCatalogRecord, requireCatalogAccess } from "@/server/erp-v2/catalog-read-model";
export const dynamic = "force-dynamic";
export default async function EmployeeDetail({ params }: { params: Promise<{ id: string }> }) { const access = await requireCatalogAccess(); const id = (await params).id; findCatalogRecord(access.snapshot.state, "employees", id); return <CatalogDetailPage access={access} kind="employees" id={id} />; }
