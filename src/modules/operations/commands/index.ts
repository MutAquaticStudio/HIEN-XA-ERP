import type { OperationResult } from "../types";
import { catalogCommandHandler } from "./catalog-handler";
import { controlsCommandHandler } from "./controls-handler";
import { deliveryCommandHandler } from "./delivery-handler";
import { financeCommandHandler } from "./finance-handler";
import { inventoryCommandHandler } from "./inventory-handler";
import { procurementCommandHandler } from "./procurement-handler";
import { salesCommandHandler } from "./sales-handler";
import { workforceCommandHandler } from "./workforce-handler";
import type { RunOperationInput } from "./domain-engine";

export const erpV2BoundedContextHandlers = [
  catalogCommandHandler,
  salesCommandHandler,
  procurementCommandHandler,
  inventoryCommandHandler,
  deliveryCommandHandler,
  financeCommandHandler,
  workforceCommandHandler,
  controlsCommandHandler
] as const;

export function runOperation(input: RunOperationInput): OperationResult {
  const handler = erpV2BoundedContextHandlers.find((candidate) => candidate.operations.has(input.operation));
  if (!handler) {
    throw new Error(`ERP_V2_HANDLER_MISSING: chưa đăng ký bounded-context handler cho ${input.operation}.`);
  }
  return handler.execute(input);
}

export {
  ORDER_ALREADY_CLAIMED,
  createAuditLog,
  createAuditSnapshot,
  createOwnerActor,
  createRoleActor,
  erpV2OperationPermissions
} from "./domain-engine";
export type { RunOperationInput } from "./domain-engine";
