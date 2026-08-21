import { createBoundedContextHandler } from "./bounded-context-handler";

export const salesCommandHandler = createBoundedContextHandler("sales", [
  "confirmSalesOrder",
  "allocateSalesSources"
]);
