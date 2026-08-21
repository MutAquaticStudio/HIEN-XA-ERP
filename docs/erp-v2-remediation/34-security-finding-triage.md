# R-044 — Security finding triage

Date: 2026-08-20
Base revision: `b979d91b9ca7209a171a14207ce33824a98baf4f`
Canonical pre-remediation scan: `231eab8e-a658-4829-b936-cb25495242f6`
Final remediation-diff scan: `5d62914f-d93c-4b03-9c8f-94542f8bfa97`
Final scan report: `C:\Users\TUYEN\AppData\Local\Temp\codex-security-scans-WuFFay\HIEN-XA-ERP-core-data\b979d91b9ca7209a171a14207ce33824a98baf4f_20260820T124129Z_qztykbb5\report.md`

## Disposition summary

| Metric | Count |
| --- | ---: |
| Findings total | 5 |
| High total | 1 |
| Medium total | 4 |
| `CONFIRMED` | 5 |
| `NOT_ACTIONABLE` | 0 |
| `NEEDS_REVIEW` | 0 |
| Confirmed findings fixed | 5 |
| Confirmed findings open | 0 |
| Unresolved blocking security items | 0 |

`CONFIRMED` means the original report's source/control/sink path was valid at the reviewed base. It does not assert staging or production exploitability. All five confirmed paths are remediated in the working-tree patch and the final source diff scan has zero findings.

## Finding-by-finding triage

### HX-SEC-001 — Unauthenticated mobile login can exhaust server resources with synchronous password hashing

- Original severity / CWE: High / CWE-400
- Original locations preserved: `src/app/api/mobile/auth/login/route.ts:12-15`; `src/server/identity/identity-service.ts:82-101`; `src/server/identity/crypto.ts:50-57`; browser reference `src/app/auth-actions.ts:43-52`.
- Classification: `CONFIRMED`; remediation state: fixed.
- Affected surface and boundary: unauthenticated `POST /api/mobile/auth/login` crossing into identity verification.
- Source -> sink: attacker-controlled identifier/password -> unknown-account dummy hash -> synchronous `scryptSync`.
- Original control failure: the mobile route bypassed the identifier and trusted-client limiter used by the browser action.
- Remediated control: the mobile route now calls `authenticationRateLimiter.assertAllowed` before `identityService.authenticate`, records failures only after authentication fails, and clears the relevant buckets on success.
- Reachability and proof: route tests exercise allow/success and allow/failure sequencing. Invalid payloads never invoke the throttle or authentication.
- Counterevidence / remaining boundary: input lengths were already bounded and known-account lockout existed. Distributed edge-rate enforcement was not exercised because no deployment was accessed; this is a non-production proof boundary, not the original missing-route control.

### HX-SEC-002 — Authenticated users can register arbitrary HTTPS endpoints that the server later contacts

- Original severity / CWE: Medium / CWE-918
- Original locations preserved: `src/app/api/notifications/subscription/route.ts:7-14,35-43`; `src/app/api/notifications/test/route.ts:5-13`; `src/server/notifications/notification-service.ts:205-223`.
- Classification: `CONFIRMED`; remediation state: fixed.
- Affected surface and boundary: authenticated notification registration crossing into server-to-provider Web Push egress.
- Source -> sink: persisted browser-provided endpoint -> `webPush.sendNotification` outbound request.
- Remediated controls: registration accepts only HTTPS, credential-free, default-port endpoints from `fcm.googleapis.com`, `updates.push.services.mozilla.com`, or `web.push.apple.com`; `NotificationService.subscribe` repeats validation; `sendWebPush` repeats it at the outbound sink so legacy persisted arbitrary endpoints cannot be delivered.
- Reachability and proof: same-origin registration of a supported endpoint passes; an arbitrary HTTPS endpoint is rejected before `notificationService.subscribe`; policy tests reject link-local and unsupported-port destinations.
- Counterevidence / remaining boundary: authentication and origin protection were present before the fix. Live DNS/provider/redirect behavior was not invoked without an authorized provider environment; the fixed source path cannot select an arbitrary host.

### HX-SEC-003 — Web Push registrations and test fan-out are unbounded

- Original severity / CWE: Medium / CWE-770
- Original locations preserved: `src/server/notifications/supabase-push-notification-store.ts:34-55`; `src/app/api/notifications/test/route.ts:5-13`; `src/server/notifications/notification-service.ts:105-141`.
- Classification: `CONFIRMED`; remediation state: fixed.
- Affected surface and boundary: authenticated device registration and notification delivery resource allocation.
- Source -> sinks: repeated distinct endpoints -> persistent subscription arrays; matching event audience -> concurrent outbound delivery.
- Remediated controls: both file and runtime-document stores enforce at most five distinct subscriptions per user and channel, preserving refresh of an existing endpoint. Identity lookups and outbound deliveries use a concurrency limit of five instead of unbounded `Promise.all`.
- Reachability and proof: the runtime store test proves the sixth device is rejected and an existing device can refresh; the concurrency test proves five work items never exceed a limit of two when configured with two.
- Counterevidence / remaining boundary: input field and event/delivery record bounds already existed. No live load or provider test was run; the unbounded persistence and fan-out code path no longer exists in the reviewed patch.

### HX-SEC-004 — Workbook dry-run parses attacker files before import authorization

- Original severity / CWE: Medium / CWE-400
- Original locations preserved: `src/app/actions.ts:689-739`; `src/modules/operations/create-commands.ts:74-93`; mobile comparison `src/server/mobile/mobile-import-service.ts:41-52`.
- Classification: `CONFIRMED`; remediation state: fixed.
- Affected surface and boundary: authenticated browser Server Action crossing into workbook byte allocation and XLSX parsing.
- Source -> sinks: caller-provided `File` -> `file.arrayBuffer`, sheet-name parsing, and workbook parsing.
- Remediated control: immediately after identity and actor resolution, the action requires `import.create_dry_run` and returns `AUTHORIZATION_DENIED` before filename checks, `arrayBuffer`, hashing, or XLSX parsing.
- Reachability and proof: a no-permission actor with a valid `.xlsx` `File` is denied and its `arrayBuffer` spy is not called; the real workbook fixture remains successful for an authorized actor.
- Counterevidence / remaining boundary: Next.js must receive a bounded Server Action body before action code executes. The existing 40 MB, sheet, and row bounds remain. Archive expansion/time/concurrency hardening is a future defense-in-depth item, not an open instance of the reported authorization-order defect.

### HX-SEC-005 — Mobile attachment endpoint grants every dispatcher unrelated operational documents

- Original severity / CWE: Medium / CWE-639
- Original locations preserved: `src/app/api/mobile/attachments/[id]/route.ts:9-29`; `src/server/mobile/mobile-private-attachment-service.ts:13-22,44-56`; browser comparison `src/app/api/operations/attachments/[id]/route.ts:42-49`.
- Classification: `CONFIRMED`; remediation state: fixed.
- Affected surface and boundary: native bearer route to private attachment read/storage response.
- Source -> sink: attachment UUID projected to an authenticated dispatcher -> private attachment retrieval and HTTP response.
- Original control failure: the mobile operational attachment helper returned true solely for the dispatcher role before record relationship checks.
- Remediated control: the unconditional dispatcher role is removed. Elevated owner/administrator/accountant access remains aligned with the browser policy; uploader, assigned driver/helper, and owning delivery customer access remains record-scoped.
- Reachability and proof: assigned driver and owning customer receive 200; an unrelated dispatcher receives 403 and attachment storage is never read.
- Counterevidence / remaining boundary: native bearer authentication, UUID validation, and financial-document role restrictions existed before the fix. No production attachment or bearer token was accessed.

## Verification receipt

```text
npm.cmd run typecheck
PASS

npm.cmd exec vitest run tests/mobile-api-routes.test.ts tests/partner-api-routes.test.ts tests/supabase-runtime-stores.test.ts tests/notification-security.test.ts tests/mobile-private-attachment-route.test.ts
PASS — 5 files / 27 tests

npm.cmd exec vitest run tests/import-workbook-action.test.ts
PASS — 1 file / 3 tests

npm.cmd exec vitest run [R-044 authorization and security matrix plus new control suites]
PASS — 16 files / 73 tests

FINAL_DIFF_SECURITY_SCAN=PASS
SCAN_ID=5d62914f-d93c-4b03-9c8f-94542f8bfa97
SCAN_COVERAGE=complete
SCAN_FINDINGS=0
SCAN_WARNINGS=0
```

```text
R-044=PASS
HIGH_CONFIRMED_OPEN=0
MEDIUM_CONFIRMED_OPEN=0
UNRESOLVED_BLOCKING_SECURITY=0
```
