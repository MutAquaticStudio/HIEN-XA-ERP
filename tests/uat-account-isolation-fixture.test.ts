import { describe, expect, it } from "vitest";
import { assertOperationsInvariants } from "../src/modules/operations/invariants";
import { projectOperationsState } from "../src/server/identity/operations-projection";
import type { SafeIdentityUser } from "../src/server/identity/types";
import { createUatUxV2OperationsState } from "../src/server/testing/uat-ux-v2-fixture";

const timestamp = "2026-08-02T00:00:00.000Z";

function user(role: SafeIdentityUser["role"], linkage: Partial<Pick<SafeIdentityUser, "customerId" | "supplierId" | "employeeId">>): SafeIdentityUser {
  return {
    id: `uat-test-${role}-${Object.values(linkage)[0] ?? "none"}`,
    email: `${role}@example.invalid`,
    normalizedEmail: `${role}@example.invalid`,
    displayName: `UAT ${role}`,
    role,
    moduleIds: [],
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    failedLoginAttempts: 0,
    sessionVersion: 1,
    ...linkage
  };
}

describe("UAT account isolation fixture", () => {
  const state = createUatUxV2OperationsState();

  it("giữ toàn bộ invariant nghiệp vụ", () => {
    expect(() => assertOperationsInvariants(state)).not.toThrow();
  });

  it.each([
    ["uat-uxv2-customer", "UAT-UXV2-SO-001", "UAT-UXV2-SO-B-001"],
    ["uat-uxv2-customer-b", "UAT-UXV2-SO-B-001", "UAT-UXV2-SO-001"]
  ])("cô lập đơn và tệp của khách %s", (customerId, ownOrder, otherOrder) => {
    const projection = projectOperationsState(state, user("customer", { customerId }));
    const serialized = JSON.stringify(projection);
    expect(serialized).toContain(ownOrder);
    expect(serialized).not.toContain(otherOrder);
    expect(serialized).not.toContain(customerId.endsWith("-b") ? "uat-uxv2-attachment-customer\"" : "uat-uxv2-attachment-customer-b");
  });

  it.each([
    ["uat-uxv2-supplier", "UAT-UXV2-PO-001", "UAT-UXV2-PO-B-001"],
    ["uat-uxv2-supplier-b", "UAT-UXV2-PO-B-001", "UAT-UXV2-PO-001"]
  ])("cô lập phiếu mua và giá bán khỏi nhà cung cấp %s", (supplierId, ownOrder, otherOrder) => {
    const projection = projectOperationsState(state, user("supplier", { supplierId }));
    const serialized = JSON.stringify(projection);
    expect(serialized).toContain(ownOrder);
    expect(serialized).not.toContain(otherOrder);
    expect(projection.productUnits.every((product) => product.salePrice === undefined && product.preferredSupplierId === undefined)).toBe(true);
  });

  it.each([
    ["uat-uxv2-employee-worker", "UAT-UXV2-CV-001", "UAT-UXV2-CV-B-001"],
    ["uat-uxv2-employee-worker-b", "UAT-UXV2-CV-B-001", "UAT-UXV2-CV-001"]
  ])("cô lập công việc và dữ liệu nhạy cảm khỏi thợ %s", (employeeId, ownWork, otherWork) => {
    const projection = projectOperationsState(state, user("worker", { employeeId }));
    const serialized = JSON.stringify(projection);
    expect(serialized).toContain(ownWork);
    expect(serialized).not.toContain(otherWork);
    expect(serialized).not.toContain("customerLedgerEntries");
    expect(projection.productUnits.every((product) => product.salePrice === undefined && product.preferredSupplierId === undefined)).toBe(true);
  });
});
