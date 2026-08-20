# R-044 — Final RBAC and security matrix

Date: 2026-08-20
Reviewed revision: `6046c94b941ecd2eb9f593e3e76f9635db6eb107`
Branch: `codex/erp-v2-final-gates-phase6-20260820`

## Authorization regression pack

```text
npm.cmd exec vitest run tests/identity-auth.test.ts tests/security-hardening.test.ts tests/role-dashboard.test.ts tests/role-projection-hardening.test.ts tests/operations-actions.test.ts tests/web-mutation-origin.test.ts tests/mobile-api-routes.test.ts tests/mobile-sales-procurement-route-boundary.test.ts tests/mobile-finance-workforce-route-boundary.test.ts tests/mobile-inventory-delivery-routes.test.ts tests/production-persistence.test.ts tests/next-security-headers.test.ts
```

Result: `12 files / 51 tests passed` in safe local fixtures. The pack covers signed session and native bearer validation, cookie controls, CSRF/origin checks, role projection, command authorization, mobile route boundaries, production-persistence guards and response security headers.

## Server-side authorization matrix

| Role / actor class | Server-authoritative scope exercised by the current design |
| --- | --- |
| Owner / administrator | Full ERP module visibility and command authority; identity administration is server-guarded and administrators cannot assign owner/administrator roles. |
| Accountant | Financial, approval, audit and reporting surfaces; financial attachment visibility is limited to owner, administrator and accountant. |
| Sales | Sales, delivery and receivables operations; command permission registry remains the enforcing boundary. |
| Warehouse | Inventory/procurement/delivery data is filtered to assigned warehouse IDs and target warehouse scope is checked before mutation. |
| Dispatcher | Delivery and assignment workflow permissions; see the validated attachment-scope finding below. |
| Supervisor / worker / driver | Assignment, work, compensation and delivery paths require server role/employee/assignment checks; worker and driver projections narrow records to their own work. |
| Viewer | Read-only role with no listed mutation permissions. |
| Customer / supplier | Portal services derive party identity from the signed-in account and validate the owning customer/supplier relationship before returning or mutating documents. |

The normal enforcement chain is: signed session or verified bearer token -> identity role/module projection -> `OperationsActor` permission and warehouse scope -> command service transaction/invariant/idempotency/audit. UI visibility is not treated as authorization.

## Static security scan

Completed Codex Security source scan: `231eab8e-a658-4829-b936-cb25495242f6`.

Scope was source-only and deliberately partial: three high-risk review surfaces were completed, while staging, production, secrets, external services and unreviewed repository surfaces were excluded. The canonical scan reports `1 high` and `4 medium` validated findings. It does not establish deployed exploitability, but each finding is sufficient to block Gate E until fixed and independently retested.

| ID | Severity | Validated control failure | Root evidence |
| --- | --- | --- | --- |
| HX-SEC-001 | High / CWE-400 | The public native login route invokes synchronous credential verification without the identifier/client throttle used by the browser login path. | `src/app/api/mobile/auth/login/route.ts:12-15`; `src/server/identity/identity-service.ts:82-101`; `src/server/identity/crypto.ts:50-57` |
| HX-SEC-002 | Medium / CWE-918 | An authenticated user can save an arbitrary HTTPS Web Push endpoint then trigger delivery to it; no provider host or resolved-address restriction is present. | `src/app/api/notifications/subscription/route.ts:7-14`; `src/app/api/notifications/test/route.ts:5-13`; `src/server/notifications/notification-service.ts:212-223` |
| HX-SEC-003 | Medium / CWE-770 | Unique push subscriptions have no per-user cap and test delivery fans out with unbounded `Promise.all`. | `src/server/notifications/supabase-push-notification-store.ts:34-55`; `src/server/notifications/notification-service.ts:105-141` |
| HX-SEC-004 | Medium / CWE-400 | Browser XLSX dry-run loads and parses an authenticated user's workbook before the import permission check in the command layer. | `src/app/actions.ts:689-739`; `src/modules/operations/create-commands.ts:74-93` |
| HX-SEC-005 | Medium / CWE-639 | The native attachment helper lets any dispatcher read every non-financial attachment by UUID, regardless of record relationship; the browser policy is stricter. | `src/server/mobile/mobile-private-attachment-service.ts:44-56`; `src/app/api/mobile/attachments/[id]/route.ts:9-29` |

## Required remediation before a new release gate

1. Rate-limit the mobile login route before KDF work with durable/edge enforcement.
2. Restrict Web Push endpoints to known providers, validate egress destinations after DNS resolution, and add subscription quotas with bounded delivery concurrency.
3. Authorize the browser import action before reading any file bytes and impose archive-expansion/time/concurrency limits.
4. Centralize attachment authorization and require an explicit dispatcher relationship to each requested record.
5. Add regression tests for all five controls, then rerun the full Phase 6 gate in an authorized non-production environment.

```text
LOCAL_RBAC_REGRESSION=PASS (51 tests)
STATIC_SECURITY_SCAN=FAIL (1 high, 4 medium validated findings)
R-044=FAIL
```
