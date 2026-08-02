# Production Cutover Runbook

## Goal

Move the ERP source of truth from the server-only runtime document to normalized
Supabase PostgreSQL without dual writes or silent fallback.

## Required gates

1. Create and verify a database backup and record its immutable reference.
2. Run the full migration chain on a disposable staging project.
3. Export one fixed runtime revision with `OperationsCutoverRehearsal` and create
   an `OperationsCutoverManifest`. This read-only step does not write to the
   runtime document. An authenticated identity administrator can retrieve the
   current manifest from `GET /api/admin/cutover-rehearsal` for the controlled
   maintenance checklist.
4. Validate domain invariants, legacy id mapping, stock, receivables, payables,
   employee balances, cash, allocations, audit and attachments.
   Legacy IDs are deterministically mapped before any target row is loaded;
   records without stable IDs fail the rehearsal instead of receiving random UUIDs.
   Apply the normalized schema-delta migration before staging load so portal,
   approval, supplier acknowledgement, attachment and audit data have an
   explicit relational destination.
5. Load the staging target in one serializable transaction. Do not update posted
   ledger, inventory, cash or audit rows after they have been loaded.
6. Record every gate in `erp_cutover_checkpoints`. Any difference fails the run.
7. Run database-backed RLS, RPC ACL, idempotency, concurrency and rollback tests.
8. Open the maintenance window, set `ERP_MAINTENANCE_MODE=read_only`, take a
   final snapshot, rerun reconciliation and only then switch the repository.
9. Mark the cutover run `production_active` after live route checks. The database
   guard then rejects any further `erp_runtime_documents` writes.

## Failure handling

- Before `production_active`, mark the rehearsal failed or cancelled and keep
  runtime traffic unchanged.
- After `production_active`, restore only through the documented backup and
  reversal runbook; never resume dual-write mode.
- Do not continue on missing attachments, unknown legacy ids, invariant errors,
  unequal balances, or unavailable RLS/security evidence.

## Evidence required for release

- Backup reference and verified restore result.
- Source revision and SHA-256 checksum.
- Reconciliation manifest with zero differences.
- Database integration, full test, typecheck and build output.
- Supabase Advisor, Storage/RLS and Vercel live-route checks.

## Database integration harness

Use `npm run test:integration` only after creating a dedicated staging project
and loading the values from `.env.integration.example`. The harness refuses to
run without `ERP_RUN_INTEGRATION_TESTS=1`, a staging confirmation value, a
matching Supabase project reference, and non-production-looking endpoints.
