# Go-live staging validation

Date: 2026-08-20

## Candidate and deployment

| Item | Value |
| --- | --- |
| Go-live branch | `codex/erp-v2-go-live-20260820` |
| Candidate commit | `0fd5be8820a8906d0569aeaaeb93265619439ee8` |
| Candidate tree | `fe802ba4f0710e784bfd2df63b1863f313f4378d` |
| Staging Worker | `hien-xa-erp-staging` |
| Staging version | `bc781ac2-c8e9-42a6-9c28-54e180f3b78a` (version 96) |
| Staging deployment | `26bf5a4c-8eb6-45cd-81f5-5fcc4b7fadfe` |
| Traffic allocation | 100% to version 96 |

The immutable Worker version was uploaded at `2026-08-20T13:00:18Z`, two minutes after the candidate commit, and carries the matching remediation-branch alias. Cloudflare version metadata does not contain a Git SHA, so this is timestamp-and-alias linkage rather than cryptographic Git-SHA attestation.

## Binding isolation

Cloudflare account metadata and the deployed version both prove distinct resources:

- Worker: `hien-xa-erp-staging`, custom domain `uat.hienxavlxd.com`.
- D1: `hien-xa-erp-staging` / `0dfb64ab-ebb0-43f2-a27f-3df41733705c`.
- R2: `hien-xa-erp-private-staging` and `hien-xa-next-cache-staging`.
- Queue: `hien-xa-background-staging`, produced only by `hien-xa-erp-staging`.
- The production Worker and every corresponding D1, R2, and Queue resource have different identities.

## Read-only smoke after deployment

```text
/=200
/login=200
/dat-hang=200
/khach-hang/dang-nhap=200
/nha-cung-cap/dang-nhap=200
/api/mobile/catalog=401 (expected without bearer authentication)
```

Staging response headers include HSTS `max-age=31536000`, CSP, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.

## Public browser regression and visual review

The repository-supported Playwright Chromium runtime was installed outside the repository and used against the deployed staging URL. The initial run exposed only two login screenshot baseline deltas (390px and 1440px); the same deltas reproduced against the current local source, while keyboard navigation, accessibility, and overflow assertions continued to pass. The reviewed page remained usable and unclipped, so the two approved stale baselines were refreshed from staging.

```text
PLAYWRIGHT_BASE_URL=https://uat.hienxavlxd.com
npm.cmd run test:e2e:public
32 passed (12.2s)
VIEWPORTS=320,375,390,768,1024,1280,1440,1920
PUBLIC_PLAYWRIGHT=PASS
```

This is a public-route gate only; it neither creates fixtures nor supplies the authenticated UAT contract.

## Contract result

```text
npm.cmd run test:cloudflare-integration
BLOCKED at explicit ERP_RUN_CLOUDFLARE_INTEGRATION_TESTS guard

POST /api/internal/integration/cloudflare without secret = 401
POST /api/internal/integration/fixture without secret = 401

STAGING_DEPLOYED=YES
STAGING_BINDING_ISOLATION=PASS
PUBLIC_PLAYWRIGHT=PASS
STAGING_CONTRACT=BLOCKED
STAGING_INTEGRATION=BLOCKED
```

The configured `CLOUDFLARE_INTEGRATION_SECRET` exists as a managed Worker secret but is not retrievable from Cloudflare. No local UAT secret, fixture credentials, or guarded integration environment is available. No fixture or staging business data was created or changed.
