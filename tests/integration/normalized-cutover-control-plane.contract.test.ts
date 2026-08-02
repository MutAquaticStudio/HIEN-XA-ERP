import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const integrationEnabled = process.env.ERP_RUN_INTEGRATION_TESTS === "1" && Boolean(process.env.ERP_TEST_DATABASE_URL);
const describeStaging = integrationEnabled ? describe : describe.skip;

describeStaging("normalized cutover control plane contract", () => {
  let sql: Sql | undefined;

  beforeAll(() => {
    sql = postgres(process.env.ERP_TEST_DATABASE_URL!, {
      max: 1,
      prepare: false,
      idle_timeout: 5
    });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("keeps the cutover control plane private and the runtime write guard installed", async () => {
    const database = sql!;
    const relations = await database<{ relation_name: string | null }[]>`
      select to_regclass('public.erp_cutover_runs')::text as relation_name
      union all select to_regclass('public.erp_cutover_checkpoints')::text
      union all select to_regclass('public.erp_legacy_id_map')::text
    `;
    expect(relations.map((row) => row.relation_name)).toEqual([
      "erp_cutover_runs",
      "erp_cutover_checkpoints",
      "erp_legacy_id_map"
    ]);

    const policies = await database<{
      table_name: string;
      rls_enabled: boolean;
      anon_can_select: boolean;
      authenticated_can_select: boolean;
    }[]>`
      select
        c.relname as table_name,
        c.relrowsecurity as rls_enabled,
        has_table_privilege('anon', c.oid, 'select') as anon_can_select,
        has_table_privilege('authenticated', c.oid, 'select') as authenticated_can_select
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('erp_cutover_runs', 'erp_cutover_checkpoints', 'erp_legacy_id_map')
      order by c.relname
    `;

    expect(policies).toHaveLength(3);
    for (const policy of policies) {
      expect(policy.rls_enabled).toBe(true);
      expect(policy.anon_can_select).toBe(false);
      expect(policy.authenticated_can_select).toBe(false);
    }

    const guards = await database<{ guard_name: string }[]>`
      select tgname as guard_name
      from pg_trigger
      where not tgisinternal
        and tgname in ('erp_cutover_run_transition_guard', 'erp_runtime_document_cutover_guard')
      order by tgname
    `;
    expect(guards.map((guard) => guard.guard_name)).toEqual([
      "erp_cutover_run_transition_guard",
      "erp_runtime_document_cutover_guard"
    ]);
  });
});
