# ERP V2 — Advanced Product Unit Conversion

## Pre-edit repository rescan

```text
RESCAN_MAIN_SHA=bbc9dffef38c8efad5d013aec27ea04cc92ec669
RESCAN_MAIN_TREE=827e3a29d4342fb7686ec3f4377706021f79d432
FEATURE_BRANCH=codex/erp-v2-advanced-unit-conversion-20260824
REPOSITORY_FILE_COUNT=832
SCOPED_FILE_COUNT=689
REPOSITORY_RESCAN=PASS
CURRENT_CODE_MAP=PASS
CURRENT_DATA_FLOW_MAP=PASS
CURRENT_RBAC_PROJECTION_MAP=PASS
CURRENT_DROPDOWN_INVENTORY=PASS
CURRENT_TEST_MAP=PASS
UNKNOWN_OR_UNVERIFIED_AREAS=NONE
```

The complete canonical technical specification, root repository instructions,
project brief, architecture documents, ADRs, build configuration, runtime
persistence, role projection, portal projection, document commands, inventory
posting, unit selectors, pricing, UI routes and relevant test suites were
re-read from the pinned main tree before application source changes.

### Current-state map

- Runtime persistence: the complete `OperationsState` document is stored in D1
  `erp_runtime_documents` with compare-and-swap revision control. Unit changes
  are additive JSON fields and require backward-compatible runtime migration,
  not a destructive relational data migration.
- Command path: server action schema → `ErpV2CommandService` → bounded-context
  handler → cloned domain state → invariant validation → CAS persistence →
  revisioned client snapshot.
- Current unit model: product base unit is `ProductUnit.unitName`; reusable names
  are `UnitDefinition`; per-product records are
  `PurchaseUnitConversion` with legacy `fixed | variable` modes.
- Current document path: shared selector resolves a configured unit; Sales,
  Purchase and Customer Portal commands re-read the server factor and persist a
  `DocumentUnitSnapshot`; inventory quantities and unit costs are converted to
  the product base unit before posting.
- Current projection: internal master/procurement roles can receive unit
  configuration. Customer/supplier projections do not receive the raw unit
  collections. Customer catalog is a purpose-built allow-listed DTO.
- Current sync: successful commands return a paired state/revision snapshot;
  background sync applies only newer revisions and retains current data during
  retries, so normal F5 is not required.

### Document/code drift to close

1. Only legacy `fixed | variable` modes exist; no typed multi-level, dimension
   or density graph exists.
2. Conversion resolution is direct-to-base only and has no cycle or duplicate
   path validation.
3. Context policy only distinguishes purchase, sales and customer portal.
4. Customer catalog currently includes `factorToBase`; the goal requires a
   safe `unitName`/selling-price contract without internal conversion data.
5. `DocumentUnitSnapshot` does not explicitly store converted base quantity or
   canonical mode. Receipt inventory movements do not carry the source unit
   snapshot.
6. `/catalog/units` is a two-panel basic editor instead of the required Product
   Unit Workspace table and live preview.

## Baseline

The pre-edit focused regression suite passed 38/38 tests, typecheck passed and
the Next production build passed. The first broad run was accidentally started
in parallel with another Vitest process; one process collided while renaming the
local `.data/push-notifications.json` file. The affected test passed in
isolation. All release evidence below was therefore rerun serially.

## Implementation evidence

### Authoritative conversion graph

`advanced-unit-conversion.ts` resolves one graph per product and normalizes the
legacy `fixed | variable` values to the canonical modes without breaking stored
runtime documents:

| Mode | Authoritative calculation | Example verified |
|---|---|---|
| `FIXED_RATIO` | configured positive factor to the inventory base unit | 1 bag = 50 kg |
| `MULTI_LEVEL` | positive factor to parent × resolved parent factor | 1 pallet = 40 bags × 50 kg = 2,000 kg |
| `VARIABLE_ACTUAL` | actual base quantity supplied only in Purchase/Logistics and snapshotted at document creation | 1 truck = 6,250 kg for the tested receipt |
| `DIMENSION_BASED` | typed length/area/volume metadata, never executable text | 0.6 m × 0.6 m = 0.36 m² per tile |
| `DENSITY_BASED` | typed mass/volume scales and the product density | 1 L × 1.25 kg/L = 1.25 kg |

The resolver rejects duplicate product-unit records, graph cycles, missing or
invalid parents, a chain through `VARIABLE_ACTUAL`, non-positive factors,
duplicate contexts, incompatible physical dimensions and missing/non-positive
density. Derived factors are refreshed after edits while existing transaction
snapshots remain unchanged.

### Context policy and server authority

- Canonical contexts are `PURCHASE`, `SALES`, `INVENTORY_DISPLAY`, `PORTAL` and
  `LOGISTICS`.
- `VARIABLE_ACTUAL` is limited to Purchase and Logistics; deterministic units
  can be independently enabled for each context.
- Sales, Purchase and Customer Portal selectors use the shared resolved graph.
  The command layer re-reads mode, context, factor, product price and VAT from
  authoritative state. A forged client factor is rejected.
- Customer Portal exposes only `unitName`, derived `salePrice` and `taxRate`.
  It does not expose factor, parent path, density/dimensions, purchase price,
  markup, profit or costing.
- Server-side permissions continue to require
  `catalog.manage_purchase_units`; worker access is rejected in focused tests.

### Snapshots and inventory invariant

Each converted Sales/Purchase/Portal line snapshots the selected unit, base
unit, selected quantity, resolved factor, converted base quantity, converted
unit amount and canonical mode. Editing the graph later does not rewrite that
snapshot. A goods receipt carries a proportional source-unit snapshot for
traceability, while the inventory movement quantity and unit cost remain in the
inventory base unit. Runtime invariant checks validate both the graph and every
document/movement snapshot.

### Product Unit Workspace

`/catalog/units` is now a product-first workspace with:

- product selection and an explicit inventory-base-unit banner;
- typed physical profile for the product;
- configured-unit table with mode, parent path, contexts, status and resolved
  factor;
- accessible create/edit dialog, mode-specific fields, context toggles and live
  conversion preview;
- protected delete behavior and preserved optimistic-version/idempotency flow;
- responsive one-column mobile layout and a labelled, keyboard-focusable table
  region.

Product Detail resolves and labels the same graph rather than rendering raw
legacy values. Density configuration is not offered until the product has a
valid density profile.

## Verification evidence

| Verification | Result | Evidence |
|---|---|---|
| Focused unit/invariant regression | PASS | 6 files, 47 tests |
| Full Vitest suite, serial | PASS | 149 files, 672 tests |
| TypeScript | PASS | `tsc --noEmit` |
| Next production build | PASS | 55/55 static pages generated; all dynamic routes collected |
| Linux OpenNext build | PASS | OpenNext Cloudflare 1.20.2 generated `.open-next/worker.js` |
| Worker runtime dependency scan | PASS | no forbidden Undici/Wrangler/Miniflare/OpenNext runtime dependency; SHA-256 `d05223bf4d44c84108a102ab62aa3bc9c5568f0c3ac2064c37be5cc65c64bc45` |
| Unit workspace authenticated E2E | PASS | 6/6 at 1440×900, 1366×768, 1024×768, 390×844, 375×812 and 360×800; axe passed |
| Other authenticated/cross-scope E2E | PASS | 90/90 account isolation, authenticated shell, master-data CRUD and product pricing tests; button/action suite 7 passed with 5 intentional viewport skips |
| Public/Portal E2E | PASS | 24/24 over all six viewports |
| Native mobile regression | PASS | typecheck; 20 Jest suites / 47 tests |
| Rendered browser QA | PASS | desktop order quantity interaction and 390×844 mobile loading-to-content transition; no console error, overlay or horizontal overflow |
| Dedicated integration suite | NOT RUN | repository guard stopped before test collection because staging-only `ERP_RUN_INTEGRATION_TESTS=1` was absent; the guard was not bypassed in this non-staging goal |

The authenticated suites cover positive/negative roles, Customer A/B and
Supplier A/B isolation, worker/driver scopes, fresh revision rendering without
a normal F5, keyboard interaction, loading/error/empty behavior and
accessibility. The focused domain tests cover context rejection, client-factor
tampering, RBAC denial, duplicate idempotency retry, document immutability and
base-unit-only inventory posting.

The mobile dependency audit reported 18 existing transitive findings (13
moderate, 5 high). No dependency or lockfile was changed because this goal is
the unit-conversion implementation and release is explicitly out of scope.

```text
PRODUCTION_CHANGED=NO
STAGING_CHANGED=NO
DEPLOYED=NO
READY_FOR_STAGING_VALIDATION=YES
FINAL_BLOCKERS=NONE
```
