# ADR-008: Cloudflare application platform

- Status: Accepted
- Date: 2026-08-02
- Supersedes: ADR-002 after the controlled production cutover succeeds

## Decision

Cloudflare is the target application platform:

- Next.js modular monolith runs on Cloudflare Workers through OpenNext.
- D1 is the server-side transactional persistence layer.
- R2 stores private attachments and delivery evidence.
- Queues and scheduled Workers run notifications, retention and other background work.
- Durable Objects are permitted only for short-lived coordination such as live tracking sessions; durable financial state remains in D1.
- Identity remains invite-only and is enforced by the server. Mobile continues to use Bearer credentials and web continues to use secure cookies.

## Transaction rules

- Financial, inventory and compensation mutations remain inside one server-side command boundary.
- Runtime document migration uses compare-and-swap on `revision`; retry cannot create duplicate postings.
- Normalized ledgers and inventory movements stay append-only and corrections use reversal.
- D1, R2 and Queue writes are coordinated through an outbox/idempotency record. A Queue message never becomes the source of truth for a financial posting.

## Migration boundary

The current Supabase deployment remains the source of truth until all of the following are true:

1. Cloudflare staging has passed schema migration and integration tests.
2. Runtime data, identity, attachments, chat, push and GPS have been copied and reconciled.
3. Inventory, receivables, payables, cash and compensation differences are all zero.
4. Backup and rollback have been rehearsed.
5. The Cloudflare Preview deployment has passed role-based UAT.

There is no dual-write period. DNS is changed only after a maintenance window starts and the source data is frozen.

## Consequences

- ADR-001 and ADR-003 through ADR-007 remain in force.
- Supabase migrations are historical migration inputs, not the Cloudflare schema source.
- Cloudflare staging resources must never contain production secrets or real customer data.
- If R2 or another required binding is unavailable, production deployment fails closed.
