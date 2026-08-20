# Current test map — 2026-08-20

Relevant existing suites read from main:
- tests/selectors.test.ts
- tests/customer-order-catalog.test.ts
- tests/operations-projection.test.ts
- tests/role-projection-hardening.test.ts
- tests/worker-order-claim.test.ts
- tests/purchase-unit-settings.test.ts
- tests/production-persistence.test.ts
- tests/integration/*
- tests/e2e/*

Review-branch additions/changes:
- Selector master-data and portal catalog policy coverage.
- Portal visibility/orderability and unconfigured sales conversion regression coverage.

TEST_EXECUTION=NOT RUN (remote-only environment has no package runner attached)
BUILD_EXECUTION=NOT RUN
INTEGRATION_EXECUTION=NOT RUN
E2E_EXECUTION=NOT RUN
RELEASE_GATE=BLOCKED
