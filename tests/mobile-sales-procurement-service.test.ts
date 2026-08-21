import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import type { OperationsActor } from "@/modules/operations/types";
import type { SafeIdentityUser } from "@/server/identity/types";

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  runOperation: vi.fn(),
  runCreateCommand: vi.fn()
}));

vi.mock("@/server/erp-v2/runtime", () => ({
  getErpV2Snapshot: mocks.getSnapshot,
  runErpV2Operation: mocks.runOperation,
  runErpV2CreateCommand: mocks.runCreateCommand
}));

import {
  createMobileSalesDraft,
  getMobileSalesOrderDetail,
  runMobileSalesAction
} from "@/server/mobile/mobile-sales-service";
import {
  createMobilePurchaseDraft,
  runMobileProcurementAction
} from "@/server/mobile/mobile-procurement-service";

const salesUser: SafeIdentityUser = {
  id: "sales-user",
  email: "sales@example.test",
  normalizedEmail: "sales@example.test",
  displayName: "Nhân viên bán hàng",
  role: "sales",
  moduleIds: ["overview", "sales"],
  status: "active",
  createdAt: "2026-07-30T01:00:00.000Z",
  updatedAt: "2026-07-30T01:00:00.000Z",
  failedLoginAttempts: 0,
  sessionVersion: 1
};

const ownerUser: SafeIdentityUser = {
  id: "owner-user",
  email: "owner@example.test",
  normalizedEmail: "owner@example.test",
  displayName: "Chủ cửa hàng",
  role: "owner",
  moduleIds: ["overview", "sales", "procurement"],
  status: "active",
  createdAt: "2026-07-30T01:00:00.000Z",
  updatedAt: "2026-07-30T01:00:00.000Z",
  failedLoginAttempts: 0,
  sessionVersion: 1
};

const customerUser: SafeIdentityUser = {
  id: "customer-user",
  email: "customer@example.test",
  normalizedEmail: "customer@example.test",
  displayName: "Khách hàng",
  role: "customer",
  customerId: "cus-minh-anh",
  moduleIds: ["overview"],
  status: "active",
  createdAt: "2026-07-30T01:00:00.000Z",
  updatedAt: "2026-07-30T01:00:00.000Z",
  failedLoginAttempts: 0,
  sessionVersion: 1
};

const salesActor: OperationsActor = { id: salesUser.id, displayName: salesUser.displayName, role: "sales", permissions: ["sales.create", "sales.confirm", "sales.allocate_source"] };
const ownerActor: OperationsActor = { id: ownerUser.id, displayName: ownerUser.displayName, role: "owner", permissions: ["procurement.create", "procurement.confirm"] };

function snapshot(state = createInitialOperationsState()) {
  return { state, revision: 7, syncedAt: "2026-07-30T01:00:00.000Z", source: "memory" as const };
}

describe("bounded native sales and procurement services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSnapshot.mockResolvedValue(snapshot());
    mocks.runCreateCommand.mockResolvedValue({ summary: "Đã tạo nháp.", revision: 8, syncedAt: "2026-07-30T01:01:00.000Z" });
    mocks.runOperation.mockResolvedValue({ summary: "Đã cập nhật.", revision: 8, syncedAt: "2026-07-30T01:01:00.000Z" });
  });

  it("derives new sales draft prices and VAT from server catalog data", async () => {
    const state = createInitialOperationsState();
    const product = state.productUnits.find((item) => item.status === "active" && item.salePrice !== undefined && item.saleTaxRate !== undefined);
    const customer = state.customers.find((item) => item.status === "active");
    expect(product).toBeDefined();
    expect(customer).toBeDefined();
    mocks.getSnapshot.mockResolvedValue(snapshot(state));

    await createMobileSalesDraft(salesUser, salesActor, {
      idempotencyKey: "mobile-sales-draft-server-price-0001",
      customerId: customer?.id,
      lines: [{ productUnitId: product?.id, quantity: 2 }]
    });

    expect(mocks.runCreateCommand).toHaveBeenCalledWith(expect.objectContaining({
      type: "createSalesOrderDraft",
      customerId: customer?.id,
      lines: [{ productUnitId: product?.id, quantity: 2, unitPrice: product?.salePrice, taxRate: product?.saleTaxRate }]
    }), "mobile-sales-draft-server-price-0001", salesActor);
  });

  it("sends expectedVersion to the sales command and rejects a stale version before mutation", async () => {
    const state = createInitialOperationsState();
    const order = state.salesOrders.find((item) => item.status === "draft");
    expect(order).toBeDefined();
    mocks.getSnapshot.mockResolvedValue(snapshot(state));

    await runMobileSalesAction(salesUser, salesActor, order?.id ?? "", {
      action: "confirm",
      idempotencyKey: "mobile-sales-confirm-version-0001",
      expectedVersion: order?.version
    });
    expect(mocks.runOperation).toHaveBeenCalledWith("confirmSalesOrder", "mobile-sales-confirm-version-0001", order?.id, salesActor, { expectedVersion: order?.version });

    await expect(runMobileSalesAction(salesUser, salesActor, order?.id ?? "", {
      action: "confirm",
      idempotencyKey: "mobile-sales-confirm-version-stale-0002",
      expectedVersion: (order?.version ?? 1) + 1
    })).rejects.toMatchObject({ status: 409 });
    expect(mocks.runOperation).toHaveBeenCalledTimes(1);
  });

  it("blocks external roles from staff sales detail even when an order id is known", async () => {
    await expect(getMobileSalesOrderDetail(customerUser, "so-001")).rejects.toMatchObject({ status: 403 });
  });

  it("binds purchase freight to the selected supplier and preserves explicit commercial intent", async () => {
    const state = createInitialOperationsState();
    const supplier = state.suppliers.find((item) => item.status === "active");
    const product = state.productUnits.find((item) => item.status === "active");
    expect(supplier).toBeDefined();
    expect(product).toBeDefined();
    mocks.getSnapshot.mockResolvedValue(snapshot(state));

    await createMobilePurchaseDraft(ownerUser, ownerActor, {
      idempotencyKey: "mobile-purchase-draft-commercial-0001",
      supplierId: supplier?.id,
      lines: [{
        productUnitId: product?.id,
        orderedQuantity: 3,
        unitCost: 125000,
        taxRate: 0.08,
        unitName: product?.unitName,
        destinationType: "warehouse"
      }],
      freightCharge: { netAmount: 15000, taxRate: 0.08 }
    });

    expect(mocks.runCreateCommand).toHaveBeenCalledWith(expect.objectContaining({
      type: "createPurchaseOrderDraft",
      supplierId: supplier?.id,
      freightCharge: { supplierId: supplier?.id, netAmount: 15000, taxRate: 0.08, idempotencyKey: "mobile-purchase-draft-commercial-0001" }
    }), "mobile-purchase-draft-commercial-0001", ownerActor);
  });

  it("requires an optimistic version for purchase confirmation", async () => {
    const state = createInitialOperationsState();
    const order = state.purchaseOrders[0];
    if (order) {
      order.status = "draft";
      order.version = undefined;
    }
    expect(order).toBeDefined();
    mocks.getSnapshot.mockResolvedValue(snapshot(state));

    await expect(runMobileProcurementAction(ownerUser, ownerActor, order?.id ?? "", {
      action: "confirm",
      idempotencyKey: "mobile-purchase-confirm-stale-0001",
      expectedVersion: 99
    })).rejects.toMatchObject({ status: 409 });
    expect(mocks.runOperation).not.toHaveBeenCalled();
  });
});
