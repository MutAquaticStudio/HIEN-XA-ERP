# HIỀN XA ERP V2 — MASTER DATA CRUD GAP CLOSURE

## Scope and safety

This evidence closes the module-owned master-data CRUD gap on branch
codex/master-data-crud-remediation-20260822. The authoritative baseline is
20037085b52a3faabff4a10953cf64b0219fc537. No production data, deployment,
migration, or production route was mutated.

## Route contract

Each catalog family now has list, detail, new, and edit routes:

| Family | List | New | Detail | Edit | Create command |
|---|---|---|---|---|---|
| Customer | /catalog/customers | /catalog/customers/new | /catalog/customers/[id] | /catalog/customers/[id]/edit | createCustomer |
| Supplier | /catalog/suppliers | /catalog/suppliers/new | /catalog/suppliers/[id] | /catalog/suppliers/[id]/edit | createSupplier |
| Product | /catalog/products | /catalog/products/new | /catalog/products/[id] | /catalog/products/[id]/edit | createProductUnit |
| Warehouse | /catalog/warehouses | /catalog/warehouses/new | /catalog/warehouses/[id] | /catalog/warehouses/[id]/edit | createWarehouse |
| Vehicle | /catalog/vehicles | /catalog/vehicles/new | /catalog/vehicles/[id] | /catalog/vehicles/[id]/edit | createVehicle |
| Employee | /catalog/employees | /catalog/employees/new | /catalog/employees/[id] | /catalog/employees/[id]/edit | createEmployee |

List pages render the permission-aware primary labels Tạo khách hàng,
Tạo nhà cung cấp, Tạo vật tư, Tạo kho / bãi, Tạo phương tiện, and Tạo nhân sự.
Detail pages render Chỉnh sửa only for identities with
parties.update_master_data.

## Authorization and command boundary

New and edit pages use requireCatalogCreateAccess or
requireCatalogEditAccess before rendering. Create actions use the existing
ERP V2 command service and server-side permission registry. The new
updateCatalogRecord operation is registered in the catalog bounded context
with parties.update_master_data, idempotency, audit, and single-aggregate
transaction metadata.

Create results return createdEntityId from the domain command. The shared
idempotency record preserves that ID on replay while replay severity remains
warning. Edit writes require catalogKind, targetId, and expectedVersion;
stale versions fail closed. Updates only change master attributes and active
status; historical documents, ledgers, balances, inventory movements, and
derived KPIs remain read-only.

## Product downstream identity

Product creation stores one authoritative ProductUnit ID, base unit, optional
preferred supplier, sale price, VAT, portal visibility, orderability, and
status. The same ID is consumed by shared product selectors and the customer
portal catalog projection. Price/VAT remain commercial policy data and are not
rewritten by the generic edit command.

## Form behavior

All create/edit forms are client-side interactive shells over server actions:
ready fields, local validation, submitting disabled state, server error
feedback, retry by resubmission, success status, and authoritative redirect
after create. Create redirects to the new detail route with a success
indicator and calls router refresh; no manual F5 is required.

## Executable evidence

| Check | Result |
|---|---|
| Focused master-data CRUD suite | PASS: 4 tests |
| Existing command-handler/application/create regressions | PASS: 54 tests |
| Full Vitest suite | PASS: 142 files, 618 tests |
| Typecheck after implementation | PASS: npm.cmd run typecheck |
| Next production build | PASS: npm.cmd run build (webpack) |
| OpenNext/Cloudflare build | PASS: npm.cmd run cf:build; worker saved in .open-next/worker.js |
| Worker bundle/security scan | PASS: scripts/security/check-worker-bundle.mjs |
| Public browser QA | PASS: 24/24 serial cases at 1440x900, 1366x768, 1024x768, 390x844, 375x812, 360x800 |
| Authenticated role browser QA | PASS: 54/54 local fixture cases at all six viewports |
| Cross-scope isolation browser QA | PASS: 24/24 local fixture cases at all six viewports |
| CRUD route browser smoke | PASS: 6/6 owner cases, all six create/edit families at all six viewports |

Focused tests cover all six create commands and authoritative IDs,
idempotent retry, unauthorized create rejection, version conflict, audit,
product selector and portal propagation, and guarded new/edit route presence.

The first parallel public-browser attempt exposed one Windows file-backend
rename race; the required serial rerun passed 24/24. Authenticated and
isolation runs use the repository's isolated temporary fixture and never
touch production.

## Release boundary

This is a feature-branch remediation checkpoint only. Merge, production
deployment, and production mutation are outside this task and were not run.
