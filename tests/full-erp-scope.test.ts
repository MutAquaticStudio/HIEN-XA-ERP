import { describe, expect, it } from "vitest";
import {
  fullErpCapabilities,
  missingFullErpContexts,
  requiredFullErpContexts,
  summarizeFullErpCompletion
} from "../src/modules/operations/full-erp-scope";

describe("full ERP scope", () => {
  it("covers every bounded context required by the ERP operating model", () => {
    expect(missingFullErpContexts()).toEqual([]);
    expect(new Set(fullErpCapabilities.map((capability) => capability.ownerContext)).size).toBe(
      requiredFullErpContexts.length
    );
  });

  it("keeps production readiness counts consistent with capability statuses", () => {
    const summary = summarizeFullErpCompletion();

    expect(summary.total).toBe(fullErpCapabilities.length);
    expect(summary.coreReady + summary.hardeningRequired + summary.planned).toBe(summary.total);
    expect(summary.productionCriticalOpen).toBe(
      fullErpCapabilities.filter((capability) => capability.productionCritical && capability.status !== "core_ready").length
    );
  });

  it("requires a concrete production gap for every capability that is not core-ready", () => {
    const unfinishedCapabilities = fullErpCapabilities.filter((capability) => capability.status !== "core_ready");

    expect(unfinishedCapabilities.length).toBeGreaterThan(0);
    expect(unfinishedCapabilities.every((capability) => capability.productionGap.length >= 20)).toBe(true);
  });
});
