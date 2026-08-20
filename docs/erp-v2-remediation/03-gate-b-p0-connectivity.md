# Gate B — P0 core/data connectivity (R-008 → R-014)

Status: `GATE_B=PASS` for the scoped local/static gate. Production release is
not authorized by this checkpoint.

## Root causes and fixes

| Finding | Root cause | Fix | Evidence |
|---|---|---|---|
| R-008 | operational forms mapped `OperationsState` arrays independently | shared actor-aware selectors in `src/modules/operations/selectors.ts` | `02-shared-read-models.md`, selector tests |
| R-009 | warehouse and entity dependencies were documented but not uniformly projected | warehouse projection now filters assigned ids and fails closed; positive/negative projection tests added | `00-current-rbac-projection-map.md`, projection tests |
| R-010 | inline active/status filters, blank fallback selects, and purchase destination hardcoded to `wh-main` | P0 forms consume shared selectors and render explicit no-eligible/disabled states; Purchase carries an explicit actor-scoped `warehouseId` from selector through server validation to persistence | `00-current-dropdown-inventory.md`, selector tests, Phase 1 propagation test |
| R-011 | command result state and separately-read revision could be mismatched under concurrency | state/revision are paired from one persisted snapshot; client applies monotonic revision updates | `demo-store.ts`, `use-operations-runtime.ts`, runtime sync test |
| R-012 | cross-module identity continuity was not characterized as one evidence-backed contract | create commands create each master once, then downstream create/operation commands carry the same customer/supplier/warehouse/employee/vehicle ids | `tests/phase1-r008-r014.test.ts` |
| R-013 | product identity needed an explicit sales/purchase/inventory proof | one `productUnitId` is asserted in sales line, purchase line, posted receipt movement, work order, and inventory count line | `tests/phase1-r008-r014.test.ts` |

## Gate matrices

### CROSS_MODULE_DATA_CONNECTIVITY

| Entity | Same authoritative id | Positive | Negative/scope |
|---|---|---|---|
| Customer | sales order ↔ customer payment | PASS | linked selector exact-id; missing id empty |
| Supplier | purchase order ↔ supplier payment | PASS | linked selector exact-id; inactive rows excluded |
| Product | sales line ↔ purchase line ↔ posted receipt movement | PASS | inactive product excluded |
| Warehouse | sales source line ↔ inventory movement | PASS | warehouse selector/projection exact assignment |
| Employee/worker | delivery driver/workforce employee | PASS | worker selector self-only; projection linkage tested |
| Vehicle | delivery job vehicle | PASS | busy active vehicle excluded |

### DROPDOWN_DATA_INTEGRITY

PASS. Selector outputs use authoritative entity ids, active/eligible rules are
centralized, no fallback/demo entity is added, and empty options are explicit
and disabled. Covered forms: sales, procurement, catalog purchase-unit/product,
delivery, inventory/count, receivables, payables, workforce.

### RBAC_PROJECTION

PASS. Customer, supplier, driver, worker and warehouse positive/negative paths
remain server-projected. Warehouse scope now filters warehouses, inventory
movements, count sessions, warehouse purchase/sales lines, delivery jobs and
their approval dependencies; an unassigned warehouse actor receives no such
rows.

### POST_MUTATION_STATE_SYNC

PASS. The command service persists inside the transaction, the demo store reads
the state/revision pair from one backend snapshot, server actions project that
state for the actor, and the client applies the result immediately. Revision
polling remains a convenience/recovery path; a normal F5 is not required.

## Verification evidence

| Command | Exit | Result |
|---|---:|---|
| `npx.cmd vitest run tests/backend-command-service.test.ts tests/operations-invariants.test.ts tests/worker-order-claim.test.ts tests/inventory-delivery-version-lock.test.ts tests/operations-projection.test.ts tests/debt-audit-workflow.test.ts tests/operations-workflow.test.ts tests/purchase-unit-settings.test.ts tests/customer-order-catalog.test.ts tests/selectors.test.ts tests/idempotency-hash.test.ts tests/role-projection-hardening.test.ts` | 0 | 12 files, 95 tests |
| `npx.cmd vitest run tests/selectors.test.ts tests/operations-projection.test.ts tests/phase1-r008-r014.test.ts tests/operations-runtime-sync.test.ts` | 0 | 4 files, 14 tests |
| `npm.cmd test` | 0 | 127 files, 520 tests |
| `npm.cmd run typecheck` | 0 | TypeScript clean |
| `npm.cmd run build` | 0 | Next production build; 58 routes generated |
| `git diff --check` | 0 | no whitespace errors |

## Blocked validation outside this Gate B scope

- `npm.cmd run test:integration` remains an explicit staging guard and exits
  1 unless `ERP_RUN_INTEGRATION_TESTS=1` is intentionally enabled.
- `npm.cmd run test:cloudflare-integration` remains an explicit Cloudflare
  guard and exits 1 unless its staging flag is intentionally enabled.
- `npm.cmd run test:e2e:public` cannot run in this workspace because the
  required Playwright Chromium binary is not installed.
- `package.json` has no lint script; no invented lint command was used.

These blocked checks do not invalidate the local Gate B static/unit gate, but
they do not constitute production or release certification.
