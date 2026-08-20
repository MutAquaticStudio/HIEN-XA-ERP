# Current dropdown inventory — 2026-08-20

Baseline finding: forms rebuilt active filters locally and document unit options included arbitrary active unit definitions. This created a path for a unit name/factor that was not product-configured.

Review-branch remediation:
- Shared selectors now expose getSelectableCustomers, getSelectableSuppliers, getSelectableProducts, getProductUnits, getSelectableWarehouses, getAssignableWorkers, getAvailableVehicles, and getCustomerPortalCatalog.
- /dat-hang consumes getCustomerPortalCatalog.
- Document unit options are limited to the product base unit plus configured product conversions.
- Sales commands reject non-base units without a matching fixed product conversion.
- Vehicle selector excludes active assigned/loading/in_transit jobs.
- Selector and conversion tests were added, but not run remotely.
