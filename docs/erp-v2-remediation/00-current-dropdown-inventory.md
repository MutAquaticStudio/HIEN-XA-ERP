# R-004 Current Dropdown Inventory

Status: `CURRENT_DROPDOWN_INVENTORY=PASS`; R-010 P0 remediation recorded below.

The following records current consumers and data contracts before R-008+.
`OperationsState` is projected before the component receives it. Many forms
map state arrays directly and use first-row defaults; this is a known future
remediation item.

| Screen | Field | Source Entity | Current selector/read model | Projection dependency | RBAC | Scope | Active filter | Role filter | Loading | Empty | Error |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sales | customerId | customers | direct `state.customers` | sales projection | command permission | projected state | varies by view | none | runtime snapshot | disabled/default empty | server command |
| Sales | lines[].productUnitId | productUnits | direct `state.productUnits` | sales projection | command permission | projected state | varies by view | none | runtime snapshot | disabled/default empty | server command |
| Procurement | supplierId | suppliers | direct `state.suppliers` | procurement projection | command permission | projected state | varies by view | none | runtime snapshot | disabled/default empty | server command |
| Procurement | lines[].productUnitId | productUnits | direct `state.productUnits` | procurement projection | command permission | projected state | varies by view | none | runtime snapshot | disabled/default empty | server command/unit validation |
| Procurement | lines[].warehouseId (warehouse destination) | warehouses | shared `getSelectableWarehouses(state, actor)` | procurement/warehouse projection | procurement permission + actor warehouse scope | assigned warehouse ids | active | none | runtime snapshot | explicit no warehouse in scope | server command validates requested warehouse id/scope |
| Receivables | customerId | customers | direct `state.customers` | receivables projection | payment permission | projected state | varies by view | none | runtime snapshot | disabled/default empty | server command |
| Payables | supplierId | suppliers | direct `state.suppliers` | payables projection | payment permission | projected state | varies by view | none | runtime snapshot | disabled/default empty | server command |
| Delivery | salesOrderId | salesOrders | status filter in `delivery-view.tsx` | delivery projection | delivery permission | projected state | status/open quantity varies | none | runtime snapshot | no eligible order | server command |
| Delivery | driverId | employees | active + driver filter in view | delivery projection | delivery permission | projected state | active | driver | runtime snapshot | no driver | server command/overlap |
| Delivery | vehicleId | vehicles | active filter in view | delivery projection | delivery permission | projected state | active | none | runtime snapshot | no vehicle | server command/overlap |
| Inventory/count | warehouseId | warehouses | actor warehouse IDs in views | inventory projection | inventory permission | actor warehouseIds | active filtering varies | none | runtime snapshot | no warehouse | server scope/version |
| Inventory/count | productUnitId | productUnits | direct state mapping | inventory projection | inventory permission | projected state | varies by view | none | runtime snapshot | no product | server command |
| Workforce | employeeId | employees | direct state mapping | workforce/cash projection | workforce/cash permission | projected state | active filtering varies | assignment role varies | runtime snapshot | no employee | server command |
| Portal | productUnitId | productUnits/inventory | portal route catalog projection | customer projection | portal permission | linked customer | active + price/tax inference | none | server snapshot | empty catalog | server command |

## Current data-integrity observations

- Projection is the current authorization boundary, but a shared selector
  contract is not yet centralized in the canonical source.
- Active/scope/role filters are inconsistent across display forms.
- Portal visibility/orderability is inferred from current product fields and
  has not yet been converted to explicit policy in today's scope.
- Loading/empty/error behavior is mostly form-level feedback, not a shared
  read-model contract.

These are inventory findings for R-008+ and are not counted as today's missing
Gate 0/A evidence.

## R-010 P0 remediation result

| Field group | BEFORE root cause | FIX | AFTER data path | Test | Result |
|---|---|---|---|---|---|
| Customer/supplier/product forms | direct state-array mapping with inconsistent active/scope rules | `getSelectableCustomers`, `getSelectableSuppliers`, `getSelectableProducts` | server-projected `OperationsState` -> actor-aware selector -> entity authoritative `id` | `tests/selectors.test.ts`, `tests/phase1-r008-r014.test.ts` | PASS |
| Warehouse/count forms | view-local warehouse filtering, including fail-open when no assignment | `getSelectableWarehouses`; warehouse projection filters ids and fails closed | projected warehouse scope -> shared selector -> warehouse id | `tests/selectors.test.ts`, `tests/operations-projection.test.ts` | PASS |
| Delivery order/driver/vehicle forms | inline status filters; busy vehicles could still appear | `getEligibleSalesOrdersForDelivery`, `getAssignableDrivers`, `getAvailableVehicles` | projected state -> shared eligibility selector -> authoritative order/employee/vehicle id | `tests/selectors.test.ts` | PASS |
| Workforce/payment forms | direct employee list could include inactive/unscoped rows | `getSelectableEmployees` and role-filtered worker/driver selectors | projected state -> active/role/actor selector -> employee id | `tests/phase1-r008-r014.test.ts` | PASS |
| Purchase destination warehouse | hardcoded `wh-main` persisted for every warehouse destination; no warehouse selector in the form | carry explicit `warehouseId` through schema, command, server scope validation, and `getSelectableWarehouses` UI select | projected warehouse scope -> selector -> command `warehouseId` -> persisted purchase line | `tests/phase1-r008-r014.test.ts` invalid-id negative + same-id receipt | PASS |

All changed P0 selects now expose a disabled explicit no-eligible option and
disable submission when the read model is empty or a mutation is pending.
Loading/error are represented by the runtime sync status and global feedback;
no fallback/demo option is injected into a select.
