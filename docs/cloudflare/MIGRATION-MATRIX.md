# Cloudflare Migration Matrix

| Component | Current runtime | Dependency | Cloudflare target | Difficulty | Blocking issue | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Web and PWA | Next.js/OpenNext | Node build only | Worker + ASSETS | Low | None | Build | Active |
| API/server actions | Next.js server modules | Worker node compatibility | Worker routes | Medium | Verify every node-only import | Hardening | Active |
| Operations CAS | Runtime documents | D1 | D1 CAS | Medium | Reconciliation evidence | Persistence | Active |
| Financial/inventory invariants | Command services | CAS/idempotency/audit | Same boundary on D1 | High | No P1 regression | Hardening | Active |
| Private attachments | Metadata + storage adapter | R2 | R2 private objects | Medium | Ownership smoke tests | Storage | Active |
| Reports/export | Request-time generation | Build/runtime libraries | Worker response or R2 private artifact | Medium | Node-only renderer audit | Reporting | Partial |
| Excel import | Server validation/import workflow | Private attachments | Worker request + D1 job record | Medium | Large file limits and queue runbook | Import | Partial |
| Notifications | In-app/push service | Queue producer | D1 outbox + Queue | Medium | Consumer/runbook evidence | Background | Partial |
| GPS retention | Protected cron route | D1 | Worker cron or protected job | Medium | Cron trigger not configured | Background | Partial |
| Mobile APIs | Bearer-only bounded routes | Worker API | Same Worker APIs | Medium | Android dependency remediation | Mobile | Partial |
| Supabase code/migrations | Legacy adapters/history | Supabase SDK | No target runtime dependency | Medium | Prove unused in Worker bundle | Strangler | Legacy |
| Odoo addon | Python/XML reference | Odoo Linux/Python | Documentation/mapping only | High | Domain parity if replacement ever needed | Strangler | Reference |
| Docker/Compose | No root workflow file found | None | None | Low | Confirm CI dashboard commands | Removal | No normal dependency |
