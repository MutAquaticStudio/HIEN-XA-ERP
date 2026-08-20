# R-004 Current Route and Surface Map

Status: `CURRENT_ROUTE_MAP=PASS`

## Public and identity routes

`/`, `/login`, `/invite/[token]`, `/recover-owner`, customer and supplier
login/routes, `/dat-hang`, `/khach-hang`, `/nha-cung-cap`, `/track/[token]`,
and delivery tracking routes.

## Operations surfaces

`/admin`, `/admin/theo-doi-don-hang`, `/cash/*`, `/trao-doi`, and the operations
workbench component surfaces for catalog, sales, procurement, receivables,
payables, delivery, inventory, workforce, reporting, audit, and import.

## API/mobile surfaces

`src/app/api/**` contains admin, operations, tracking, notification, and
mobile route handlers. `src/server/mobile/**` contains projected services for
sales, procurement, inventory/delivery, portal, cash/workforce, reporting,
catalog, import, audit, and management.

No route or UI behavior was changed for today's R-001 to R-007 checkpoint.
