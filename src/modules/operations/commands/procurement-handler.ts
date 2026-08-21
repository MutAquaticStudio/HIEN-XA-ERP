import { createBoundedContextHandler } from "./bounded-context-handler";

export const procurementCommandHandler = createBoundedContextHandler("procurement", [
  "confirmPurchaseOrder"
]);
