# Post-go-live Day-0 read-only health

Date: 2026-08-21

## Production identity

```text
MAIN_SHA=58c1eaf6d285070752f6f48d8ad22c8a965e6ad9
PRODUCTION_WORKER=hien-xa-erp-production
PRODUCTION_VERSION_ID=5ea6692b-90d1-4789-8324-8e57aecefd87
PRODUCTION_DEPLOYMENT_ID=7d0961c4-f458-48c6-9f03-aeef8eeea7f8
PRODUCTION_UNCHANGED=PASS
```

## Read-only route checks

The following requests were GET-only and created no session, fixture, business
document, attachment, payment, inventory movement, or work order:

```text
/                         200
/login                    200
/dashboard                200
/dat-hang                 200
/catalog/products         200
/delivery-tracking        200
/_next/static/...css      200
/api/mobile/catalog       401 (expected unauthenticated boundary)
NO_CRITICAL_5XX=PASS
```

## Transport and security headers

```text
PRODUCTION_HSTS=PASS
Strict-Transport-Security: max-age=31536000
PRODUCTION_SECURITY_HEADERS=PASS
Content-Security-Policy=PRESENT
X-Content-Type-Options=nosniff
Referrer-Policy=PRESENT
```

## Local secret hygiene

The session-local `.env.integration.local` was needed only for the guarded
staging contract. After that check it was removed. Before removal it was
ignored, untracked, and absent from Git history; after removal it has no staged
or unstaged entry. The Cloudflare staging integration secret was not changed.

```text
LOCAL_SECRET_FILE_STATUS=REMOVED_AFTER_VALIDATION
SECRET_HYGIENE=PASS
NO_PRODUCTION_MUTATION=PASS
POST_GO_LIVE_STATUS=PASS
```
