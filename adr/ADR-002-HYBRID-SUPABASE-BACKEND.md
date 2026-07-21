# ADR-002: Hybrid Supabase + Server Application Layer

- Status: Accepted

## Decision

Supabase cung cấp PostgreSQL, Auth và Storage. Nghiệp vụ posting chạy qua backend application service.

## Rationale

RLS và CRUD trực tiếp không đủ để bảo vệ các transaction liên quan kho, ledger, reversal và compensation.
