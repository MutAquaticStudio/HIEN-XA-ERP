import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { OperationsCutoverRehearsal } from "../src/server/infrastructure/operations-cutover-rehearsal";

describe("OperationsCutoverRehearsal", () => {
  it("reads a fixed runtime revision without mutating the source document", async () => {
    const read = async () => ({
      revision: 88,
      payload: {
        schemaVersion: 1,
        state: createInitialOperationsState(),
        idempotencyRecords: []
      }
    });
    const rehearsal = new OperationsCutoverRehearsal({ read } as never);

    const manifest = await rehearsal.exportSnapshot("2026-07-28T00:00:00.000Z");

    expect(manifest.ready).toBe(true);
    expect(manifest.source).toEqual({ namespace: "operations", revision: 88, stateSchemaVersion: 1 });
    expect(manifest.generatedAt).toBe("2026-07-28T00:00:00.000Z");
  });
});
