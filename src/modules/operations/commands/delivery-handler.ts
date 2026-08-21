import { createBoundedContextHandler } from "./bounded-context-handler";

export const deliveryCommandHandler = createBoundedContextHandler("delivery", [
  "confirmDirectDelivery",
  "reverseDirectDelivery",
  "startDeliveryLoading",
  "dispatchDelivery",
  "requestDeliveryQuantityChange",
  "approveDeliveryQuantityChange",
  "rejectDeliveryQuantityChange",
  "confirmCustomerDeliveryReceipt",
  "waiveCustomerDeliveryReceipt",
  "submitDeliveryCompletion",
  "approveDeliveryCompletion",
  "rejectDeliveryCompletion",
  "completeDelivery",
  "failDelivery"
]);
