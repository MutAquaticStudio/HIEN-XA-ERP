# ADR-001: Modular Monolith

- Status: Accepted

## Decision

Sử dụng modular monolith thay vì microservices.

## Context

Nghiệp vụ có transaction phức tạp nhưng số người dùng và đội kỹ thuật nhỏ.

## Consequences

- Dễ phát triển, deploy và debug.
- Module boundary phải được kiểm soát trong code review.
- Có thể tách service sau nếu có tải hoặc ownership rõ ràng.
