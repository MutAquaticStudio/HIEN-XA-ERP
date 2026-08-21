import { CatalogDetailPage } from "@/components/erp-v2/catalog-ui";
import { findCatalogRecord, requireCatalogAccess } from "@/server/erp-v2/catalog-read-model";
export const dynamic = "force-dynamic";
export default async function SupplierDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) { const access = await requireCatalogAccess(); const id = (await params).id; findCatalogRecord(access.snapshot.state, "suppliers", id); return <CatalogDetailPage access={access} kind="suppliers" id={id} created={(await searchParams).created === "1"} />; }
