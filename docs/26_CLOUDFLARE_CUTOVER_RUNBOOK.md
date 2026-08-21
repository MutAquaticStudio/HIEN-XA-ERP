# Cloudflare setup and cutover runbook

## Current status

Cloudflare staging foundation was created on 2026-08-02:

- Worker target: `hien-xa-erp-staging`
- D1 database: `hien-xa-erp-staging`
- D1 database ID: `0dfb64ab-ebb0-43f2-a27f-3df41733705c`
- Queue: `hien-xa-background-staging`
- Private R2 bucket: `hien-xa-erp-private-staging`
- OpenNext cache bucket: `hien-xa-next-cache-staging`

The live Vercel/Supabase deployment remains unchanged and remains the source of truth.

## Empty-production test environment

The Cloudflare production test environment was provisioned on 2026-08-02 after the owner explicitly chose to reset demo data rather than migrate it:

- Worker target: `hien-xa-erp-production`
- ERP hostname: `app.hienxavlxd.com`
- D1 database: `hien-xa-erp-production`
- D1 database ID: `eddf505e-d6a2-4cfd-9248-bc97b5021a63`
- Queue: `hien-xa-background-production`
- Private R2 bucket: `hien-xa-erp-private-production`
- OpenNext cache bucket: `hien-xa-next-cache-production`

This is a new, empty ERP data store. It is not a migration of Vercel or Supabase data and does not make their projects disposable. The legacy projects remain retained only until the Cloudflare route, owner login and essential role checks pass.

## Local commands

```powershell
npm.cmd install
npm.cmd run cf:typegen
npm.cmd run cf:d1:migrate:staging
npm.cmd run cf:preview
```

Do not run `cf:deploy:staging` until the Cloudflare persistence adapters and R2 private-storage binding are complete.

## Secrets

Use `wrangler secret put <NAME> --env staging`. Never commit values to source control.

Required before a staging deployment:

- `ERP_SESSION_SECRET`
- `CRON_SECRET`
- `VAPID_PRIVATE_KEY` when web push is enabled
- provider credentials for mail or other explicitly enabled integrations

Public non-secret values such as the application URL and VAPID public key may be configured as Worker variables after the staging hostname exists.

## R2 configuration

R2 was enabled and both staging buckets were created on 2026-08-02.

- `PRIVATE_FILES` is only for private application uploads.
- `NEXT_INC_CACHE_R2_BUCKET` is only for OpenNext cache entries.
- Neither bucket may expose a public bucket URL.
- Downloads from `PRIVATE_FILES` must pass application authorization and use a short-lived response.

## Data migration order

1. Freeze and export the runtime document plus revision.
2. Export identity and party linkage without logging password or session secrets.
3. Export attachment metadata and copy private objects with hash verification.
4. Export chat, push subscriptions and GPS sessions.
5. Import D1 tables in dependency order.
6. Compare inventory, receivables, payables, cash and compensation totals.
7. Require a difference of `0` for every financial and inventory control total.

## Domain cutover

Do not change DNS during staging UAT. After the final rehearsal:

1. Lower the current DNS TTL at least one day before cutover.
2. Start the maintenance window and make the old system read-only.
3. Run the final export, import and reconciliation.
4. Deploy the immutable Cloudflare production version.
5. Add the custom domain in Workers and apply the Cloudflare-provided DNS record.
6. Run login, read-only role isolation and health checks.
7. Open mutations only after all checks pass.

If any control total differs or a role can access another party's data, restore the previous DNS target and keep the old source read-only until the incident is resolved.
