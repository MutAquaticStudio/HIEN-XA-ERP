# R-044 — Security remediation record

Date: 2026-08-20
Base revision: `b979d91b9ca7209a171a14207ce33824a98baf4f`
Final remediation-diff scan: `5d62914f-d93c-4b03-9c8f-94542f8bfa97` (complete coverage, zero findings, no warnings)

## Applied changes

| Finding | Minimal remediation | Regression proof |
| --- | --- | --- |
| HX-SEC-001 | Added the existing shared identifier/client throttle before mobile credential verification; record failure after a failed authentication and success only after a successful one. | `tests/mobile-api-routes.test.ts` proves the pre-auth control, failure record, and success record. |
| HX-SEC-002 | Added a strict vendor hostname policy for Web Push registration, service entry, and delivery sink. It accepts only HTTPS endpoints without user-info or an explicit port for FCM, Mozilla Push, or Apple Web Push. | `tests/partner-api-routes.test.ts` rejects arbitrary HTTPS before persistence; `tests/notification-security.test.ts` validates provider, link-local, and port cases. |
| HX-SEC-003 | Limited subscriptions to five per user per channel in both stores and replaced unbounded identity/delivery fan-out with bounded concurrency. | `tests/supabase-runtime-stores.test.ts` covers cap and refresh; `tests/notification-security.test.ts` proves the concurrency helper limit. |
| HX-SEC-004 | Required `import.create_dry_run` in the browser Server Action before any workbook bytes are read. | `tests/import-workbook-action.test.ts` proves unauthorized `arrayBuffer` is never called and preserves the authorized real-workbook path. |
| HX-SEC-005 | Removed dispatcher-wide operational attachment access while retaining explicit uploader, driver/helper, customer, and elevated finance/admin conditions. | `tests/mobile-private-attachment-route.test.ts` proves a dispatcher gets 403 without a storage read. |

## Invariant check

- No financial, inventory, cash, or accounting mutation logic changed.
- The implementation does not use client-supplied role, tenant, customer, supplier, warehouse, or attachment scope as authorization.
- Existing owner/administrator/accountant document policy and record-scoped uploader/driver/customer access remain server-side.
- Existing command authorization, idempotency, audit, and persistence boundaries are unchanged.
- No migration, staging mutation, production-data read/mutation, or deployment was executed.

## Evidence and limits

The final scanner reviewed all nine changed production files in the stable remediation diff and reported no new findings. Focused dynamic tests prove the five original control paths. This local review does not claim deployed rate-limit distribution, provider DNS behavior, external egress policy, staging data, or production behavior; none were accessed in this task.

```text
FINAL_DIFF_SECURITY_SCAN=PASS
SCAN_ID=5d62914f-d93c-4b03-9c8f-94542f8bfa97
SCAN_COVERAGE=complete
SCAN_FINDINGS=0
R-044=PASS
```
