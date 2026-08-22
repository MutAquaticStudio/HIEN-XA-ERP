# ERP V2 functional-flow remediation — repository rescan

This rescan was performed before application-source edits on branch
`codex/erp-v2-functional-flow-remediation-20260821`.

```text
RESCAN_MAIN_SHA=46ee774e45a011fb56112a370453be0ca8563b60
RESCAN_BRANCH=codex/erp-v2-functional-flow-remediation-20260821
RESCAN_TIMESTAMP=2026-08-21
REPOSITORY_TREE_REVIEWED=PASS
WEB_ROUTES_REVIEWED=PASS
DOMAIN_MODULES_REVIEWED=PASS
SERVER_APPLICATION_REVIEWED=PASS
PERSISTENCE_REVIEWED=PASS
MIGRATIONS_REVIEWED=PASS
RBAC_PROJECTION_REVIEWED=PASS
PORTAL_REVIEWED=PASS
TESTS_REVIEWED=PASS
BUILD_CONFIG_REVIEWED=PASS
CURRENT_CODE_MAP=PASS
CURRENT_DATA_FLOW_MAP=PASS
CURRENT_RBAC_PROJECTION_MAP=PASS
CURRENT_DROPDOWN_INVENTORY=PASS
CURRENT_TEST_MAP=PASS
DOC_CODE_DRIFT=The audit identified the root app loading boundary, shell-per-page rendering, non-universal selector usage, the manual-reload recovery copy, demo price hydration in the file-only backend, and blocked staging/browser evidence.
UNKNOWN_OR_UNVERIFIED_AREAS=Staging-only fixture/reconciliation/authenticated cross-scope behavior remains environment-dependent and is not converted to PASS.
REPOSITORY_RESCAN=PASS
```

## Current code/data map

- Route map: `src/app/**` contains the internal ERP routes (`dashboard`,
  catalog, sales, procurement, inventory, delivery, receivables, payables,
  cash, workforce, compensation, import, audit and reporting), plus customer
  and supplier portal routes.
- Internal shell: `ErpShell` is rendered by `dashboard/page.tsx`,
  `module-workspace.tsx` and `catalog-ui.tsx`; there was no shared parent
  layout for these route trees.
- Snapshot/domain: `getErpV2Snapshot()` reads the configured backend and runs
  `assertAndMigrateOperationsStateToErpV2`; commands execute through
  `ErpV2CommandService` and the D1/Supabase runtime document CAS store.
- Projection/RBAC: `operations-projection.ts` filters by module, role and
  identity scope; `auth-context.ts` derives the server-side actor permissions.
- Shared selectors: `selectors.ts` contains customer, supplier, product,
  warehouse, employee, worker, driver, vehicle, unit and eligible-delivery
  selectors. A source scan found a few direct array lookups in read-only labels
  and unit/admin controls, matching audit finding L-01.
- Portal: `partner-portal-read-model.ts` projects customer/supplier data by
  identity and strips internal pricing, source and private evidence fields.
- Dashboard: `dashboard-read-model.ts` is the authoritative date-filtered
  reporting model consumed by `dashboard/page.tsx`.
- Persistence/migrations: Cloudflare `cloudflare/migrations/0001_cloudflare_runtime_foundation.sql`
  defines the server-only runtime document, idempotency and private-object
  tables; Supabase runtime-document migrations provide the equivalent CAS/RLS
  contract.
- Test/build map: `package.json` scripts were inspected; full Vitest,
  typecheck, Next build, OpenNext build, integration guards and Playwright
  configs are retained. Existing audit evidence records the pre-remediation
  baseline failures/blocks separately.

## Pre-edit baseline characterization

The prior audit's fresh baseline is retained as evidence, not treated as a
new PASS: full Vitest 140/608 and focused domain tests 73/73 passed; typecheck
and Next build passed; OpenNext hit environment `ENOSPC`; integration and
Cloudflare gates stopped at their explicit guards; public rendered QA was
14/24 pass against production; authenticated staging UAT was blocked by the
missing secure environment file. No source edit is made before this rescan
and baseline map.
