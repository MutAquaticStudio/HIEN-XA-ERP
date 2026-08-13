import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("delivery tracking web hardening migration", () => {
  it("keeps GPS mutations server-only and defines privacy retention controls", async () => {
    const migration = await readFile("supabase/migrations/202607280001_delivery_tracking_web_hardening.sql", "utf8");
    expect(migration).toContain("share_revoked_at");
    expect(migration).toContain("retention_purge_after");
    expect(migration).toContain("delivery_tracking_purge_retention");
    expect(migration).toContain("erp_private.can_read_delivery_job");
    expect(migration).toContain("grant execute on function public.delivery_tracking_record_point");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("revoke all on function public.delivery_tracking_create_share");
  });
});
