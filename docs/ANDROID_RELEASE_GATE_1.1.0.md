# Android Release Gate 1.1.0

## Scope and release boundary

- Package: `vn.vlxd.operations`
- Version: `1.1.0` (version code `8`)
- Target host for all EAS profiles: `https://app.hienxavlxd.com`
- This evidence is for local release verification only.
- Do not publish to Google Play, create an EAS build, merge PR #1, deploy a Worker, or change production data from this checklist.

## Automated evidence

- Expo Doctor: 20/20 checks passed.
- Mobile TypeScript: passed.
- Mobile Jest: 20 suites and 47 tests passed.
- Web TypeScript: passed.
- Web Vitest: 124 files and 509 tests passed.
- Next production build: passed.
- Mobile API and response-header regression: 14 tests passed.
- Local release APK: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.
- APK SHA-256: `057AA72E7436A1A8866710B6E12502BCE881C8BC18C6770BABA5B2443D01A532`.
- APK metadata: min SDK 24, target/compile SDK 36.

## Dependency security status

- `npm audit --omit=dev`: 0 Critical, 16 High, 9 Moderate, 0 Low.
- The 16 High aggregate entries reduce to two source advisories, both for `image-size@1.2.1` used by Metro while building asset metadata: [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).
- `js-yaml@3.15.0` was updated to patched `3.15.1`; it was only reached from Jest tooling.
- The npm registry has no `image-size` version later than `2.0.2`, although the advisory range labels every published version as vulnerable. Metro 0.84.4 requires the legacy callable `image-size` 1.x API, so an override to a nonexistent or incompatible release is not a valid remediation.
- `image-size` is not packaged as an Android runtime file; it is used by Metro during local/EAS JavaScript asset processing. The remaining exposure is therefore build-time only, but it remains an unresolved High release blocker until a compatible patched Metro/Expo dependency is released or an explicit risk exception is approved.

## Manual physical-device gate

Run every case on one Android 10-12 device and one Android 13+ device. Use separate non-production test accounts for each role. Do not write passwords or tokens in the test record.

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| MOB-001 | Fresh installation | Uninstall any prior version, install the release APK, and open it. | App launches without browser or WebView fallback. |
| MOB-002 | Login and persistence | Sign in, close the app, reopen it, then sign out. | Correct role landing page is shown; session persists only while valid; logout returns to login. |
| MOB-003 | Expired or invalid session | Revoke or expire the test session, then refresh a protected screen. | App clears the local session and asks for login; no sensitive data remains visible. |
| MOB-004 | Role isolation | Repeat login for Owner, Accountant, Warehouse, Dispatcher, Driver, Worker, Customer, and Supplier. | Each role only sees permitted navigation, records, amounts, and files. |
| MOB-005 | Customer workflow | Customer views catalog, drafts an order, views own debt, uploads payment proof, and opens chat. | Server-calculated values are displayed; no other customer data, cost, margin, or internal stock is exposed. |
| MOB-006 | Worker workflow | Worker opens assigned work, sends allowed proof/output, then tries a different work item and delivery quantity edit. | Assigned item is available; cross-user item and direct quantity edit are denied. |
| MOB-007 | Photo upload | Allow camera/photo permission, capture or select a valid proof, then deny permission and retry. | Private upload succeeds only with permitted input; denial gives a clear Vietnamese action message. |
| MOB-008 | GPS and map | For an assigned driver in an eligible trip, allow location, start tracking, stop it, then test deny. | Consent is clear; tracking only works while eligible; stop/logout clears local tracking state; denial is handled safely. |
| MOB-009 | Push control | Enable notifications, disable them, and log out. | Visible state matches device permission; disabling/logout unsubscribes without sensitive notification content. |
| MOB-010 | Offline and recovery | Turn on airplane mode while viewing cached data, create only a permitted local draft, then reconnect. | Clear offline state; no financial/inventory posting is queued; safe retry occurs after reconnect. |
| MOB-011 | Lifecycle and slow network | Background/foreground, force-close/reopen, and use a throttled network. | Loading, retry, error, and success states remain understandable; no duplicate command is created. |
| MOB-012 | Authorization failures | Exercise supported test routes that produce 401, 403, and 500. | Vietnamese error is clear; response does not reveal tokens, other parties, or internal stack details. |

## Tester evidence record

For each case, record the device model, Android version, APK SHA-256, role, anonymized fixture ID, timestamp, PASS/FAIL, and a screenshot or screen recording with sensitive values redacted. A failed test must include the reproduction steps, expected/actual result, and the relevant non-sensitive request correlation ID when available.

## Current release decision

No ADB-connected device was available while this document was produced. The physical-device gate is therefore `REQUIRES MANUAL TEST`. This is release-blocking for Android publication and for an overall `READY FOR PRODUCTION` verdict.
