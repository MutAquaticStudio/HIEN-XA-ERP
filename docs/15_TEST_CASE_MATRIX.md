# Test Case Matrix

## Quy ước

Mỗi capability phải có test happy path, failure path, authorization và retry/concurrency khi có mutation. Test database thật bổ sung trước cutover, không thay bằng source-text assertion.

| Context | Hành vi bắt buộc | Suite tự động |
| --- | --- | --- |
| Identity | Invite-only, lockout, session invalidation, role scope | `identity-auth`, `security-hardening` |
| Parties | Tạo, chống trùng, portal ownership | `create-commands`, `partner-portals` |
| Catalog | Đơn vị, quy đổi, pricing snapshot | `purchase-unit-settings`, `create-commands` |
| Sales | Draft, confirm, allocation, giao, reversal | `operations-workflow`, `partner-portals` |
| Procurement | PO, destination, receipt, direct delivery | `operations-workflow`, `approval-workflow` |
| Inventory | Movement append-only, MWA, count, no negative stock | `operations-algorithms`, `operations-invariants` |
| Delivery | Phân công, evidence, approve/reject, GPS privacy | `worker-delivery-photo-approval`, `delivery-tracking` |
| Receivables | Ledger, allocation, reversal, credit limit | `debt-audit-workflow`, `operations-workflow` |
| Payables | Ledger, allocation, reversal, supplier isolation | `debt-audit-workflow`, `partner-portals` |
| Cash | Receipt, payment, voucher, transfer proof | `operations-workflow`, `bank-transfer-proofs` |
| Workforce | Atomic claim, output, approval | `worker-order-claim`, `operations-workflow` |
| Compensation | Rate snapshot, split, advance, payment | `operations-workflow`, `operations-invariants` |
| Import | Fingerprint, issue lifecycle, reviewed gate | `create-commands`, `operations-invariants` |
| Reporting | Ledger-derived monthly and role dashboard | `monthly-report`, `role-dashboard` |
| Audit | Correlation, immutable trail, command match | `debt-audit-workflow`, `backend-command-service` |
| Attachments | MIME sniffing, hash, access scope | `operations-attachments`, `bank-transfer-proofs` |
| Partner portals | Customer/NCC ownership, order, proof, notices, chat | `partner-portals`, `supabase-runtime-stores` |
| Push/PWA/mobile | Subscription retry, offline-read, bridge, tracking | `supabase-runtime-stores`, `pwa-offline`, `mobile-web-bridge` |

## Production Gates

- Run migration and RLS integration cases against a disposable Supabase database before cutover.
- Run concurrency cases through PostgreSQL transactions, not only the in-memory fake store.
- Run authenticated browser E2E for every role and portal before a production promotion.
- Run typecheck, full test suite, build and a new deep security scan after code changes.
