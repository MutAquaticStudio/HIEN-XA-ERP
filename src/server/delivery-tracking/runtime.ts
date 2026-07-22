import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { DeliveryTrackingService } from "./service";
import { FileDeliveryTrackingStore } from "@/server/infrastructure/file-delivery-tracking-store";

const trackingGlobal = globalThis as typeof globalThis & {
  vlxdDeliveryTrackingService?: DeliveryTrackingService;
};

export const deliveryTrackingService = trackingGlobal.vlxdDeliveryTrackingService ?? new DeliveryTrackingService(
  new FileDeliveryTrackingStore(),
  async () => (await getDemoOperationsSnapshot()).state
);

if (process.env.NODE_ENV !== "production") {
  trackingGlobal.vlxdDeliveryTrackingService = deliveryTrackingService;
}
