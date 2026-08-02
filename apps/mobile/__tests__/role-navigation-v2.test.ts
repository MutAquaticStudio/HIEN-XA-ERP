import { getNativeModulesForSession, getRoleNavigationManifest, getRoleTabLabels } from "../lib/role-navigation";

describe("role navigation V2", () => {
  it("uses short Vietnamese labels for field roles", () => {
    expect(getRoleTabLabels("driver")).toEqual({
      operations: "Chuyến hôm nay",
      tracking: "Bản đồ",
      messages: "Ảnh và báo lệch",
      account: "Tài khoản"
    });
    expect(getRoleTabLabels("worker").operations).toBe("Công việc");
  });

  it("keeps customer and supplier language plain", () => {
    expect(getRoleTabLabels("customer").operations).toBe("Đặt hàng");
    expect(getRoleTabLabels("supplier").operations).toBe("Phiếu mua");
  });

  it("builds one permission-aware manifest for management roles", () => {
    const owner = getRoleNavigationManifest("owner", ["cash", "admin"]);
    expect(owner).toMatchObject({ heading: "Điều hành cửa hàng", usesManagementWorkspace: true });
    expect(owner.moduleIds).toEqual(["catalog", "cash", "admin"]);

    expect(getNativeModulesForSession("warehouse", ["inventory", "cash", "delivery"]).map((module) => module.id)).toEqual(["catalog", "inventory", "delivery"]);
    expect(getNativeModulesForSession("accountant", ["receivables", "payables", "cash"]).map((module) => module.id)).toEqual(["catalog", "receivables", "payables", "cash"]);
  });

  it("does not expose management modules to field or partner roles", () => {
    for (const role of ["driver", "worker", "customer", "supplier"]) {
      expect(getRoleNavigationManifest(role, ["cash", "admin", "inventory"]).moduleIds).toEqual([]);
    }
  });
});
