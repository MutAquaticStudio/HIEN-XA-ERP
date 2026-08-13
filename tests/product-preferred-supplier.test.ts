import { describe, expect, it } from "vitest";
import { runCreateCommand } from "@/modules/operations/create-commands";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import { projectOperationsState } from "@/server/identity/operations-projection";
import type { OperationsActor } from "@/modules/operations/types";
import type { SafeIdentityUser } from "@/server/identity/types";

const actor: OperationsActor = {
  id: "owner-product-test",
  displayName: "Chủ cửa hàng",
  role: "owner",
  permissions: ["catalog.create_product_unit"]
};

describe("nhà cung cấp chính của vật tư", () => {
  it("lưu nhà cung cấp đang hoạt động khi tạo vật tư", () => {
    const state = createInitialOperationsState();
    const supplier = state.suppliers.find((item) => item.status === "active");
    const unit = state.unitDefinitions.find((item) => item.status === "active");
    expect(supplier).toBeDefined();
    expect(unit).toBeDefined();

    const result = runCreateCommand({
      state,
      command: {
        type: "createProductUnit",
        productCode: "VT-NCC-TEST",
        productName: "Vật tư có nhà cung cấp",
        unitName: unit!.name,
        preferredSupplierId: supplier!.id
      },
      actor,
      now: "2026-08-02T08:00:00.000Z",
      idempotencyKey: "product-preferred-supplier-create-0001"
    });

    expect(result.state.productUnits.find((item) => item.productCode === "VT-NCC-TEST")?.preferredSupplierId).toBe(supplier!.id);
  });

  it("từ chối nhà cung cấp không tồn tại", () => {
    const state = createInitialOperationsState();
    const unit = state.unitDefinitions.find((item) => item.status === "active");

    expect(() => runCreateCommand({
      state,
      command: {
        type: "createProductUnit",
        productCode: "VT-NCC-SAI",
        productName: "Vật tư sai nhà cung cấp",
        unitName: unit!.name,
        preferredSupplierId: "supplier-khong-ton-tai"
      },
      actor,
      now: "2026-08-02T08:00:00.000Z",
      idempotencyKey: "product-preferred-supplier-invalid-0001"
    })).toThrow("Nhà cung cấp đã chọn không tồn tại hoặc đã ngừng hoạt động.");
  });

  it.each([
    ["customer", { customerId: "cus-minh-anh" }],
    ["supplier", { supplierId: "sup-hoang-thach" }],
    ["driver", {}],
    ["worker", {}]
  ] as const)("không lộ nhà cung cấp nguồn cho vai trò %s", (role, linkage) => {
    const state = createInitialOperationsState();
    const product = state.productUnits[0];
    product.preferredSupplierId = state.suppliers[0]?.id;
    const user = {
      id: `user-${role}`,
      email: `${role}@example.test`,
      normalizedEmail: `${role}@example.test`,
      displayName: role,
      role,
      moduleIds: [],
      status: "active",
      createdAt: "2026-08-02T08:00:00.000Z",
      updatedAt: "2026-08-02T08:00:00.000Z",
      failedLoginAttempts: 0,
      sessionVersion: 1,
      ...linkage
    } satisfies SafeIdentityUser;

    const projected = projectOperationsState(state, user);
    expect(projected.productUnits.every((item) => item.preferredSupplierId === undefined)).toBe(true);
  });
});
