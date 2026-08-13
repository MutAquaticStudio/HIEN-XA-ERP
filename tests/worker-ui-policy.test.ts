import { describe, expect, it } from "vitest";
import { deliveryLineQuantityInputMode } from "../src/modules/operations/worker-ui-policy";

describe("worker delivery UI policy", () => {
  it("keeps completed delivery quantities server-derived for workers and drivers", () => {
    expect(deliveryLineQuantityInputMode("worker", "submitDeliveryCompletion")).toBe("server_derived");
    expect(deliveryLineQuantityInputMode("driver", "submitDeliveryCompletion")).toBe("server_derived");
  });

  it("allows field staff to propose a discrepancy without directly changing delivery", () => {
    expect(deliveryLineQuantityInputMode("worker", "requestDeliveryQuantityChange")).toBe("propose_for_approval");
    expect(deliveryLineQuantityInputMode("driver", "requestDeliveryQuantityChange")).toBe("propose_for_approval");
  });

  it("keeps the existing editable review controls for authorized office roles", () => {
    expect(deliveryLineQuantityInputMode("owner", "submitDeliveryCompletion")).toBe("editable");
  });
});
