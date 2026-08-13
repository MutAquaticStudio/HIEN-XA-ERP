# Odoo Strangler Plan

## Boundary

`odoo_addons/vlxd_operations` is retained as a legacy domain reference. It is not part of Next.js, OpenNext, Cloudflare Worker, staging deploy or production runtime.

## Domain mapping

| Legacy reference area | Cloudflare-native ownership | Status |
| --- | --- | --- |
| Master data | catalog and parties application services | Native |
| Sales and procurement | sales/procurement command services | Native |
| Inventory and ledgers | inventory/receivables/payables/cash services | Native |
| Workforce | workforce/compensation services | Native |
| Import and audit | import/audit services | Native |
| Odoo menus/views/security XML | UI/reference only | Legacy |

## Rules

- No Worker may import Odoo Python, XML, PostgreSQL ORM, Odoo HTTP internals or Linux runtime assumptions.
- Future migrations use explicit typed contracts and snapshot/reconciliation tests, not shared database tables.
- Keep legacy source until every required domain contract has an approved replacement and rollback plan.
