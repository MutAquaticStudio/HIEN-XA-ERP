import { createBoundedContextHandler } from "./bounded-context-handler";

export const catalogCommandHandler = createBoundedContextHandler("catalog", [
  "updateProductCommercialPolicy"
]);
