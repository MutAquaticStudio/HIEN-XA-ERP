import { describe, expect, it } from "vitest";
import { runCreateCommand } from "@/modules/operations/create-commands";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsActor } from "@/modules/operations/types";

const actor: OperationsActor = {
  id: "owner-remediation-test",
  displayName: "Chủ cửa hàng",
  role: "owner",
  permissions: [
    "catalog.create_product_unit",
    "sales.create",
    "portal.customer.create_order"
  ]
};
const customerActor: OperationsActor = {
  id: "customer-remediation-test",
  displayName: "Khách kiểm thử",
  role: "customer",
  customerId: "cus-minh-anh",
  permissions: ["portal.customer.create_order"]
};
\ndescribe("remediation DoD controls", () => {
  it("does not opt a newly created product into public ordering", () => {
    const result = runCreateCommand({
      state: createInitialOperationsState(),
      command: {
        type: "createProductUnit",
        productCode: "VT-PRIVATE-01",
        productName: "Vật tư nội bộ",
        unitName: "bao"
      },
      actor,
      now: "2026-08-20T08:00:00.000Z",
      idempotencyKey: "remediation-product-001"
    });

    expect(result.state.productUnits.at(-1)).toMatchObject({
      visibleOnCustomerPortal: false,
      orderableOnline: false
    });
  });

  it("rejects public ordering for a product hidden by policy", () => {
    const state = createInitialOperationsState();
    state.productUnits[0]!.visibleOnCustomerPortal = false;

    expect(() => runCreateCommand({
      state,
      command: {
        type: "createCustomerPortalSalesOrder",
        customerId: "cus-minh-anh",
        deliveryAddress: "Số 1 đường Mẫu, Hải Phòng",
        paymentMethod: "transfer",
        lines: [{ productUnitId: "pu-cement-bag", quantity: 1 }]
      },
      actor: customerActor,
      now: "2026-08-20T08:00:00.000Z",
      idempotencyKey: "remediation-portal-001"
    })).toThrow("chưa được mở bán công khai");
  });

  it("rejects manual sales conversion when no product-specific conversion is configured", () => {
    expect(() => runCreateCommand({
      state: createInitialOperationsState(),
      command: {
        type: "createSalesOrderDraft",
        customerId: "cus-minh-anh",
        lines: [{
          productUnitId: "pu-cement-bag",
          quantity: 1,
          unitPrice: 89_000,
          taxRate: 0.08,
          unitName: "Tấn",
          unitFactor: 20
        }]
      },
      actor,
      now: "2026-08-20T08:00:00.000Z",
      idempotencyKey: "remediation-sales-unit-001"
    })).toThrow("chưa được cấu hình");
  });
});
