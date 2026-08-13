# Cloudflare Target Architecture

## Target

```text
Internet
  -> Cloudflare DNS / WAF / TLS
  -> hien-xa-erp Worker router
     -> ASSETS: Next.js static output
     -> dynamic Next.js routes and /api/*
     -> session, RBAC, CSRF and security headers
     -> D1: transactional runtime documents and coordination records
     -> R2: private files and cache
     -> Queue: asynchronous requests only
```

## Rules

- D1 is the current Cloudflare transactional store. Server-side command services remain the only mutation boundary.
- R2 is reached only through storage/attachment abstractions; object access is authorized by the server.
- Queue messages are not a source of truth for stock, debt, cash, payroll or financial posting.
- Workflows and Durable Objects are not provisioned by default. Add either only for a concrete, documented use case after an ADR.
- Hyperdrive/PostgreSQL is out of scope. Do not add a binding or expose a connection string without an accepted ADR.
- Odoo is never bundled, invoked or deployed from a Worker.

## Required deployment protections

- Separate bindings and secrets for staging and production.
- `ERP_DEPLOYMENT_STAGE` and `NEXT_PUBLIC_APP_URL` must match the bound Worker domain.
- Production promotion is manual after staging evidence, not an automatic Git deployment.
- Missing required D1/R2/Queue bindings fail closed.
