import { NextResponse } from "next/server";
import { getErpV2Snapshot } from "@/server/erp-v2/runtime";
import { requireIdentityAdmin } from "@/server/identity/auth-context";
import { inspectOperationsStateForCutover } from "@/server/infrastructure/operations-cutover";

export async function GET() {
  await requireIdentityAdmin();
  const snapshot = await getErpV2Snapshot();
  const manifest = inspectOperationsStateForCutover(snapshot.state, {
    namespace: "operations",
    revision: snapshot.revision,
    stateSchemaVersion: 1
  });

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0"
    }
  });
}
