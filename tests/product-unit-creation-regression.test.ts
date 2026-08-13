import { describe, expect, it } from "vitest";
import { runCreateCommand } from "@/modules/operations/create-commands";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsActor } from "@/modules/operations/types";

const actor: OperationsActor = {
  id: "owner-product-creation-test",
  displayName: "Chủ cửa hàng",
  role: "owner",
  permissions: ["catalog.create_product_unit"]
};

describe("tạo vật tư với đơn vị tồn kho", () => {
  it("tạo được vật tư khi người dùng chọn đơn vị đang hoạt động", () => {
    const state = createInitialOperationsState();
    const unit = state.unitDefinitions.find((item) => item.status === "active");

    const result = runCreateCommand({
      state,
      command: {
        type: "createProductUnit",
        productCode: "VT-TAO-MOI-01",
        productName: "Vật tư tạo mới",
        unitName: unit!.name
      },
      actor,
      now: "2026-08-11T09:00:00.000Z",
      idempotencyKey: "product-creation-regression-001"
    });

    expect(result.state.productUnits).toContainEqual(expect.objectContaining({
      productCode: "VT-TAO-MOI-01",
      productName: "Vật tư tạo mới",
      unitName: unit!.name,
      status: "active"
    }));
  });

  it("từ chối đơn vị đã ngừng dùng để tránh tạo vật tư không dùng được", () => {
    const state = createInitialOperationsState();
    const unit = state.unitDefinitions[0]!;
    unit.status = "inactive";

    expect(() => runCreateCommand({
      state,
      command: {
        type: "createProductUnit",
        productCode: "VT-DON-VI-NGUNG",
        productName: "Vật tư đơn vị ngừng dùng",
        unitName: unit.name
      },
      actor,
      now: "2026-08-11T09:00:00.000Z",
      idempotencyKey: "product-creation-regression-002"
    })).toThrow();
  });
});
