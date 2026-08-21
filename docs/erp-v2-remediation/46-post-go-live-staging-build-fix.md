# Post-go-live staging build trigger fix

Date: 2026-08-21

## Scope

Production was inspected before and after this change and was not modified. The
only configuration change was the Cloudflare Workers Builds default-branch
trigger for `hien-xa-erp-staging`.

## Root cause and correction

`NEXT_INC_CACHE_R2_BUCKET` is an OpenNext R2 binding, not a secret or a
stand-alone build environment value. The approved Wrangler configuration maps
that binding only under the staging environment:

```text
WRANGLER_ENV=staging
NEXT_INC_CACHE_R2_BUCKET=hien-xa-next-cache-staging
```

The staging default-branch trigger previously ran `npx wrangler deploy` with
no environment selection. It therefore used the top-level configuration and
failed while OpenNext populated its incremental cache because that binding is
intentionally absent there.

The trigger now uses the repository-supported command:

```text
npm run cf:upload:staging
```

This resolves the binding through `wrangler.jsonc --env staging`; no R2 bucket
was created, no secret was changed, and no production build setting or binding
was modified.

## Isolation verification

```text
STAGING_R2=hien-xa-next-cache-staging
PRODUCTION_R2=hien-xa-next-cache-production
STAGING_D1=hien-xa-erp-staging (0dfb64ab-ebb0-43f2-a27f-3df41733705c)
PRODUCTION_D1=hien-xa-erp-production (eddf505e-d6a2-4cfd-9248-bc97b5021a63)
STAGING_QUEUE=hien-xa-background-staging
PRODUCTION_QUEUE=hien-xa-background-production
STAGING_R2_ISOLATION=PASS
STAGING_D1_ISOLATION=PASS
STAGING_QUEUE_ISOLATION=PASS
```

## Exact-main verification

```text
STAGING_BUILD_SHA=58c1eaf6d285070752f6f48d8ad22c8a965e6ad9
STAGING_BUILD_ID=5c2a5f33-0354-4456-ae32-c0c762492c26
STAGING_DEFAULT_BUILD=PASS
OPENNEXT_BUILD=PASS
WORKERS_BUILD=PASS
STAGING_VERSION_ID=4cf3d6e0-27a8-4639-b299-e4de48e968c9
STAGING_DEPLOYMENT_ID=e48e5705-4b38-4f88-8cec-9da675fbb222
STAGING_TRAFFIC_CHANGED=NO
```

`cf:upload:staging` intentionally uploads a version without changing staging
traffic. The current staging deployment remains the previously attested
candidate runtime; its tree is identical to the approved main runtime tree.

The guarded staging Cloudflare contract was rerun without creating a new UAT
fixture and passed (`1` test).
