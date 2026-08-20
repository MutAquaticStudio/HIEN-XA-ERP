# Phase 5 rescan — R-035 to R-041

Date: 2026-08-20

## Verified starting point

- Remote Phase 4 base branch: `codex/erp-v2-sales-purchase-phase4-20260820`
- Remote base commit: `1e8108a051395b9fc13b7fe782cdb47eb5488024`
- Phase 5 working branch: `codex/erp-v2-inventory-workforce-phase5-20260820`
- The branch was created from the verified remote Phase 4 head before Phase 5 edits. No prior-worktree changes were reset, overwritten, or deployed.

## Current source-of-truth scan

| Roadmap item | Existing verified behavior before Phase 5 | Rescan finding / implementation target |
| --- | --- | --- |
| R-035 Opening inventory | `InventoryMovement` already supported `opening`; `stockBalance()` was movement-derived; command runner already provided transaction, idempotency and audit infrastructure. | There was no opening-stock command or editor, and `reverseInventoryMovement()` explicitly rejected `opening`. Add an append-only command, strict validation/scope, and movement reversal. |
| R-036 Inventory V2 | Inventory view already showed derived stock, transfer, movement history and count-session workflow. Warehouse detail route is the generic read-only catalog detail at `src/app/catalog/warehouses/[id]/page.tsx`. | Keep derived balances, transfer, stocktake and history. Add opening entry and make its correction traceable via the existing reversal history. |
| R-037 Eligible worker selector | `getAssignableWorkers()` already filtered active `roleType === worker`. | `WorkOrderDraftForm` used `getSelectableEmployees()` and server create-command accepted any active employee. Use worker selector in UI and enforce worker role in command service. |
| R-038 Workforce / WorkOrder V2 | Claim and manager assignment commands already had server-side role, active-worker, version and first-claim protections; `worker-order-claim.test.ts` already exercised concurrency. | Expose manager assignment UI without introducing a second work model; preserve existing open/assigned/approved/compensated lifecycle. |
| R-039 Accounting export | Reporting had monthly CSV/HTML ZIP generation; `read-excel-file` was available for importing/validating workbook files; `report-package.ts` contained a repository-owned stored-ZIP writer. | Add a read-only XLSX exporter using report sections and the existing ZIP writer, with date range and sheet selection. Do not import or mutate business data. Re-scope old import UI to admin/migration. |
| R-040 Responsive QA | No Phase 5 rendered evidence existed. | Start only after implementation and run the required desktop/mobile viewport checks in an isolated local fixture. |
| R-041 Regression gate | Existing focused test coverage included inventory count sessions, worker claim atomicity and monthly reporting. | Add Phase 5 focused tests, then run full regression/type/build and record pass/blocked boundaries. |

## Invariants carried forward

- Inventory balances remain derived only from append-only movements; correction uses reversal movement, never direct overwrite.
- Commands remain server-authorized, idempotent, audited and warehouse-scoped.
- Worker assignment is limited to active worker records in both selector and server command paths.
- WorkOrder claim/assignment concurrency remains version/transaction guarded.
- Accounting export is read-only and consumes existing report/read-model semantics; it creates no transaction, audit mutation, or production change.

## Scope boundary

Only R-035 through R-041 are in scope. R-042 and later work, production data changes, deployments, and release promotion are excluded.
