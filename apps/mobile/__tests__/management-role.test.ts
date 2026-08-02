import { usesNativeManagementHome } from "../lib/role-navigation";

describe("usesNativeManagementHome", () => {
  it("keeps management roles in the native application", () => {
    expect(usesNativeManagementHome("owner")).toBe(true);
    expect(usesNativeManagementHome("accountant")).toBe(true);
    expect(usesNativeManagementHome("warehouse")).toBe(true);
  });

  it("keeps field and partner roles on their native role workflows", () => {
    expect(usesNativeManagementHome("driver")).toBe(false);
    expect(usesNativeManagementHome("worker")).toBe(false);
    expect(usesNativeManagementHome("customer")).toBe(false);
    expect(usesNativeManagementHome("supplier")).toBe(false);
  });
});
