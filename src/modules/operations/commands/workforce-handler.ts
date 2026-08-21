import { createBoundedContextHandler } from "./bounded-context-handler";

export const workforceCommandHandler = createBoundedContextHandler("workforce", [
  "claimOpenSalesWorkOrder",
  "assignSalesWorkOrder",
  "recordWorkOrderLocation",
  "approveWorkOutput",
  "postCompensation"
]);
