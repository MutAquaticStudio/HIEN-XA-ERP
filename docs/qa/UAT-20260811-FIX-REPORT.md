# UAT-20260811 Fix Report

## Verdict

**NOT READY for production deployment.** No production mutation or deployment was performed.

## Scope and environment

- Source branch: `codex/release-remediation-0.1.1`
- Staging: `https://uat.hienxavlxd.com` with isolated Cloudflare D1, R2 and Queue bindings.
- Production observation only: `https://app.hienxavlxd.com`; no production data was created, changed or deleted.

## UAT findings

| ID | Severity | Result | Root cause and resolution |
| --- | --- | --- | --- |
| UAT-20260811-001 | P1 | PARTIAL | The production runtime catalog contained one active product with no public sale price/VAT, so it was excluded. The customer catalog now safely exposes such items as `Cần báo giá`, while the server still rejects direct orders until an authorized user configures price and VAT. The staging fixture has a priced item and E2E catalog/auth flows pass. Production has not received this code or commercial-data configuration. |
| UAT-20260811-002 | P1 | PARTIAL | HSTS is present in the staged Worker response and is limited to `max-age=31536000`, without `includeSubDomains` or `preload`. The production Worker was deliberately not deployed, so production header promotion remains pending. |
| UAT-20260811-003 | P1 | PASS | Deterministic A/B staging fixture, private attachment IDs and role links are in place. Authenticated role and IDOR tests complete with no skips. A cross-work-order claim attempt is now denied before idempotency replay. |

## Regression evidence

- Root typecheck: PASS.
- Root Vitest: PASS, 124 files / 500 tests.
- Production build: PASS, 58 routes.
- Root runtime dependency audit: PASS, 0 vulnerabilities.
- Mobile typecheck: PASS.
- Mobile Jest: PASS, 20 suites / 47 tests.
- Authenticated Playwright: PASS, 33/33 at 390, 768 and 1440 px, no skip and no retry in final run.
- Tenant/party isolation: PASS for customer A/B, supplier A/B, worker A/B and cross-work-order claim denial.
- Cloudflare staging integration: PASS in prior focused gate; fixture deploy uses staging-only guard, D1/R2/Queue bindings and no production host.

## Security status

- HSTS staging: `Strict-Transport-Security: max-age=31536000`.
- CSP, `nosniff` and referrer policy: asserted on staging routes.
- Production headers: read-only evidence captured; promotion pending.
- Android dependency audit: **BLOCKED** with 18 High and 9 Moderate findings in production dependency resolution. Do not use `npm audit fix --force`; Expo/React Native/MapLibre compatibility upgrade needs a dedicated remediation and device UAT.

## Required follow-up before release

1. Configure an authorized public sale price and VAT for every product intended for direct customer ordering; then verify the live catalog and a non-financial draft order.
2. Deploy the reviewed Worker to staging, re-run headers, then request explicit authorization for production promotion.
3. Upgrade/remediate Android Expo/React Native/MapLibre dependency graph and run emulator plus real-device UAT before an EAS Internal build.

## Evidence files

- `docs/qa/evidence/UAT-20260811/live-read-only-headers.txt`
- `docs/qa/evidence/UAT-20260811/live-dat-hang-before-deploy.png`

## Files changed in this remediation

- Customer catalog/projection and preview presentation.
- Cloudflare staging fixture and internal fixture endpoint.
- Worker claim authorization boundary.
- Authenticated/IDOR Playwright regressions and contrast tokens.

## Release record

- Production mutation performed: **NO**.
- Production deployment performed: **NO**.
- Commit: not created because release gates remain blocked.
