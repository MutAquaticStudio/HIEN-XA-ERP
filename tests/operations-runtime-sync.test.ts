import { describe, expect, it } from "vitest";
import { getSyncRetryDelay, hasSyncRetryBudget, shouldApplyOperationsSnapshot } from "../src/components/erp-v2/modules/use-operations-runtime";

describe("operations post-mutation revision synchronization", () => {
  it("accepts the same or newer revision and rejects stale responses", () => {
    expect(shouldApplyOperationsSnapshot(4, 4)).toBe(true);
    expect(shouldApplyOperationsSnapshot(4, 5)).toBe(true);
    expect(shouldApplyOperationsSnapshot(5, 4)).toBe(false);
  });

  it("uses finite, increasing retry delays and stops scheduling forever", () => {
    expect(hasSyncRetryBudget(0)).toBe(true);
    expect(hasSyncRetryBudget(2)).toBe(true);
    expect(hasSyncRetryBudget(3)).toBe(false);
    expect(getSyncRetryDelay(0)).toBe(1000);
    expect(getSyncRetryDelay(1)).toBe(3000);
    expect(getSyncRetryDelay(2)).toBe(7000);
    expect(getSyncRetryDelay(99)).toBe(7000);
  });
});
