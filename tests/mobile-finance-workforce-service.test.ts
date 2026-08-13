import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import type { OperationsActor } from "../src/modules/operations/types";
import type { SafeIdentityUser } from "../src/server/identity/types";

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  runOperation: vi.fn(),
  runCreateCommand: vi.fn()
}));

vi.mock("@/modules/operations/demo-store", () => ({
  getDemoOperationsSnapshot: mocks.getSnapshot,
  runDemoOperation: mocks.runOperation,
  runDemoCreateCommand: mocks.runCreateCommand
}));

vi.mock("@/server/identity/auth-context", () => ({
  visibleModulesForIdentity: (user: { moduleIds: string[] }) => user.moduleIds
}));

import {
  getMobilePayablesOverview,
  getMobileReceivablesOverview,
  getMobileWorkforceOverview,
  runMobileCashAction,
  runMobileWorkforceAction
} from "@/server/mobile/mobile-finance-workforce-service";

const actor: OperationsActor = {
  id: "owner-user",
  displayName: "Chủ cửa hàng",
  role: "owner",
  permissions: ["cash.create_voucher", "workforce.approve_output", "compensation.post"]
};

function identity(input: Partial<SafeIdentityUser>): SafeIdentityUser {
  return {
    id: "identity-user",
    email: "user@hienxa.test",
    normalizedEmail: "user@hienxa.test",
    displayName: "Chủ cửa hàng",
    role: "owner",
    moduleIds: ["receivables", "payables", "cash", "workforce"],
    status: "active",
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    failedLoginAttempts: 0,
    sessionVersion: 1,
    ...input
  };
}

function snapshot(state = createInitialOperationsState()) {
  return {
    state,
    revision: 7,
    syncedAt: "2026-07-30T00:00:00.000Z",
    source: "memory" as const
  };
}

describe("mobile finance and workforce service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSnapshot.mockResolvedValue(snapshot());
    mocks.runOperation.mockResolvedValue({
      summary: "Đã xử lý.",
      severity: "success",
      revision: 8,
      syncedAt: "2026-07-30T00:01:00.000Z"
    });
    mocks.runCreateCommand.mockResolvedValue({
      summary: "Đã tạo.",
      severity: "success",
      revision: 8,
      syncedAt: "2026-07-30T00:01:00.000Z"
    });
  });

  it("only returns the signed-in customer's own receivable data", async () => {
    const state = createInitialOperationsState();
    const customer = state.customers[0]!;
    const otherCustomer = state.customers[1]!;
    mocks.getSnapshot.mockResolvedValue(snapshot(state));

    const overview = await getMobileReceivablesOverview(identity({
      role: "customer",
      customerId: customer.id,
      moduleIds: []
    }));

    expect(overview.summaries.every((entry) => entry.partyId === customer.id)).toBe(true);
    expect(overview.obligations.every((entry) => entry.partyId === customer.id)).toBe(true);
    expect(JSON.stringify(overview)).not.toContain(otherCustomer.id);
  });

  it("only returns the signed-in supplier's own payable data", async () => {
    const state = createInitialOperationsState();
    const supplier = state.suppliers[0]!;
    const otherSupplier = state.suppliers[1]!;
    mocks.getSnapshot.mockResolvedValue(snapshot(state));

    const overview = await getMobilePayablesOverview(identity({
      role: "supplier",
      supplierId: supplier.id,
      moduleIds: []
    }));

    expect(overview.summaries.every((entry) => entry.partyId === supplier.id)).toBe(true);
    expect(overview.obligations.every((entry) => entry.partyId === supplier.id)).toBe(true);
    expect(JSON.stringify(overview)).not.toContain(otherSupplier.id);
  });

  it("requires explicit review confirmation and uses the bounded cash create command", async () => {
    const review = await runMobileCashAction(identity({}), actor, {
      action: "createVoucherDraft",
      direction: "out",
      category: "Vận chuyển",
      description: "Cước giao hàng",
      amount: 250000,
      review: true
    });
    expect(review).toHaveProperty("review");
    expect(mocks.runCreateCommand).not.toHaveBeenCalled();

    const result = await runMobileCashAction(identity({}), actor, {
      action: "createVoucherDraft",
      direction: "out",
      category: "Vận chuyển",
      description: "Cước giao hàng",
      amount: 250000,
      confirm: true,
      idempotencyKey: "mobile-cash-voucher-1"
    });

    expect(mocks.runCreateCommand).toHaveBeenCalledWith({
      type: "createCashVoucherDraft",
      direction: "out",
      category: "Vận chuyển",
      description: "Cước giao hàng",
      amount: 250000
    }, "mobile-cash-voucher-1", actor);
    expect(result).toMatchObject({ summary: "Đã tạo.", revision: 8 });
  });

  it("does not expose ledger, payment, advance, or compensation values to a worker", async () => {
    const state = createInitialOperationsState();
    const worker = state.employees.find((employee) => employee.roleType === "worker")!;
    mocks.getSnapshot.mockResolvedValue(snapshot(state));

    const overview = await getMobileWorkforceOverview(identity({
      id: "worker-user",
      role: "worker",
      displayName: worker.displayName,
      moduleIds: ["overview", "workforce"]
    }));

    expect(overview.mode).toBe("field");
    expect(overview.employees).toEqual([]);
    expect(overview.compensationBatches).toEqual([]);
    expect(JSON.stringify(overview)).not.toContain("employeeLedgerEntries");
    expect(JSON.stringify(overview)).not.toContain("totalAmount");
  });

  it("returns a 409 before a stale workforce approval reaches the command service", async () => {
    const state = createInitialOperationsState();
    const workOrder = state.workOrders[0]!;
    workOrder.status = "submitted";
    workOrder.version = 4;
    workOrder.outputs = [{
      id: "output-versioned",
      productUnitId: state.productUnits[0]!.id,
      actualQuantity: 1,
      approvedQuantity: 0,
      status: "submitted"
    }];
    mocks.getSnapshot.mockResolvedValue(snapshot(state));

    await expect(runMobileWorkforceAction(identity({
      role: "supervisor",
      displayName: "Giám sát",
      moduleIds: ["workforce"]
    }), { ...actor, role: "supervisor", permissions: ["workforce.approve_output"] }, {
      action: "approveOutput",
      workOrderId: workOrder.id,
      expectedVersion: 3,
      review: true
    })).rejects.toMatchObject({ status: 409 });

    expect(mocks.runOperation).not.toHaveBeenCalled();
  });
});
