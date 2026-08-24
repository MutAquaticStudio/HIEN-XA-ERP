import { CatalogUnitSettingsWorkspace } from "@/components/erp-v2/catalog-unit-settings";
import { operationsActorForIdentity } from "@/server/identity/auth-context";
import { requireCatalogAccess } from "@/server/erp-v2/catalog-read-model";

export const dynamic = "force-dynamic";

export default async function CatalogUnitsPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const access = await requireCatalogAccess();
  const { productId } = await searchParams;
  return <CatalogUnitSettingsWorkspace
    actor={operationsActorForIdentity(access.user)}
    initialProductId={productId}
    initialSnapshot={access.snapshot}
  />;
}
