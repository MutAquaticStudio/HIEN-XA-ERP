import { describe, expect, it } from "vitest";
import { erpV2BoundedContextHandlers, erpV2OperationPermissions } from "@/modules/operations/commands";

describe("ERP V2 bounded-context command handlers", () => {
  it("registers every operation exactly once", () => {
    const registered = erpV2BoundedContextHandlers.flatMap((handler) => [...handler.operations]);
    expect(new Set(registered).size).toBe(registered.length);
    expect([...registered].sort()).toEqual(Object.keys(erpV2OperationPermissions).sort());
  });
});
