# ERP V2 route map (R-022)

All new catalog routes call `requireCatalogAccess()` and project the current
operations snapshot for the authenticated identity before selecting a record.
Missing IDs call `notFound()`; an ID outside the actor's projection is therefore
not disclosed as an internal record.

| Current surface | V2 route | Status |
|---|---|---|
| Master Data customer tab in `/` workbench | `/catalog/customers` | list + URL search/status filter |
| Customer row in workbench | `/catalog/customers/[id]` | addressable detail, derived debt/payment summary |
| Master Data supplier tab in `/` workbench | `/catalog/suppliers` | list + URL search/status filter |
| Supplier row in workbench | `/catalog/suppliers/[id]` | addressable detail, derived payable/payment summary |
| Master Data product tab in `/` workbench | `/catalog/products` | list + URL search/status filter |
| Product row in workbench | `/catalog/products/[id]` | addressable detail, accepted unit conversion presentation |
| Master Data warehouse tab in `/` workbench | `/catalog/warehouses` | list + URL search/status filter |
| Warehouse row in workbench | `/catalog/warehouses/[id]` | addressable stock/movement detail, read-only balance |
| Master Data vehicle tab in `/` workbench | `/catalog/vehicles` | list + URL search/status filter |
| Vehicle row in workbench | `/catalog/vehicles/[id]` | addressable delivery detail without telemetry fabrication |
| Master Data employee tab in `/` workbench | `/catalog/employees` | list + URL search/status filter |
| Employee row in workbench | `/catalog/employees/[id]` | addressable work/compensation detail, read-only payable |
| Existing operational workbench | `/` with in-memory module navigation | preserved compatibility surface |
| Phase 3 dashboard | `/dashboard` | new URL-addressable KPI/chart read-only surface |

## Route contract

- Direct URL, bookmark, and browser back/forward use standard Next App Router
  navigation; list rows use real links.
- Search and status filters are URL query parameters (`q`, `status`), so a
  filtered list is shareable and reload-safe.
- Customer/supplier portal roles are redirected to their existing portal; other
  roles must have the `masterData` module selected by the identity projection.
- Detail pages expose only fields present in the projected state. Derived
  balances are read from `reconcileOperationsState`; there are no editable
  balance controls.
- The existing `/khach-hang`, `/nha-cung-cap`, `/dat-hang`, `/cash/*`, tracking,
  admin and mobile routes are unchanged.
