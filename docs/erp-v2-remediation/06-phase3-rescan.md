# Phase 3 pre-edit repository rescan (R-021 to R-027)

Run date: 2026-08-20 (Asia/Bangkok)

This evidence was written before any Phase 3 source edit. The working branch is
based on the accepted Phase 2 remote commit, not `main`.

## Canonical source and branch

```text
REPOSITORY=MutAquaticStudio/HIEN-XA-ERP
REMOTE=https://github.com/MutAquaticStudio/HIEN-XA-ERP.git
PHASE3_BASE_BRANCH=codex/erp-v2-core-data-20260820
PHASE3_BASE_SHA=effc435770f6f7ff5c1a27ae1f0551762e1384de
PHASE3_WORKING_BRANCH=codex/erp-v2-ui-phase3-20260820
PHASE3_INITIAL_TREE_SHA=00f90094b0d1a11d5da46a7851ccebc5d521aee8
RESCAN_MAIN_SHA=16f609c2d55556f193a9040603ba7b4d9a4e4a38
REMOTE_BASE_MATCH=YES
WORKTREE_BEFORE_PHASE3_SOURCE_EDITS=clean
```

`git fetch origin` was run, followed by an explicit fetch of `origin/main`
because the repository's default fetch refspec did not create a local
`refs/remotes/origin/main` ref. `git ls-remote` and `git show-ref` agree on the
SHA values above.

## Inventory and source review

```text
TRACKED_FILES=645
SCOPED_FILES_REVIEWED=413 (src/app, src/components, src/erp, src/lib,
  src/modules, src/server, schema, supabase/migrations, cloudflare/migrations,
  tests, docs, adr)
APP_ROUTE_FILES_REVIEWED=115
TEST_FILES_REVIEWED=129 unit files plus integration/e2e trees
```

The following were read or inspected: `AGENTS.md`, `PROJECT_BRIEF.md`,
`README.md`, package scripts, TypeScript/Vitest/Playwright/Next/OpenNext/Wrangler
configuration, all current app routes, UI primitives and operations shell,
operations registry/router, domain types/commands/services/selectors,
projection/auth context, reporting/reconciliation read models, persistence
backends, Supabase and Cloudflare migrations, ADRs, and the existing remediation
maps/tests.

## Current-state maps

| Required map | Current evidence and result |
|---|---|
| Current route map | Existing public/identity, operations workbench, API/mobile routes are inventoried in `00-current-route-map.md`; no `/catalog/*` routes exist yet. **PASS** |
| Current navigation model | `src/components/operations-app.tsx` keeps `activeModule` in client state and renders flat registry navigation; `src/modules/operations/erp-registry.ts` owns module metadata. Existing paths remain compatibility surfaces. **PASS** |
| Current code/domain-command map | `00-code-map.md` and `00-current-domain-command-map.md`; server actions call `OperationsCommandService`, which enforces registry permission, CAS persistence, audit, invariants and idempotency. **PASS** |
| Current data flow | `getDemoOperationsSnapshot`/backend -> `projectOperationsSnapshot` -> projected `OperationsState` -> selectors/read models -> UI; mutation returns persisted state/revision. **PASS** |
| Current RBAC/projection | `src/server/identity/auth-context.ts` and `operations-projection.ts`; route authorization must use `requirePageIdentityUser`, then preserve role/party/warehouse scope. Existing positive/negative projection tests remain green. **PASS** |
| Current dropdown inventory | `00-current-dropdown-inventory.md` plus `src/modules/operations/selectors.ts`; accepted selectors include customers, suppliers, products, warehouses, employees/workers/drivers and vehicles. Phase 3 consumes them and does not redesign contracts. **PASS** |
| Current portal flow | Customer portal uses the public-safe catalog path and explicit product portal flags introduced in Phase 2; portal routes and mobile catalog are preserved. **PASS** |
| Current unit conversion flow | Product/unit types, `unit-settings.ts`, create commands and document snapshots are authoritative; Phase 3 only presents accepted data. **PASS** |
| Current reporting/read models | `reconciliation.ts`, `monthly-report.ts`, and `role-dashboard.ts` derive values from ledgers, cash transactions and inventory movements. Dashboard work must consume these sources. **PASS** |
| Current persistence/migrations | File, Supabase and Cloudflare D1 backends use snapshot/revision/CAS contracts; `supabase/migrations/**` and `cloudflare/migrations/0001_cloudflare_runtime_foundation.sql` reviewed. No Phase 3 migration is planned. **PASS** |
| Current test map | `00-current-test-map.md`, `tests/**`, integration setup guards and Playwright configs reviewed. **PASS** |

## Design/UI drift recorded before implementation

`src/app/design-system.css`, `globals.css`, `elder-friendly-ui.css`, and
`contrast-hardening.css` currently contain overlapping token layers. The old
shell uses Be Vietnam Pro, a light sidebar and decorative background rules,
while the partial `hx-*` layer uses a different navy/blue palette and larger
controls. This is a documented R-021 consolidation target, not a Core/Data
contract defect. Existing Vietnamese copy and functionality must remain intact.

`src/components/operations-app.tsx` uses client-only module selection rather
than addressable catalog routes. The new routes will be additive and will keep
the old workbench navigation for compatibility.

`role-dashboard.ts` contains role-specific metrics but no Phase 3 chart contract
or reconciliation evidence. R-024/R-025 will add only read-model-backed UI and
tests; unavailable metrics will be omitted rather than fabricated.

## Gate 0 decision

```text
REPOSITORY_RESCAN=PASS
CURRENT_CODE_MAP=PASS
CURRENT_DATA_FLOW_MAP=PASS
CURRENT_RBAC_PROJECTION_MAP=PASS
CURRENT_DROPDOWN_INVENTORY=PASS
CURRENT_TEST_MAP=PASS
UNKNOWN_AREAS=local staging/UAT credentials and Chromium executable; explicitly recorded in baseline
DOC_CODE_DRIFT=overlapping legacy/V2 CSS tokens and client-only workbench navigation; documented above
```

No source component, type, projection, migration, or domain behavior was
changed before this rescan evidence.
