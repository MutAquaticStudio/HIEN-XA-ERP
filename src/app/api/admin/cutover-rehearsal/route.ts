import { NextResponse } from "next/server";
import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { requireIdentityAdmin } from "@/server/identity/auth-context";
import { inspectOperationsStateForCutover } from "@/server/infrastructure/operations-cutover";

export async function GET() {
  await requireIdentityAdmin();
  const snapshot = await getDemoOperationsSnapshot();
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
