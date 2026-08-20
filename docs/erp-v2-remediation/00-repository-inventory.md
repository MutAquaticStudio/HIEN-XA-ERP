# R-002 Full Repository Inventory

Status: `REPOSITORY_INVENTORY=PASS`

## Top-level inventory

| Path | Current role |
|---|---|
| `src/` | Next.js app, operations domain, server application, identity, infrastructure, mobile, tracking |
| `tests/` | Vitest unit/characterization tests, integration suites, Playwright E2E suites |
| `supabase/` | database migrations and Supabase release artifacts |
| `cloudflare/` | Workers/D1/Cloudflare integration assets |
| `schema/` | schema and data-contract references |
| `reference/` | source/reference material used by the project |
| `docs/` | project and remediation evidence |
| `public/` | public web assets and manifest |
| `scripts/` | local/release helper scripts |
| `adr/` | architecture decision records |
| `odoo_addons/` | Odoo integration/add-on source |
| `package.json` / `package-lock.json` | scripts, dependency/runtime contract, lockfile |
| `next.config.mjs`, `wrangler.jsonc`, `vercel.json` | web/runtime/deployment configuration (not executed today) |
| `.env*.example`, `.dev.vars.example` | examples only; no secrets committed or changed today |

## Inventory checks

- Git branch and canonical SHA were verified before evidence collection.
- `package.json` scripts were enumerated; no lint script exists.
- `src/modules/operations`, `src/server/application`,
  `src/server/identity`, and persistence adapters were mapped.
- Web routes, mobile routes, integration suites, and browser suites were
  identified in the companion route/code/test maps.
- No production deployment, database migration, Cloudflare mutation, or
  generated artifact is part of the clean R-001 to R-007 checkpoint.
