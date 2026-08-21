import { describe, expect, it } from "vitest";
import { assertErpV2MutationAllowed } from "../src/server/application/erp-v2-command-service";

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
    expectOperationError(() => assertErpV2MutationAllowed({ ERP_MAINTENANCE_MODE: "read_only" }), "ERP_MAINTENANCE_READ_ONLY", 412);
  });

  it("permits normal command execution outside the maintenance window", () => {
    expect(() => assertErpV2MutationAllowed({ ERP_MAINTENANCE_MODE: "off" })).not.toThrow();
    expect(() => assertErpV2MutationAllowed({})).not.toThrow();
  });
});
