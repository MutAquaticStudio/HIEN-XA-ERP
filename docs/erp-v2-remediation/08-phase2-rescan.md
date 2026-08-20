# Phase 2 R-015 to R-020 repository rescan

Run date: 2026-08-20

This rescan was completed before Phase 2 source changes. The scope is limited
to customer portal policy and safe projection, product-specific unit
configuration/snapshots, migration safety, and financial/inventory
reconciliation. R-021 and later remain out of scope.

## Canonical source and clean starting point

```text
REMOTE=https://github.com/MutAquaticStudio/HIEN-XA-ERP.git
BRANCH=codex/erp-v2-core-data-20260820
BASE_SHA=2dac41b26a6e5f9238500d82869bd46eb340fbd7
BASE_TREE=d21126be58eca19888a70df2082b724c28cc7ffc
REMOTE_BRANCH_SHA=2dac41b26a6e5f9238500d82869bd46eb340fbd7
REMOTE_MAIN_SHA=16f609c2d55556f193a9040603ba7b4d9a4e4a38
REMOTE_BRANCH_MATCH=YES
WORKTREE_BEFORE_PHASE2=clean
FUTURE_WIP_BRANCH=codex/erp-v2-r008-plus-wip-20260820
FUTURE_WIP_SHA=e673a8c90c4f2234a6b422f9f26f144b08a43a36
```

The previously interrupted R-008+ work remains isolated on the WIP branch and
is not present in this starting tree.

## Inventory and code-map coverage

```text
SOURCE_FILES_REVIEWED=src (238 files)
TEST_FILES_REVIEWED=tests (143 files)
ROUTES_REVIEWED=src/app, src/app/api, src/app/api/mobile
PORTAL_REVIEWED=customer-order-catalog, dat-hang, portal-actions, mobile customer catalog
DOMAIN_REVIEWED=types, create-commands, unit-settings, selectors, debt-reconciliation, invariants
SECURITY_REVIEWED=identity projections, portal actor guards, mobile auth boundary, audit/idempotency paths
PERSISTENCE_REVIEWED=FileOperationsBackend, Supabase runtime document store, Cloudflare D1 runtime document store
MIGRATIONS_REVIEWED=supabase/migrations, cloudflare/migrations, migration manifest and runtime persistence tests
TEST_MAP_REVIEWED=portal, projection/RBAC, unit conversion, workflows, invariants, migration safety
BUILD_CONFIG_REVIEWED=package.json, tsconfig, Vitest, Playwright, Next config, Wrangler config
```

## Pre-change baseline

```text
CHARACTERIZATION=PASS (12 files, 95 tests)
FULL_UNIT=PASS (127 files, 520 tests)
TYPECHECK=PASS
BUILD=PASS (58 routes generated)
LINT=NOT CONFIGURED (no package.json lint script)
LOCAL_INTEGRATION=BLOCKED (staging guard; dedicated staging environment absent)
CLOUDFLARE_INTEGRATION=BLOCKED (UAT guard; Cloudflare UAT environment absent)
BROWSER_E2E=BLOCKED (Playwright Chromium executable absent)
```

## Findings and known drift

The current customer catalog is a public DTO builder but does not yet enforce
explicit visibility/orderability policy fields. The mobile customer catalog
has a separate implementation and therefore needs to consume the same
purpose-specific safe contract. Runtime operations persistence stores state in
JSON/JSONB with CAS revisioning; normalized product-unit migrations already
persist versioned conversions and document snapshots. No SQL migration is
assumed until the actual persistence path is confirmed during R-018.

`origin/main` is available at the SHA above. No source or schema change was
made before this evidence file. Unknowns are limited to the unavailable local
staging/UAT/browser environments; those are recorded as blocked tests and are
not represented as release readiness.

```text
RESCAN_STATUS=PASS
DOC_CODE_DRIFT=legacy generic projections and mobile catalog are separate from the required public-safe contract; addressed in R-016
UNKNOWN_OR_UNVERIFIED=staging integration, Cloudflare UAT, authenticated Chromium E2E
```
