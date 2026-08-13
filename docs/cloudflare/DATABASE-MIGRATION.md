# Database Migration and Compatibility

## Current decision

Cloudflare D1 is the current runtime persistence target. The application uses runtime-document compare-and-swap, idempotency records, attachment metadata, background job records and tracking tables defined in `cloudflare/migrations/0001_cloudflare_runtime_foundation.sql`.

## PostgreSQL and Supabase

- Supabase migrations, adapters and the `postgres` package are historical/legacy inputs.
- They must not be removed merely because Cloudflare is active; removal requires a Worker-bundle inspection, data migration evidence, replacement tests and rollback approval.
- No browser receives database credentials. No Cloudflare secret is committed.

## Compatibility assessment

| Area | D1 status | Notes |
| --- | --- | --- |
| Runtime documents and CAS | Compatible | Primary live model |
| Idempotency and attachment metadata | Compatible | D1 schema exists |
| Tracking session/point retention | Compatible | D1 schema exists |
| Financial posting and inventory movement | Requires command-service evidence | Never direct client SQL |
| PostgreSQL views/materialized views | Not adopted | Replace only with explicit D1 read model design if needed |
| PostgreSQL locks/functions | Unknown/legacy | Do not port blindly |

## Guardrails

- No D1-to-PostgreSQL or PostgreSQL-to-D1 production migration in this phase.
- No Hyperdrive configuration placeholder is added because no approved PostgreSQL target exists.
- Every change affecting money, stock or payroll remains server-authorized, idempotent, version-checked and audited.
