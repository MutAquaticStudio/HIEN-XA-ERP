import { describe, expect, it } from "vitest";
import { canRunOperation } from "../src/components/erp-v2/modules/operations-shared";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import type { OperationName, OperationsState } from "../src/modules/operations/types";

function createEmptyOperationsState(): OperationsState {
  const initial = createInitialOperationsState();
  return Object.fromEntries(Object.keys(initial).map((key) => [key, []])) as unknown as OperationsState;
}

describe("operations empty-state readiness", () => {
  it("keeps document operations disabled without throwing when every collection is empty", () => {
    const state = createEmptyOperationsState();
    const operations: OperationName[] = [
      "confirmSalesOrder",
      "confirmCustomerPayment",
      "confirmSupplierPayment",
      "approveWorkOutput",
      "postCompensation",
      "payEmployee"
    ];

    for (const operation of operations) {
      expect(() => canRunOperation(state, operation)).not.toThrow();
      expect(canRunOperation(state, operation)).toEqual(expect.objectContaining({ canRun: false }));
    }
  });
});
