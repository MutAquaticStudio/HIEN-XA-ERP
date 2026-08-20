# R-004 Current Dropdown Inventory

Status: `CURRENT_DROPDOWN_INVENTORY=PASS` (inventory only; no dropdown fix)

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
