# Phase 1 shared read models (R-008)

Status: `R-008=PASS`

The canonical source is `src/modules/operations/selectors.ts`. Selectors take
the server-derived `OperationsState` and, where scope matters, the
server-derived `OperationsActor`. They return the existing entity objects;
option values are never copied or re-keyed.

| Selector | Source | Actor/context | Active/eligible rule | Consumers |
|---|---|---|---|---|
| `getSelectableCustomers` | `state.customers` | actor/customerId | active; linked customer actor is exact-id only | sales, receivables, procurement direct-delivery |
| `getSelectableSuppliers` | `state.suppliers` | actor/supplierId | active; linked supplier actor is exact-id only | procurement, payables, catalog |
| `getSelectableProducts` | `state.productUnits` | projected state | active only | sales, procurement, inventory, workforce, count |
| `getSelectableWarehouses` | `state.warehouses` | actor/warehouseIds | active; warehouse assignment is exact and fail-closed | inventory, count |
| `getSelectableEmployees` | `state.employees` | actor/employeeId/roleType | active; worker actor is self-only | workforce/payment |
| `getAssignableWorkers` / `getAssignableDrivers` | `state.employees` | actor + roleType | active role match; authoritative employee id | workforce/delivery |
| `getAvailableVehicles` | `state.vehicles` + `state.deliveryJobs` | current state | active and not assigned/loading/in-transit | delivery |
| `getEligibleSalesOrdersForDelivery` | `state.salesOrders` + `state.deliveryJobs` | actor/warehouseIds | allocated/partial, open warehouse quantity, no active job, warehouse scope | delivery |
| `getSelectableUnitDefinitions` | `state.unitDefinitions` | projected state | active only | purchase-unit settings |

There is no fallback/demo row. Empty read models render explicit disabled
"không có ... đủ điều kiện" options and disable the command submit button.
Server commands still re-check ids, role, scope, state and version; selectors
are a UI/read-model contract, not an authorization bypass.
