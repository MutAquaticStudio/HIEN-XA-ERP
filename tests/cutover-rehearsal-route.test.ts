import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("admin cutover rehearsal route", () => {
  it("requires server-side identity administration and returns a private no-store manifest", async () => {
    const route = await readFile("src/app/api/admin/cutover-rehearsal/route.ts", "utf8");

    expect(route).toContain('import { requireIdentityAdmin } from "@/server/identity/auth-context"');
    expect(route).toContain("await requireIdentityAdmin()");
    expect(route).toContain("await getErpV2Snapshot()");
    expect(route).toContain("inspectOperationsStateForCutover(snapshot.state");
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
  });
});
