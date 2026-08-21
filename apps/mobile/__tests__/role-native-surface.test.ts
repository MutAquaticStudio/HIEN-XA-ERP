jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn()
}));

import { nativeRoleSurface } from "../components/role-operations-home";

describe("native role surfaces", () => {
  it("keeps worker and driver delivery views free from pricing, stock, margin, and quantity editing", () => {
    for (const role of ["worker", "driver"]) {
      expect(nativeRoleSurface(role)).toMatchObject({
        canShowOwnOrderPrice: false,
        canShowSupplierAgreedPrice: false,
        canShowInternalStock: false,
        canShowCostOrMargin: false,
        canEditDeliveredQuantity: false,
        canOpenInAppMap: true
      });
    }
  });

  it("shows only party-owned commercial data in the matching native portal", () => {
    expect(nativeRoleSurface("customer")).toMatchObject({
      canShowOwnOrderPrice: true,
      canShowSupplierAgreedPrice: false,
      canOpenInAppMap: false
    });
    expect(nativeRoleSurface("supplier")).toMatchObject({
      canShowOwnOrderPrice: false,
      canShowSupplierAgreedPrice: true,
      canOpenInAppMap: false
    });
  });

  it("uses in-app map navigation only for operational roles", () => {
    expect(nativeRoleSurface("dispatcher").canOpenInAppMap).toBe(true);
    expect(nativeRoleSurface("customer").canOpenInAppMap).toBe(false);
    expect(nativeRoleSurface("supplier").canOpenInAppMap).toBe(false);
  });
});
