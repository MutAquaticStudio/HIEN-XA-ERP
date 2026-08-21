import type { OperationName, OperationResult } from "../types";
import { runCoreOperation, type RunOperationInput } from "./domain-engine";

export type BoundedContextHandler = {
  context: string;
  operations: ReadonlySet<OperationName>;
  execute(input: RunOperationInput): OperationResult;
};

export function createBoundedContextHandler(
  context: string,
  operations: readonly OperationName[]
): BoundedContextHandler {
  const supportedOperations = new Set(operations);
  return {
    context,
    operations: supportedOperations,
    execute(input) {
      if (!supportedOperations.has(input.operation)) {
        throw new Error(`ERP_V2_CONTEXT_MISMATCH: ${input.operation} không thuộc bounded context ${context}.`);
      }
      return runCoreOperation(input);
    }
  };
}
