import { findDeliveryForWorkOrder } from "../lib/work-order-detail";

describe("work-order delivery details", () => {
  const deliveries = [
    { id: "delivery-1", documentNo: "GH-0001", salesOrderId: "sales-1", status: "in_transit", plannedDate: "2026-07-29" },
    { id: "delivery-2", documentNo: "GH-0002", salesOrderId: "sales-2", status: "assigned", plannedDate: "2026-07-30" }
  ];

  it("links a worker work order only to its own sales-order delivery", () => {
    expect(findDeliveryForWorkOrder({ salesOrderId: "sales-1" }, deliveries)?.id).toBe("delivery-1");
    expect(findDeliveryForWorkOrder({ salesOrderId: "sales-3" }, deliveries)).toBeUndefined();
  });

  it("does not infer a delivery when the work order is not linked", () => {
    expect(findDeliveryForWorkOrder({}, deliveries)).toBeUndefined();
  });
});
