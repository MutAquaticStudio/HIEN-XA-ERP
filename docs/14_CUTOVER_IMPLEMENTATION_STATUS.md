# Cutover implementation status

## Purpose

This document records implementation coverage for the one-way migration from the
legacy runtime document to normalized Supabase PostgreSQL. It is not approval to
run a production cutover.

## Implemented planner boundaries

The following planners are intentionally partial and can run only through a
staging rehearsal executor with an approved source checksum and plan checksum:

- catalog, order, and delivery records
- inventory postings and append-only sub-ledgers
- payments, allocations, cash vouchers, cash transactions, and bank proof metadata
- audit logs and legacy idempotency markers

Each planner preserves legacy provenance and fails closed for missing required
mapping data. Executors do not use upsert to hide duplicate historical records.

## Explicitly deferred boundaries

The following records must not be silently omitted from a production cutover:

- attachment ownership, document links, approval requests, customer payment proof
  review provenance, supplier acknowledgements, and supplier delivery notices
- workforce work types, legacy work-order status policy, compensation rate
  snapshots, GPS location history, and compensation-to-ledger reconciliation
- communications, push subscriptions/outbox, delivery tracking sessions/points,
  import jobs, and identity/app-user bindings

## Production gates still required

1. A dedicated Supabase staging project with a disposable PostgreSQL database.
2. Applied migrations and a recorded Supabase Advisor/RLS/Storage review.
3. A unified cutover plan and staging executor covering every deferred boundary.
4. A PostgreSQL repository that replaces the runtime JSON CAS backend as the only
   production write path.
5. Supabase Auth invite-only identities and verified party/employee bindings.
6. A backup, maintenance window, read-only gate, reconciliation report, rollback
   runbook, and live route checks.

## Legacy idempotency behavior

The runtime source retains only key, operation, and summary. The cutover planner
therefore writes a deterministic legacy marker rather than inventing a historical
request or response. The future PostgreSQL command repository must return a clear
legacy-key reuse error for these markers and must never execute the mutation again.

## Current source of truth

Until every production gate above is complete and a cutover is formally approved,
the runtime document backend remains the live source of truth. PostgreSQL planner
artifacts are rehearsal-only and must not be dual-written.
