import { describe, expect, it } from "vitest";
import { assertOperationsMutationAllowed } from "../src/server/application/operations-command-service";

function expectOperationError(operation: () => unknown, code: string, status: number) {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code, status });
}

describe("ERP maintenance mode", () => {
  it("fails closed for operational mutations during a read-only maintenance window", () => {
    expectOperationError(() => assertOperationsMutationAllowed({ ERP_MAINTENANCE_MODE: "read_only" }), "ERP_MAINTENANCE_READ_ONLY", 412);
  });

  it("permits normal command execution outside the maintenance window", () => {
    expect(() => assertOperationsMutationAllowed({ ERP_MAINTENANCE_MODE: "off" })).not.toThrow();
    expect(() => assertOperationsMutationAllowed({})).not.toThrow();
  });
});
