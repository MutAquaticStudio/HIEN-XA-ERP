import { describe, expect, it } from "vitest";
import { shouldApplyOperationsSnapshot } from "../src/components/erp-v2/modules/use-operations-runtime";

describe("operations post-mutation revision synchronization", () => {
  it("accepts the same or newer revision and rejects stale responses", () => {
    expect(shouldApplyOperationsSnapshot(4, 4)).toBe(true);
    expect(shouldApplyOperationsSnapshot(4, 5)).toBe(true);
    expect(shouldApplyOperationsSnapshot(5, 4)).toBe(false);
  });
});
