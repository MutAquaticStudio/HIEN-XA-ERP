import { canShowTrackingTab, canViewAssignedDeliveryRoute } from "../lib/tracking-view-policy";

describe("tracking route visibility", () => {
  it("shows the tracking tab to assigned delivery workers without enabling GPS sharing", () => {
    expect(canShowTrackingTab("worker")).toBe(true);
    expect(canViewAssignedDeliveryRoute("worker", false)).toBe(true);
  });

  it("shows the assigned route to drivers while GPS consent remains a separate policy", () => {
    expect(canShowTrackingTab("driver")).toBe(true);
    expect(canViewAssignedDeliveryRoute("driver", false)).toBe(true);
  });

  it("does not expose tracking to customer or supplier roles", () => {
    expect(canShowTrackingTab("customer")).toBe(false);
    expect(canShowTrackingTab("supplier")).toBe(false);
    expect(canViewAssignedDeliveryRoute("customer", false)).toBe(false);
  });

  it("keeps the dispatcher and owner map access through the existing management permission", () => {
    expect(canViewAssignedDeliveryRoute("dispatcher", true)).toBe(true);
    expect(canViewAssignedDeliveryRoute("owner", true)).toBe(true);
  });
});
