# Implementation Notes

## 2026-07-16 bootstrap slice

The repository now contains a runnable Next.js application skeleton for the Phase 1 MVP.

Implemented first vertical slice (historical; the standalone screen and service were retired after the operations module became the canonical flow):

- Sales order review screen in Vietnamese.
- A server action and domain service for confirming a demo sales order.
- Permission, optimistic version, quantity, pricing snapshot, idempotency, and audit checks.
- Unit tests for the sales confirmation invariants.

The standalone `sales-workbench` and `src/modules/sales` demo branch are no longer part of the application. Sales confirmation now runs through `src/modules/operations/service.ts`, the same workflow used by the ERP screens and backend command tests.

Important constraints:

- This is not a database-backed production posting flow yet.
- Customer receivable ledger entries are intentionally not created at sales-order confirmation. Current MVP policy says receivables arise when delivery is confirmed.
- The in-memory idempotency store is only for local prototype behavior. It must move to the `idempotency_keys` table before production posting endpoints.

Next slice recommendation:

1. Add Supabase schema migrations for customers, products, units, sales orders, audit logs, and idempotency keys.
2. Replace demo data with server-loaded data behind authorization.
3. Add sales order draft create/edit flow with Zod validation and React Hook Form.
4. Add delivery confirmation as the first flow that posts receivable ledger entries.

## 2026-07-16 broad MVP prototype

The app now includes a wider demo prototype for the requested operating modules:

- Role-style app shell with modules for overview, master data, sales, procurement, delivery, inventory, receivables, payables, workforce, import, and reporting.
- Server-backed in-memory demo operations through `src/modules/operations/demo-store.ts`.
- Domain workflow service in `src/modules/operations/service.ts`.
- End-to-end demo flow:
  1. Confirm sales order.
  2. Allocate source lines to warehouse and direct supplier delivery.
  3. Post goods receipt into warehouse.
  4. Confirm supplier-to-customer direct delivery.
  5. Complete warehouse delivery.
  6. Confirm and allocate customer payment.
  7. Confirm supplier payment.
  8. Approve work output.
  9. Post piece-rate compensation.
  10. Pay employee.
  11. Resolve import issues.

Rules covered by tests:

- Direct delivery does not create warehouse inventory movement.
- Inventory posting retry with the same idempotency key does not duplicate movement.
- Customer payment allocation never exceeds payment amount.
- Compensation requires approved output and participant shares equal total compensation.
- The demo flow produces balances from append-only ledgers and movements.

Current limitations:

- Data is still demo/in-memory. It is intentionally not a production persistence layer.
- Server action state is suitable for local testing only; production must move state, idempotency keys, audit logs, and ledgers into Supabase PostgreSQL transactions.
- Auth is represented by a demo owner actor. Real Supabase Auth/RBAC/RLS is still required.
- Import review is a workflow prototype; it does not parse `reference/Demo.xlsx` yet.

## 2026-07-16 backend foundation

Added a deeper backend foundation:

- Supabase/Postgres migration at `supabase/migrations/202607160001_backend_foundation.sql`.
- Core operational tables for parties, catalog, sales, procurement, inventory, delivery, receivables, payables, cash, workforce, compensation, import, audit, and idempotency.
- Read models/views for customer balance, supplier balance, stock balance, and employee balance.
- RLS enabled on all tables with read policies by active user/finance role. No client-side mutation policies were added for financial or inventory postings.
- Backend command layer with transaction and idempotency ports:
  - `src/server/application/operations-command-service.ts`
  - `src/server/application/ports.ts`
  - `src/server/infrastructure/memory-operations-backend.ts`
- The demo UI now goes through this backend command layer before domain mutation.

Backend tests cover:

- Idempotent command replay without second mutation.
- Transaction rollback when a command fails.

Production adapter still needed:

1. Supabase service-role repository/transaction implementation.
2. SQL RPC functions or server-only repository methods for posting workflows.
3. Real auth actor mapping from Supabase Auth to `app_users` and `employees`.
4. Database-level constraint tests run against local Supabase.

## 2026-07-16 draft creation workflows

Added server-backed create commands and React Hook Form entry screens for the operating modules:

- Master data quick create: customers, suppliers, product units, and employees.
- Draft sales order creation with customer, product unit, quantity, unit price, and VAT snapshot inputs.
- Draft purchase order creation with warehouse vs direct-customer destination.
- Delivery job creation assigned to a driver.
- Draft customer receipt and supplier payment vouchers.
- Submitted work order creation with draft compensation basis.
- Import issue creation for Excel review.

Safety notes:

- Create commands still run through the backend command service, permission checks, Zod server validation, idempotency records, and audit logging.
- Draft commands intentionally do not post inventory movements, cash transactions, customer/supplier ledger entries, or employee ledger entries.
- The command service now rejects reuse of the same idempotency key with a different request hash.

Tests added:

- Duplicate master-data guard with Vietnamese-insensitive comparison.
- Invalid quantity and missing direct-delivery customer guards.
- Work order draft creation without employee-ledger posting.
- Idempotent create-command replay and conflicting idempotency-key rejection.

## 2026-07-16 internal ERP framework layer

Added an ERP-style framework layer for the app:

- Generic ERP module and command metadata in `src/erp/framework/types.ts`.
- Registry builder and lookup/guard helpers in `src/erp/framework/registry.ts`.
- VLXD module pack in `src/modules/operations/erp-registry.ts`.

The registry now owns:

- Module menu order, labels, titles, subtitles, and icon keys.
- Bounded-context ownership and owned entity declarations.
- Read model declarations.
- Command metadata, permission names, command kind, criticality, audit event, idempotency, and transaction boundary.
- Workflow/state-machine metadata and important invariants.

Code paths now using the framework:

- The app shell navigation and workflow action labels/descriptions are derived from the ERP registry.
- Demo owner permissions are derived from the registry permission set.
- The backend command service rejects commands not registered in the ERP registry before mutation.

Tests added:

- Registry has every current domain command.
- Owner permissions and workflow menus are derived from the registry.
- Command ownership resolves to the expected bounded-context module.
- Duplicate module IDs and duplicate command definitions are rejected.

## 2026-07-16 master-data driven dropdowns

Adjusted form behavior so purchase and operational forms consume master data through dropdowns:

- Supplier dropdowns now show supplier code and supplier name.
- The Purchase Order form includes a quick supplier entry form; once saved, the supplier becomes part of the same supplier master list used by dropdowns.
- Product dropdown labels now include product code, product name, and unit.
- Sales, purchase, and workforce forms show a read-only product reference panel with product code, product name, unit, and current warehouse stock for the selected product unit.

## 2026-07-16 Odoo-style ERP compatibility pass

Added an Odoo-style metadata layer on top of the internal ERP registry:

- `src/erp/framework/odoo.ts` generates Odoo-like `ir.model`, `ir.actions.act_window`, `ir.ui.menu`, security groups, and record rules.
- `src/modules/operations/erp-registry.ts` exports `operationsOdooMetadata` for the VLXD addon-like module pack.
- Current addon name is `vlxd_operations`.
- Model names follow Odoo-style dot names such as `vlxd.sales.order`, `vlxd.purchase.order`, `vlxd.customer.ledger.entry`, and `vlxd.product.unit`.

UI refinements from this pass:

- App navigation is backed by registry-generated window actions.
- The top action bar now behaves more like Odoo: breadcrumb and a search box where the screen implements filtering.
- Master data search filters customers, suppliers, product units, and employees with Vietnamese-insensitive matching.
- Odoo view modes remain available in generated metadata as the addon mapping contract; the web UI does not render inactive view-mode controls.

Important boundary:

- This is Odoo-compatible structure, not a runtime Odoo server. The current Next.js app keeps server-side domain services for VLXD invariants. If we later migrate to real Odoo addons, the generated metadata is the mapping contract for Odoo XML/Python models and access files.

## 2026-07-16 Odoo addon scaffold

Added a real Odoo-style addon scaffold under `odoo_addons/vlxd_operations`:

- `__manifest__.py` with `base` and `mail` dependencies.
- Odoo model classes for master data, sales orders, purchase orders, inventory movements, customer/supplier ledgers, workforce, compensation, employee ledger, and import issues.
- Odoo security groups and `ir.model.access.csv`.
- Basic Odoo menu and `ir.actions.act_window` XML.

The scaffold captures the most important invariants in Odoo-style code:

- Supplier/product/customer codes are unique per company.
- Sales and purchase quantities must be positive.
- Direct delivery purchase lines require a customer.
- Inventory movements and customer/supplier ledger entries are append-only and block direct delete.

This gives us a migration path toward a real Odoo addon while the current Next.js demo remains the runnable prototype.

## 2026-07-16 workflow completion pass

Made the runnable ERP workflow less demo-hardcoded:

- Operations now select the next eligible document instead of only `so-001`, `po-001`, `cp-001`, `sp-001`, `wo-001`, and `ep-001`.
- Sales source allocation now works per line: existing stock first, then matching warehouse purchase order, then matching direct-delivery purchase order.
- Goods receipt posting uses an idempotent posting key derived from the purchase line and updates purchase status from received quantities.
- Direct delivery links purchase lines to allocated sales lines, creates payable/receivable entries, and still avoids warehouse movements.
- Customer payment allocation now respects amounts already allocated by earlier payments.
- Work order approval, compensation posting, employee payment, and import issue resolution now advance the next eligible record.

UI completion from this pass:

- Sales, purchase, delivery, receivable, payable, workforce, and import tables now expose row-level workflow actions.
- Supplier payments and employee payments are visible as operational tables, not only through side forms.
- Table cells support badges and action buttons while preserving mobile overflow behavior.

Tests added:

- Workflow can continue for a newly created sales order after the seeded demo order has been delivered.
- The new flow still preserves append-only movement and ledger behavior from the existing tests.

## 2026-07-16 full ERP scope pass

Project direction is now tracked as a complete ERP operating system rather than a minimal slice:

- `PROJECT_BRIEF.md` now defines a Full ERP baseline.
- `docs/11_ROADMAP_AND_BACKLOG.md` changes Phase 1 to the Full ERP operating core.
- `src/modules/operations/full-erp-scope.ts` adds a structured capability registry for identity, parties, catalog, sales, procurement, inventory, delivery, receivables, payables, cash, workforce, compensation, reporting, import, and audit.
- The Overview screen now includes a production-readiness table showing the current operational kernel and remaining hardening work.

Important boundary:

- A complete ERP target does not mean bypassing financial safety. Production posting still requires durable PostgreSQL persistence, Supabase Auth/RLS, server-side authorization, audit tables, idempotency tables, optimistic locking, migration scripts, and end-to-end import reconciliation before real business data is trusted.

## 2026-07-16 backend command hardening pass

Strengthened the application-service layer that sits in front of document creation and posting commands:

- `OperationsCommandService` now computes the idempotency request hash on the server from canonical JSON instead of accepting a caller-supplied hash.
- Reusing the same idempotency key with an equivalent payload replays the stored response even if JSON field order differs.
- Reusing the same idempotency key with a different payload is rejected before mutation.
- The service now resolves command metadata from the ERP registry and checks the actor permission before loading mutable state.
- Short idempotency keys are rejected at the service boundary.

Tests added/updated:

- Stable idempotency hash tests for equivalent payloads and invalid JSON-like values.
- Application-service tests for replay without duplicate mutation, rollback on failure, and permission rejection before audit/state changes.

Production implication:

- The current memory backend still simulates transactions locally, but the command-service contract now matches the planned Postgres/Supabase idempotency table: command endpoints should provide `idempotencyKey`; the server owns request hashing, permission checks, transaction execution, audit, and response replay.

## 2026-07-16 realtime dashboard pass

Added near-realtime dashboard synchronization on top of the current command-service backend:

- `MemoryOperationsBackend` now tracks a monotonic `revision` for committed state changes and reset operations.
- `getOperationsSnapshotAction` exposes a read-only snapshot with `state`, `revision`, `syncedAt`, and backend `source`.
- `OperationsApp` polls the snapshot every 3 seconds and updates local state only when the server revision changes.
- The Overview dashboard shows a realtime strip with sync status, last synced time, and revision.
- Mutation actions now return revision metadata so the current tab updates immediately after create/post/reset.

Important boundary:

- This is near-realtime polling for the current in-memory backend. The production version should replace the polling transport with Supabase Realtime or a Postgres-backed event/notification channel while keeping the same snapshot/revision contract.

## 2026-07-16 cross-module invariant hardening pass

Added a reusable ERP invariant validator across unfinished hardening areas:

- `src/modules/operations/invariants.ts` validates sales source links, procurement quantities, inventory posting keys, negative stock, direct delivery movement blocking, receivable allocation limits, payable/cash amount sanity, workforce output ranges, posted compensation totals, duplicate output compensation, and import issue shape.
- `OperationsCommandService` now calls `assertOperationsInvariants(result.state)` before saving state and recording idempotency.
- If a command would leave state invalid, the transaction is rejected before commit/replay storage.

Tests added:

- Seed operating state must satisfy all invariants.
- Customer payment over-allocation is rejected.
- Supplier direct delivery cannot create warehouse receipt movement.
- Posted compensation split must equal the batch total.
- Import issues must have valid sheet, row, and message.
- The command service does not bump backend revision when invariant validation rejects a command result.

Production implication:

- When the memory backend is replaced by Postgres/Supabase, the same invariant validator should run inside the database transaction after domain mutation and before commit. Critical invariants should also be mirrored with database constraints where possible.

## 2026-07-16 database invariant hardening pass

Added `supabase/migrations/202607160002_erp_invariant_hardening.sql` to mirror critical rules into PostgreSQL:

- Append-only protections for inventory movement lines, financial ledgers, cash transactions, customer payment allocations, inventory postings, and audit logs.
- Deferred inventory triggers that block negative stock and prevent supplier direct delivery from creating warehouse receipt movements.
- Deferred purchase destination triggers requiring allocated destination quantity to match ordered quantity.
- Deferred customer payment allocation triggers preventing over-allocation and mismatched customer ledger targets.
- Supplier payable and cash account balance guards.
- Deferred compensation triggers ensuring posted batch lines equal the batch total and a work output is not posted into more than one posted batch.
- Attachment metadata hardening: SHA-256 checksum, MIME type, byte size, and unique bucket/object path.
- `erp_revisions` plus statement-level bump triggers and `pg_notify` payloads for a Supabase Realtime-ready dashboard stream.

Important boundary:

- The migration has static test coverage in `tests/supabase-hardening-migration.test.ts`. It has not been applied against a live Supabase database in this workspace because no local `psql`/Supabase database connection is configured here.

## 2026-07-16 PWA offline-read foundation

Added an installable PWA shell without enabling unsafe offline financial posting:

- `src/app/manifest.ts` declares the ERP app manifest.
- `public/sw.js` caches the app shell, icon, manifest, and Next static assets for GET/read-only access.
- Navigation uses network-first fallback to the cached app shell.
- Non-GET requests are ignored by the service worker, so server actions and financial/document posting commands are never queued or replayed offline.
- `OperationsApp` registers the service worker on the client when supported.

Important boundary:

- This is not full offline workflow. Local drafts and queued photos still need explicit schema/versioning and must continue to block offline-posting of financial documents.

## 2026-07-16 monthly report export

Added a read-only monthly report export for the Reporting module:

- `src/modules/operations/monthly-report.ts` builds a month-scoped report from sales orders, customer/supplier ledgers, cash transactions, inventory movements, employee ledger entries, and open import issues.
- The report does not store any derived totals back into operating state; it derives totals from existing documents and append-only entries.
- The Reporting screen now has a month picker and export action. The CSV includes a UTF-8 BOM, a "Dashboard tháng" section at the top, and sectioned Vietnamese CSV content for Excel.
- The same export action also downloads a self-contained HTML dashboard file for the selected month, suitable to attach or open directly in a browser.
- Tests cover month filtering, CSV output, and default month derivation.

Important boundary:

- This is a browser-side CSV export over the current in-memory operating state. Production should move heavy monthly reports to Postgres views/materialized views and keep the same read-only derivation rule.

## 2026-07-17 operational completion and hardening pass

The runnable ERP kernel now uses an atomic file backend at `.data/operations.json` instead of process memory. State, revision, audit entries, and idempotency responses survive backend re-instantiation and local server restarts. The application-service transaction contract remains compatible with a future PostgreSQL adapter.

Completed runtime workflows in this pass:

- Multi-line sales and purchase drafts, explicit purchase confirmation, partial receipts, partial warehouse deliveries, and partial direct deliveries.
- Inventory transfers as linked out/in movements, stock-count adjustments, reversal guards, warehouse scope authorization, and corrected moving weighted-average valuation based on signed inventory value.
- Vehicle master data, required vehicle assignment, and server/database guards against active driver or vehicle overlap on the same day.
- Delivery recipient/evidence, failure reason, direct-delivery posting groups, and direct-delivery reversal blocked by active receivable allocation or supplier payment.
- Customer, supplier, internal cash, employee payment, and employee advance documents with draft/confirm/reverse states and cash/sub-ledger posting-pair invariants.
- Real `.xlsx` dry-run parsing with SHA-256 duplicate protection and issue-to-import-job linkage. A batch becomes reviewed only after every linked issue is resolved or a warning is explicitly ignored.
- Monthly recognized revenue, warehouse/direct COGS, gross profit, gross-margin rate, inventory transfers/adjustments, employee advances, and audit log export. The ZIP contains CSV, a self-contained HTML dashboard, and a manifest.
- Administrator and Viewer roles, warehouse scope, disabled unauthorized forms, and production fail-closed role resolution unless a server-locked role or explicit simulation flag is configured.

Database blueprint added in `supabase/migrations/202607170001_operational_completion.sql`:

- Vehicle capacity and unique normalized plate number.
- Active driver/vehicle daily scheduling constraints.
- Delivery completion evidence checks.
- Analytical ledger metadata and posting group indexes.
- Durable cash voucher, employee payment, and employee advance documents with RLS and revision triggers.

Verification after this pass:

- TypeScript typecheck passes.
- 105 Vitest tests pass across 16 files.
- `npm audit --audit-level=moderate` reports 0 vulnerabilities.
- Next.js production build succeeds.
- Browser QA opened every operating module, exercised the cash receipt confirm/reverse lifecycle, and found no console warnings or errors.
- Mobile QA at 390 x 844 confirms no page-level horizontal overflow, no clipped operating text, a 16px minimum content font, and 48px minimum button height, including the five-panel Workforce screen.
- The internal ERP completion/progress table was removed from the Overview screen; deployment gaps remain documented and tested without exposing implementation notes to store users.

Remaining production boundaries are explicit: Supabase credentials and a live PostgreSQL adapter are not configured in this workspace; workbook import currently profiles and reviews data but does not post suspicious legacy rows into financial or inventory ledgers; receipt images use the local private file adapter in this workspace and should move behind Supabase Storage with signed access in production.

## 2026-07-17 document unit conversion

- Sales and purchase lines now store a frozen document-unit snapshot alongside canonical stock quantity and unit amount.
- The `reference/Demo.xlsx` unit audit remains migration evidence only; runtime forms now use the store-managed unit catalog.
- Partial receipt and delivery inputs use the document unit while server operations post canonical stock quantities.
- Purchase and sales tables show both document progress and stock-unit progress when the factor differs from one.
- PostgreSQL migration `202607170002_document_unit_conversion.sql` persists both representations and checks quantity/price reconciliation.
- Automated coverage includes fixed and variable document units, missing actual-quantity rejection, invalid snapshot rejection, and receipt posting in canonical stock units with the matching supplier payable.

## 2026-07-17 configurable purchase units

- The previous fixed dropdown sourced from `Demo.xlsx` was removed from runtime UI.
- Unit definitions are now server-managed master data with add/delete commands, authorization, idempotency, and audit logs.
- Purchase unit settings are product-specific and versioned. No purchase unit or conversion is seeded: the store creates names such as `Tấn`, `Tạ`, or `Xe` and chooses fixed or actual-quantity calculation itself.
- The server rejects unconfigured purchase units, fixed factors that differ from current configuration, and variable units without a positive actual stock quantity.
- Deleting a non-base unit removes its current conversions but leaves historical document snapshots unchanged; base stock units cannot be deleted.
- A two-step reset command removes all current purchase units and calculation rules while preserving stock base units and historical document snapshots; the command is authorized, idempotent, optimistic-count protected, and audited.
