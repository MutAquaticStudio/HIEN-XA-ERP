# Phase 4 pre-edit rescan — R-028 → R-034

Date: 2026-08-20
Scope: Sales V2, business document date/backdate, commercial totals, sourcing/work assignment, Purchase V2, Sales/Purchase functional gate.
Explicit stop boundary: R-035+ is not started in this phase.

## Repository and branch

| Check | Evidence |
|---|---|
| Canonical base branch | `codex/erp-v2-ui-phase3-20260820` |
| Canonical base SHA | `62c4c985824fbc61c3c27581ddfdd81b098c6f40` |
| Canonical base tree | `ed3d29f7a8a0d13397c17a72c1208c3bb9c05912` |
| Phase 4 branch | `codex/erp-v2-sales-purchase-phase4-20260820` |
| Current HEAD/tree before Phase 4 implementation | `62c4c985824fbc61c3c27581ddfdd81b098c6f40` / `ed3d29f7a8a0d13397c17a72c1208c3bb9c05912` |
| Working tree before Phase 4 implementation | clean |
| Rescan main SHA | `16f609c2d55556f193a9040603ba7b4d9a4e4a38` |

Inventory at rescan: 716 tracked files; 120 `src/app` files; 38 `src/components` files; 23 `src/modules` files; 75 `src/server` files; 147 test files; 131 documentation files. The repository exposes local/file, integration, Cloudflare, and Playwright commands in `package.json`; lint is not configured as a script.

## Current code map

### Sales

- UI entry: `src/components/operations/operations-module-router.tsx` → `SalesView` in `src/components/operations/sales-view.tsx`.
- Current editor is a React Hook Form multi-line draft form. It already selects customer/product/unit, quantity, unit price, VAT, attachment, and adds/removes lines, but is rendered as a side-stack panel and has no business-date field, address/note/payment-term controls, discount controls, commission controls, or explicit edit mode.
- Command contract: `CreateCommand` → `createSalesOrderDraft` in `src/modules/operations/types.ts`; server execution goes through `src/server/application/operations-command-service.ts`, then `runCreateCommand` in `src/modules/operations/create-commands.ts`.
- Current creation snapshots `orderDate = today(now)`, commercial payment terms, promised delivery date, optional delivery charge, line discount (if supplied by a caller), VAT, and `DocumentUnitSnapshot`. No commission or `createdAt`/audit-time field is persisted on `SalesOrder`.
- Confirmation and source allocation are server-side operations in `src/modules/operations/service.ts`: `confirmSalesOrder`, `allocateSalesSources`, `findSourceAllocation`. Confirmation creates one open `WorkOrder` for the order; allocation chooses warehouse/direct supplier or linked purchase lines.

### Purchase

- UI entry: `ProcurementView` / `PurchaseOrderDraftForm` in `src/components/operations/procurement-view.tsx`.
- Current editor is a multi-line form with supplier/product/purchase-unit conversion, quantity/cost/VAT, destination selector, warehouse/customer selector, optional linked direct-sales draft, freight estimate, and attachment. It is a side-stack panel rather than a full-width editor and has no business-date field or edit mode.
- Command contract: `createPurchaseOrderDraft` in `src/modules/operations/types.ts` and `runCreateCommand` in `src/modules/operations/create-commands.ts`.
- Current creation snapshots `orderDate = today(now)`, commercial payment terms, expected delivery date, freight allocations, destination, customer/warehouse linkage, purchase/sales line linkage, discounts, VAT, and unit snapshots.
- Confirmation, goods receipt, approval, direct delivery, reversal, and status synchronization are server-side in `src/modules/operations/service.ts`; stock changes are movements only and direct delivery has no warehouse movement.

### Shared commercial/pricing and selectors

- `src/modules/operations/commercial-pricing.ts` is authoritative for discount normalization, freight allocation, landed cost, margin, payment terms, and date derivation.
- `src/modules/operations/selectors.ts` is the shared read-model contract for eligible customers, suppliers, products, warehouses, employees, unit definitions, stock, and line totals. Existing `lineTotals`/`salesOrderTotals` do not subtract line discounts and do not include commission.
- `src/server/identity/operations-projection.ts` projects module fields and further filters warehouse/worker/customer/supplier data. Sales and procurement projections already include linked orders, units, warehouses, approvals, and source data according to role scope.

## Current data flow

`D1/file backend → OperationsCommandService transaction + idempotency → runCreateCommand/runOperation → OperationsState → operations projection → OperationsApp/runtime → module view/read model → UI`.

The file backend (`src/server/infrastructure/file-operations-backend.ts`) serializes transactions and persists revisioned state atomically. `OperationsCommandService` enforces permission, idempotency, invariant checks, audit validation, and mutation persistence. No UI-only write path was found.

## RBAC and projection map

- Command permissions are declared in `src/modules/operations/service.ts` / `erp-registry.ts` and checked by `OperationsCommandService` before mutation.
- Sales draft/confirm/allocation, procurement draft/confirm, receipt approval/posting, direct delivery, and worker claim are server-side permissioned operations.
- Worker/warehouse projections fail closed on warehouse scope; customer/supplier projections remove internal commercial and operational fields. Owner/accountant remain the approval boundary for goods receipt and delivery approvals.
- Existing open-pool work assignment uses `WorkOrder` plus atomic `claimOpenSalesWorkOrder`; no second job system is present.

## Dropdown inventory

- Sales: `getSelectableCustomers`, `getSelectableProducts`, `documentUnitOptions`, `getSelectableUnitDefinitions`; warehouse/source selection is server-side during allocation.
- Purchase: `getSelectableSuppliers`, `getSelectableCustomers`, `getSelectableProducts`, `getSelectableWarehouses`, `purchaseDocumentUnitOptions`, `configuredPurchaseUnit`.
- Employees/drivers/workers and vehicles use shared selectors in `selectors.ts`; no hard-coded operational IDs were found in the current editors.

## Current test map and fresh baseline

Fresh pre-edit commands on the clean Phase 4 branch:

| Command | Result |
|---|---|
| `npm.cmd exec vitest run tests/create-commands.test.ts tests/commercial-pricing.test.ts tests/operations-workflow.test.ts tests/approval-workflow.test.ts tests/worker-order-claim.test.ts tests/linked-direct-sales-draft.test.ts tests/mobile-sales-procurement-service.test.ts tests/operations-sales-procurement-version.test.ts tests/selectors.test.ts` | PASS — 9 files / 84 tests |
| `npm.cmd exec vitest run tests/phase1-r008-r014.test.ts tests/phase2-migration-safety.test.ts tests/phase3-ui-routes.test.ts` | PASS — 3 files / 7 tests |
| `npm.cmd test` | PASS — 131 files / 537 tests |
| `npm.cmd run typecheck` | PASS |

Existing coverage includes commercial discount/freight/landed cost, multi-line creation, unit snapshots, direct-delivery linkage, goods receipt approval/reversal, worker claim, idempotency, RBAC, and projection tests. There is no focused coverage yet for editable business dates/audit separation, commission persistence, canonical customer-payable totals including discounts, or Phase 4 Sales/Purchase functional E2E.

## Documentation/code drift and unknowns

Confirmed gaps to resolve in R-028→R-034:

1. `SalesOrder`/`PurchaseOrder` have `orderDate` but creation always forces today; actual audit timestamps live only in audit logs/command `now` and are not separately exposed on the document.
2. Commercial discount is persisted on lines, but shared selector totals and the Sales UI preview ignore the discount; commission is absent from the document contract.
3. Sales and Purchase editors lack full-width/mobile card Phase 4 surfaces, document date/backdate, customer address/note/payment terms, and explicit edit/validation states.
4. Sourcing and work assignment already have distinct models and atomic claim behavior; Phase 4 must expose/link them without introducing another job system.
5. Purchase already preserves warehouse vs direct delivery, freight, linked sales lines, receipt approval, idempotency, and reversal; Phase 4 must preserve those paths while improving the editor/read model.

Schema decision at rescan: no database migration is required for the existing Phase 4 contract if document audit timestamp and commission snapshot are added to the versioned operations document state with legacy hydration/defaults. If implementation proves a persisted relational schema change is unavoidable, stop and document the migration contract before proceeding.

## Scope guard

Only R-028, R-029, R-030, R-031, R-032, R-033, and R-034 may be implemented in this branch. Opening stock, Inventory V2, workforce phase, exports, final responsive gate, and any R-035+ work remain explicitly not started.
