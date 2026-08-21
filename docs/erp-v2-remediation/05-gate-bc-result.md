# Phase 2 Gate B/C result (R-015 to R-020)

Run date: 2026-08-20
Branch: `codex/erp-v2-core-data-20260820`
Base: `2dac41b26a6e5f9238500d82869bd46eb340fbd7`

## Roadmap decisions

| Roadmap item | Decision | Evidence |
|---|---|---|
| R-015 portal product policy | PASS | `customer-order-catalog.ts`, server command checks, catalog and partner-portal tests |
| R-016 public-safe portal contract/RBAC | PASS | shared web/mobile allow-list DTO, mobile catalog security test, server actor/auth tests |
| R-017 configured product units/snapshots | PASS | existing versioned conversion implementation plus purchase-unit settings characterization and server-factor test |
| R-018 schema and migration safety | PASS | runtime JSON/JSONB/D1 persistence inspection, 27-migration manifest unchanged, round-trip safety test |
| R-019 financial/inventory reconciliation | PASS | `04-reconciliation.md`, read-only reconciliation model and before/after tests |
| R-020 Gate B/C evidence | PASS | this document and command results below |

## Gate B — connectivity and safe portal propagation

```text
REPOSITORY_RESCAN=PASS
CURRENT_CODE_MAP=PASS
CURRENT_DATA_FLOW_MAP=PASS
CURRENT_RBAC_PROJECTION_MAP=PASS
CURRENT_DROPDOWN_INVENTORY=PASS (not changed in this scope)
CURRENT_TEST_MAP=PASS
CROSS_MODULE_DATA_CONNECTIVITY=PASS (web/mobile share one public catalog builder)
PORTAL_CATALOG_PROPAGATION=PASS (hidden/orderable/price/VAT/stock states)
RBAC_PROJECTION=PASS (customer ownership and server-side actor guards)
GATE_B=PASS
```

The public contract is an allow-list. It contains the authoritative product ID,
code/name/unit, public price/VAT when valid, orderability, and one of
`in_stock`, `out_of_stock`, or `quote_required`. It never serializes cost,
margin, supplier, price history, movement rows, warehouse metadata, audit
logs, processed operations, or RBAC metadata.

## Gate C — persistence and domain safety

```text
SCHEMA_CHANGE_REQUIRED=NO
SCHEMA_MIGRATION_SAFETY=PASS
FINANCIAL_INVARIANTS=PASS
INVENTORY_INVARIANTS=PASS
AUDIT_IDEMPOTENCY=PASS
GATE_C=PASS
```

R-015 fields are optional members of the existing runtime `ProductUnit` JSON
payload. Legacy documents default omission to enabled. Supabase uses the
server-only `erp_runtime_documents.payload jsonb` CAS contract; Cloudflare uses
the server-only D1 JSON payload with revision/schema version. Existing
product-specific unit conversions and immutable document snapshots are already
covered by additive migrations `202607170002`–`202607170004`. No SQL migration,
backfill, history/ledger/movement/balance edit, or production mutation was
performed.

## Verification commands

```text
PHASE2_TARGETED=PASS (15 files, 102 tests)
FULL_UNIT=PASS (129 files, 530 tests)
TYPECHECK=PASS
BUILD=PASS (58 routes)
LINT=NOT CONFIGURED (no package.json lint script)
```

The following environment gates were rerun and remain blocked, with no false
PASS claim:

```text
LOCAL_INTEGRATION=BLOCKED
WHY=explicit staging guard; ERP_RUN_INTEGRATION_TESTS and dedicated confirmation are absent
RISK=database/RLS/migration behavior remains unverified against a real staging database
NEEDED_TO_RUN=dedicated staging project plus ERP_TEST_DATABASE_CONFIRMATION=hien-xa-staging

CLOUDFLARE_INTEGRATION=BLOCKED
WHY=explicit UAT guard; Cloudflare UAT confirmation is absent
RISK=D1 contract remains unverified against live UAT
NEEDED_TO_RUN=dedicated Cloudflare UAT bindings plus ERP_TEST_CLOUDFLARE_CONFIRMATION=UAT-REM

BROWSER_E2E=BLOCKED
WHY=Playwright Chromium executable is not installed
RISK=authenticated browser/mobile visual and interaction evidence remains pending
NEEDED_TO_RUN=npx playwright install (approved environment)
```

These blockers affect Gate E/release readiness, not the domain Gate B/C evidence
above. Therefore `RELEASE_READY=NO`.

## Scope stop

```text
GATE_B_C=PASS
R-021_PLUS_STATUS=NOT STARTED
NO_PRODUCTION_MUTATION=PASS
NO_MERGE_PR4=PASS
```

The next roadmap item is deliberately not started.
