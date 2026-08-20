# Current code map — 2026-08-20

- Web entry is src/app/page.tsx -> components/operations-app.tsx -> OperationsModuleRouter.
- The ERP navigation registry defines overview, masterData, sales, procurement, delivery, inventory, receivables, payables, cash, workforce, import, audit, and reporting.
- Domain state and commands are in src/modules/operations/types.ts, create-commands.ts, service.ts, invariants.ts.
- Server mutations flow through app actions -> identity actor -> OperationsCommandService -> TransactionRunner -> runtime backend.
- Cloudflare production currently stores a serialized operations document in D1 table erp_runtime_documents; normalized business tables are not the mutation repository.
- Public ordering uses src/app/dat-hang/page.tsx and buildCustomerOrderCatalog; portal actions re-check the actor and command invariants.
