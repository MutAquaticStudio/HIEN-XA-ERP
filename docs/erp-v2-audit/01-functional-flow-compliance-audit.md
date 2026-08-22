# HIỀN XA ERP V2 — FUNCTIONAL & FLOW COMPLIANCE AUDIT

Audit mode: read-only. Application source, deployment configuration, and
production data were not modified. The restored canonical specification and
this evidence report are audit artifacts; pre-existing remediation evidence and
the untracked `.agents/` directory were preserved unchanged.

## 1. Scope and baseline

| Item | Evidence | Result |
|---|---|---|
| Canonical specification | `HIEN-XA-ERP-V2-REMEDIATION-DOD-CODEX-PROMPT.md` exists at repository root, is UTF-8 readable, 88,486 bytes, 4,035 lines, SHA-256 `C2F7C8FE0DFA32FF8B0AE6589C33DB833B150D06AC101A999EA8B7C9CC58DC3E`. The first line is `HIỀN XA ERP V2 — QUY TẮC SỬA LỖI, DEFINITION OF DONE & CODEX PROMPT`; the document identifies `MutAquaticStudio/HIEN-XA-ERP`, Harness revision `1.2`, and ends with the final-status checklist. | PASS |
| Source baseline | Requested main SHA: `46ee774e45a011fb56112a370453be0ca8563b60`. `origin/main` and `HEAD` both resolve to that SHA on branch `codex/erp-v2-functional-flow-remediation-20260821`; the audit reads the committed tree at that SHA. The live worktree also contains pre-existing staged route-group renames, so tests run from a clean detached worktree for exact-main evidence. | PASS |
| Worktree safety | No application source was modified by this audit. Pre-existing staged route moves and the modified remediation rescan were preserved; the audit only updates this evidence document. No migration, secret, production data, deployment or production mutation was performed. | PASS |

The complete Markdown was read before source auditing. The audit used the
specification's requirements for authoritative IDs, D1 → snapshot → domain →
RBAC/projection → shared selector/read model → UI, append-only ledgers and
inventory movements, payment/allocation separation, DocumentUnitSnapshot,
revision synchronization, dashboard read models/charts, loading/error states,
audit/idempotency, and production no-mutation safety.

## 2. Requirement matrix

`PASS` means current source plus fresh executable evidence support the stated
requirement. `PARTIAL` means implementation exists but an explicit contract
edge is incomplete. `FAIL` means the current behavior contradicts the
specification. `BLOCKED` means the required safe validation could not be run
without staging credentials/configuration or an external resource.

| ID | Requirement audited | Current implementation/evidence | Result |
|---|---|---|---|
| F01 | Canonical technical spec restored and complete | Byte/hash/title/repository/harness/EOF checks above | PASS |
| F02 | Current main source identity | Main tree equals audited checkout | PASS |
| F03 | D1 → runtime snapshot → domain state | `src/server/erp-v2/runtime.ts:44-53` reads the backend snapshot and applies `assertAndMigrateOperationsStateToErpV2` | PASS |
| F04 | V2 migration guard | `src/modules/operations/erp-v2-migration.ts:19-90` maps legacy source fields to allocations and throws on unsafe active mappings | PASS |
| F05 | One command service and server-side authorization | `src/server/application/erp-v2-command-service.ts:41-165` resolves registry permission, loads state, runs domain command, validates invariants, saves state, records idempotency and audit | PASS |
| F06 | CAS/revision transaction boundary | `src/server/infrastructure/cloudflare-runtime-document-store.ts:33-64` uses revision-checked D1 insert/update; the backend retries bounded CAS conflicts | PASS |
| F07 | Authoritative entity IDs | Orders, lines, movements, ledger entries, allocations, work orders and portals retain IDs and project by those IDs; no display-name mutation path was found | PASS |
| F08 | Customer → Sales | Sales draft schema and command use `customerId`; sales selector is scoped by actor (`src/modules/operations/selectors.ts:27-32`) | PASS |
| F09 | Sales → Receivables → customer payment → detail | Sales delivery posts customer ledger entries; payment commands validate matching customer ledger entries; customer detail/read model consumes those IDs. Covered by full and focused domain suites | PASS |
| F10 | Supplier → Purchase | Purchase draft uses `supplierId` and supplier selector (`selectors.ts:34-39`) | PASS |
| F11 | Purchase → Payables → supplier payment → detail | Supplier ledger/payment commands validate supplier identity; supplier portal read model projects supplier purchase/payment data | PASS |
| F12 | Product propagation | Product IDs are used by sales, purchase, inventory, unit conversion, dashboard top products and portal catalog; `getSelectableProducts` is shared (`selectors.ts:41-43`) | PASS |
| F13 | Warehouse propagation | Warehouse selectors are actor-scoped (`selectors.ts:45-50`); projection filters movements, purchase destinations, sales allocations and delivery jobs by warehouse | PASS |
| F14 | Employee → Work Assignment → WorkOrder → workforce/payment | Employee IDs flow through worker/driver assignment, work outputs, compensation, employee ledger and payment commands | PASS |
| F15 | Sales V2 workflow | Registry/domain state machine covers draft → confirmed → allocated → partial/delivered; commercial totals use server-side snapshots | PASS |
| F16 | Purchase V2 workflow | Registry/domain state machine covers draft → ordered → partial/full receipt; goods receipt approval is separate from posting | PASS |
| F17 | Sourcing vs work assignment | `SalesSourceAllocation[]`, allocation IDs on delivery jobs, direct supplier and warehouse paths are present; negative-stock override is a distinct approval request | PASS |
| F18 | Inventory movement, opening, transfer, reversal and count | `InventoryMovementType` includes opening/receipt/issue/transfer/reverse; invariants require bidirectional reversal links and reasons; count approval posts append-only movements | PASS |
| F19 | DocumentUnitSnapshot and configured conversion | `DocumentUnitSnapshot` is part of sales/purchase lines; `unit-settings.ts:20-85` reads configured active conversions and preserves fixed/variable modes | PASS |
| F20 | Payment confirmation versus allocation | Customer/supplier payments have confirmed/partially_allocated/allocated states and separate `PaymentAllocation[]`; debt reconciliation distinguishes open obligations and unapplied amounts | PASS |
| F21 | Derived AR/AP/cash/stock/employee payable | `selectors.ts:161-185` and `debt-reconciliation.ts` derive balances from active ledgers, movements and cash transactions rather than editable balances | PASS |
| F22 | Atomic WorkOrder claim | Command service executes claim inside transaction/CAS and handles `ORDER_ALREADY_CLAIMED`; invariant checks claimed worker/participant consistency | PASS |
| F23 | Compensation exactly once | Compensation batches and employee ledger entries are validated in `invariants.ts:1009-1130`; registry marks `postCompensation` idempotent and stateful | PASS |
| F24 | Accounting export read-only | `accounting-export.ts:19-48` builds XLSX from report sections without a write command; reporting UI exposes download only | PASS |
| F25 | Customer portal scope | `partner-portal-read-model.ts:85-147` filters by `customerId`, hides source/allocation/commission fields and limits products/deliveries/payments/proofs | PASS |
| F26 | Supplier portal scope | `partner-portal-read-model.ts:151-207` filters by `supplierId`, hides sale price/margin metadata and exposes only that supplier's PO/notice/payment projection | PASS |
| F27 | Portal attachment/privacy scope | Projection removes private customer completion/request attachments; portal read models expose counts/status, while private attachment endpoints require authenticated scope. Fresh unauthenticated production GETs returned 401 | PASS |
| F28 | Shared selectors for entity dropdowns | Shared customer, supplier, product, warehouse, employee, worker, driver, vehicle, delivery-order and unit selectors exist and are used by core operational forms | PASS |
| F29 | Every dropdown follows the shared selector contract | Core forms use selectors, but read-only label paths and some unit/admin controls still read projected arrays directly (for example `operations-shared.tsx`, `catalog-view.tsx`, and portal proof form). No cross-scope leak was observed, but the harness's “every dropdown” rule is not mechanically complete | PARTIAL |
| F30 | Revision sync without normal manual F5 | `use-operations-runtime.ts:47-77` polls every 3 seconds, applies newer snapshots and applies mutation responses immediately. On persistent sync failure it tells the user to reload; this is a recovery fallback, not a normal mutation path | PARTIAL |
| F31 | Route transitions preserve ERP shell | `ErpShell` is rendered by each page/internal-module helper rather than a shared ERP route layout. Next navigation therefore remounts shell/page segments; no data loss was found, but the shell is not persistent across transitions | PARTIAL |
| F32 | Loading architecture uses page-level skeleton without blocking shell | Root `src/app/loading.tsx:2` owns the exact `Đang tải dữ liệu / Vui lòng chờ trong giây lát` screen. It renders standalone `system-state-page` and no `ErpShell`; its `min-height:100dvh` is defined in `design-system.css:303-309`. Most routes have no route-specific loading file, so this fallback hides the complete sidebar/shell and can cause a full layout jump | FAIL |
| F33 | Error/timeout/retry behavior | `src/app/error.tsx:6-8` provides error text, reset/retry and home link; dashboard/catalog have page-level errors. There is no explicit timeout watchdog for a never-resolving server segment, and the root loading boundary has no bounded retry/timeout state. | PARTIAL |
| F34 | Existing data remains visible during background refresh | Runtime keeps current `state` while `syncMeta.status` changes to `syncing`; state is replaced only after a newer revision is returned | PASS |
| F35 | Authoritative dashboard read model/chart/filter | `src/server/erp-v2/dashboard-read-model.ts:16-65` derives revenue from sale-delivery ledger, cash from cash transactions, top products from sales lines, normalizes one date range, and feeds chart/table/empty UI in `src/app/dashboard/page.tsx:17-72`. Fresh dashboard-read-model tests passed | PASS |
| F36 | R-045 authoritative staging dashboard reconciliation | No approved staging fixture/credentials were present; the required same-fixture authoritative read-model versus rendered dashboard comparison could not be executed | BLOCKED |
| F37 | RBAC positive/negative access | Permission registry, identity actor construction and field-level projections are server-side; fresh role/projection/invariant suites passed. Live authenticated matrix was not possible without staging identities | PASS |
| F38 | Audit and idempotency | Command service records correlation-linked audit and idempotency in one transaction; audit integrity validates processed-command/audit correspondence and reversals | PASS |
| F39 | Full unit/domain suite | Clean detached-main run: 140 files, 607 tests passed and 1 concurrency test failed with Windows `EPERM` while atomically renaming a temporary push-notification fixture file. The same `tests/worker-order-claim.test.ts` rerun serially passed 14/14, indicating an environment-level race rather than a deterministic domain assertion; this row remains PARTIAL pending a green full run | PARTIAL |
| F40 | Focused propagation/RBAC/invariant/work-order/dashboard suite | Fresh focused Vitest run over projection, partner portals, dashboard, reconciliation, invariants, worker claim, production UX boundary, runtime sync and selectors: 9 files, 49 tests passed | PASS |
| F41 | Typecheck | `npm.cmd run typecheck` exited 0 | PASS |
| F42 | Next production build | Clean-main rerun was attempted with the detached worktree. Turbopack rejected the read-only node_modules junction, and the webpack retry then stopped with `ENOSPC` while writing build output. No source or production state was changed; a clean-main build PASS from the prior evidence is not reused as fresh proof | BLOCKED |
| F43 | OpenNext/Cloudflare build | Fresh `npm.cmd run cf:build` compiled Next and generated 58/58 pages, then failed copying standalone traced files with environment `ENOSPC: no space left on device` | BLOCKED |
| F44 | Repository integration tests | `npm.cmd run test:integration` stopped at the explicit guard: `ERP_RUN_INTEGRATION_TESTS=1` and dedicated staging confirmation are absent | BLOCKED |
| F45 | Cloudflare D1/R2/Queue staging contract | `npm.cmd run test:cloudflare-integration` stopped at the explicit guard: `ERP_RUN_CLOUDFLARE_INTEGRATION_TESTS=1`/`ERP_TEST_CLOUDFLARE_CONFIRMATION=UAT-REM` and staging secret/config are absent | BLOCKED |
| F46 | Public rendered/browser QA | Fresh read-only `PLAYWRIGHT_BASE_URL=https://app.hienxavlxd.com npm.cmd run test:e2e:public` ran 24 cases: 14 passed, 10 failed. Six screenshot/artifact cases hit `ENOSPC`; four wizard cases expected the empty-catalog copy but live state exposed neither enabled quantity controls nor that copy. This is not a PASS until the live contract and reviewed snapshots are reconciled. | FAIL |
| F47 | Authenticated cross-scope E2E | `.env.integration.local` is absent in this audit checkout and no staging UAT credentials were available; no credentials were invented or used against production | BLOCKED |
| F48 | Production read-only smoke | GET `/`, `/login`, `/dashboard`, `/dat-hang`, customer/supplier login pages and `/api/mobile/release` returned 200; unauthenticated protected GETs returned 401 and fixture GET returned 405. No POST/PUT/PATCH/DELETE or fixture mutation was sent | PASS |
| F49 | Production mutation/deployment safety | No deployment, migration, fixture, order, payment, inventory, work-order or portal mutation was run; production stayed read-only | PASS |

## 3. End-to-end flow findings

### Customer flow

`customerId` is retained from identity through the sales order, sale-delivery
ledger, payment/allocation records and customer portal/detail projection. The
customer projection removes source allocations, commission, referrer and
private evidence before rendering. The source/unit boundary is PASS; live
cross-scope proof remains BLOCKED under F47.

### Supplier flow

`supplierId` is retained through purchase, supplier ledger, supplier payment,
acknowledgement and delivery notice. The supplier projection removes sale
pricing and margin metadata and limits the destination customer to the minimum
delivery label. Source/unit boundary is PASS; live cross-scope proof remains
BLOCKED under F47.

### Product, warehouse and inventory

Product and warehouse IDs are used in all operational commands and selector
paths. Stock is derived from append-only `InventoryMovement` records; opening,
receipt, transfer, issue, count adjustment and reversal commands are represented
in the registry and checked by invariants. Negative-stock requests are approval
records and do not directly edit stock. Fresh invariant/reconciliation tests
passed.

### Employee/workforce

Worker/driver identities are projected by employee ID. Claim, assignment,
output approval, compensation, employee payment and reversal are separate
commands. Atomic claim and compensation-once tests passed.

### Dashboard

The implementation has real chart data (daily revenue columns and cash summary
table), KPI cards, top-products, attention list, date normalization and empty
states. The authoritative source is explicit in code and unit tests. R-045 is
still BLOCKED because an authoritative staging read-model comparison using the
same fixture/date/filter/tenant was not safely executable in this checkout.

## 4. Full-screen loading investigation

- Owning component: `src/app/loading.tsx:1-2`.
- Activation: Next App Router's root loading boundary while a route segment/server
  render is pending. It is not an application data-state component and has no
  timer or request timeout.
- Shell/sidebar: blocked. The component returns a standalone `<main>` and does
  not render `ErpShell`; CSS centers it at `min-height:100dvh`.
- Routes affected: every route without a nearer `loading.tsx`. The source has
  only route-specific loading files for `dashboard`, `catalog`, and `dat-hang`;
  the dashboard/catalog fallbacks also return a standalone `<main>` rather than
  preserving the shell. The root fallback therefore covers internal sales,
  procurement, inventory, delivery, finance, workforce, reporting, admin and
  both portal route trees during pending transitions.
- Infinite-loading risk: a never-resolving server component/request can leave
  this boundary indefinitely; no watchdog, cancellation UI or timeout is
  present. A thrown error eventually reaches `src/app/error.tsx`, which offers
  reset/retry, but a hung request does not.
- Manual F5: ordinary mutations use revision polling and immediate mutation
  snapshots. Persistent polling failure text asks the operator to reload, so
  the normal happy path does not require F5 but the recovery contract is not
  fully automatic.
- Route remount: each page/helper renders `ErpShell` directly; there is no shared
  ERP layout segment. Navigating between pages therefore recreates the shell.
- Stale data: `useOperationsRuntime` keeps current state visible during the
  3-second background refresh and replaces it only when a newer revision is
  returned.
- Spec compliance: the root fallback's shell replacement and full-screen layout
  jump contradict the specification's page-level skeleton/spinner and stable
  shell requirement. This is the primary HIGH finding H-01.

## 5. Executable verification log

| Command/check | Result | Notes |
|---|---|---|
| `npm.cmd run test` | PARTIAL | Clean detached-main run: 140 files / 607 passed / 1 Windows `EPERM` fixture-rename failure; serial worker-claim rerun 14/14 passed |
| Focused Vitest (projection, portal, dashboard, reconciliation, invariants, worker claim, production UX, runtime sync, selectors) | PASS | 9 files / 49 tests; single-worker execution |
| `npm.cmd run typecheck` | PASS | exit code 0 on clean detached main |
| `npm.cmd run build` | BLOCKED | Detached worktree Turbopack rejected node_modules junction; webpack retry hit environment `ENOSPC` while writing output |
| `npm.cmd run cf:build` | BLOCKED | Next compiled and generated 58/58 routes; OpenNext failed copying standalone traced files with `ENOSPC` |
| `npm.cmd run test:integration` | BLOCKED | explicit integration guard disabled; no staging DB confirmation |
| `npm.cmd run test:cloudflare-integration` | BLOCKED | explicit Cloudflare gate disabled; no staging secret/config |
| Local public Playwright | BLOCKED | No local server run was attempted after the environment reached `ENOSPC`; generated artifacts were not retained |
| Read-only production public Playwright | FAIL | Fresh 24 cases: 14 PASS, 10 FAIL; six screenshot/artifact cases hit `ENOSPC`, four wizard assertions did not match live catalog state |
| Read-only production GET smoke | PASS | critical public pages 200; protected unauthenticated APIs 401; security headers present |

Production headers observed on all smoke responses:

```text
Strict-Transport-Security: max-age=31536000
Content-Security-Policy: present
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

No `includeSubDomains` or `preload` directive was observed. No mutative
production request was made.

## 6. Findings and required remediation

### Critical

`CRITICAL_FINDINGS=NONE`.

### High

1. **H-01 — Root loading boundary replaces the whole ERP shell.** The exact
   production-visible loading screen is app-global for most routes, has no
   timeout path, and can cause a full-screen layout jump. Add shared ERP/portal
   route layouts with stable shell and route-level skeletons, then exercise
   slow/error/empty states at all required viewports.
2. **H-02 — Fresh rendered public QA is not green.** Ten of 24 read-only
   production public cases failed: screenshot baselines differ and the wizard
   assertion expects an empty/live-catalog branch that does not match the
   current response. Reconcile the test contract and approved rendered
   baselines before treating browser QA as PASS.

### Medium

1. **M-01 — R-045 is not closed.** Run the approved isolated staging fixture and
   compare authoritative dashboard read-model values to rendered KPI/chart/top
   product/filter/tooltip values using the same date range, units and scope.
2. **M-02 — Staging integration and authenticated cross-scope gates are
   unexecuted.** Inject only through the approved secure channel and rerun the
   guarded contract; do not bypass the guard or use production identities.
3. **M-03 — ERP shell is not a shared persistent route layout.** Moving it to a
   stable internal/portal layout would avoid unnecessary shell remounts.
4. **M-04 — Sync recovery still instructs manual reload.** Provide bounded
   retry/backoff and an in-place recovery action while preserving the current
   snapshot, rather than relying on a normal browser reload.

### Low

1. **L-01 — Selector contract is not universal.** Some read-only labels and
   administrative/unit controls traverse projected arrays directly rather than
   calling a shared selector. Convert all entity choice paths to the selector
   contract and add a static completeness test.
2. **L-02 — File-only development backend hydrates legacy sample prices.** This
   path is disabled for configured production persistence, but the remaining
   `demoPrices` compatibility code in `file-operations-backend.ts` should be
   isolated or removed before claiming a completely fallback-free runtime.

`REMEDIATION_REQUIRED=YES` because H-01/H-02 and the blocked M-01/M-02 gates
remain unresolved. This audit does not implement those remediations.

## 7. Final audit checkpoint

```text
FUNCTIONAL_FLOW_AUDIT
TECHNICAL_SPEC_ACCESS=PASS
MAIN_SHA=46ee774e45a011fb56112a370453be0ca8563b60
OVERALL_SPEC_COMPLIANCE=PARTIAL

TOTAL_REQUIREMENTS=49
PASS_COUNT=36
FAIL_COUNT=2
PARTIAL_COUNT=5
BLOCKED_COUNT=6

CROSS_MODULE_CONNECTIVITY=PARTIAL
SALES_FLOW=PASS
PURCHASE_FLOW=PASS
INVENTORY_FLOW=PASS
RECEIVABLES_FLOW=PASS
PAYABLES_FLOW=PASS
PAYMENT_FLOW=PASS
WORKFORCE_FLOW=PASS
PORTAL_FLOW=PARTIAL
ACCOUNTING_EXPORT_FLOW=PASS
DASHBOARD_FLOW=PARTIAL

RBAC=PASS
DROPDOWN_INTEGRITY=PARTIAL
REVISION_SYNC_NO_F5=PARTIAL
ENTITY_IDENTITY=PASS
FINANCIAL_INVARIANTS=PASS
INVENTORY_INVARIANTS=PASS
AUDIT_IDEMPOTENCY=PASS

LOADING_ARCHITECTURE=FAIL
FULL_SCREEN_LOADING_FINDING=FAIL

CRITICAL_FINDINGS=NONE
HIGH_FINDINGS=H-01,H-02
MEDIUM_FINDINGS=M-01,M-02,M-03,M-04
LOW_FINDINGS=L-01,L-02

REMEDIATION_REQUIRED=YES

SOURCE_MODIFIED=NO
PRODUCTION_MUTATED=NO
DEPLOYED=NO
```
