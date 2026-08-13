import { describe, expect, it } from "vitest";
import {
  CUTOVER_BOUNDARIES,
  assessCutoverReadiness,
  type CutoverReadinessEvidence
} from "@/server/infrastructure/operations-cutover-readiness";

function completeEvidence(stage: CutoverReadinessEvidence["stage"]): CutoverReadinessEvidence {
  return {
    stage,
    mutationBackend: "normalized_postgres",
    source: {
      namespace: "operations",
      revision: 42,
      checksum: "a".repeat(64),
      schemaVersion: 1
    },
    boundaries: Object.fromEntries(
      CUTOVER_BOUNDARIES.map((boundary) => [
        boundary,
        {
          mapped: true,
          repositoryBacked: true,
          authorizationVerified: true,
          integrationVerified: true
        }
      ])
    ),
    controlPlane: {
      normalizedSchemaVerified: true,
      rlsVerified: true,
      storagePrivateVerified: true,
      migrationRehearsalVerified: true,
      reconciliationVerified: true,
      backupVerified: true,
      rollbackVerified: true,
      maintenanceWindowVerified: true,
      liveRoutesVerified: true,
      endToEndVerified: true,
      securityScanVerified: true
    }
  };
}

describe("assessCutoverReadiness", () => {
  it("allows a complete, evidence-backed production activation", () => {
    const result = assessCutoverReadiness(completeEvidence("production_activation"));

    expect(result).toEqual({
      ready: true,
      stage: "production_activation",
      blockers: [],
      nextActions: ["Có thể ghi checkpoint vào control plane và thực hiện cutover theo runbook đã duyệt."]
    });
  });

  it("fails closed while mutations still use the runtime document backend", () => {
    const evidence = completeEvidence("staging_rehearsal");
    evidence.mutationBackend = "runtime_document";

    const result = assessCutoverReadiness(evidence);

    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "NORMALIZED_MUTATION_REPOSITORY_REQUIRED" })
      ])
    );
  });

  it("reports the exact deferred boundary instead of allowing partial mappings", () => {
    const evidence = completeEvidence("staging_rehearsal");
    delete evidence.boundaries.tracking;

    const result = assessCutoverReadiness(evidence);

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual({
      code: "BOUNDARY_EVIDENCE_MISSING",
      subject: "tracking",
      message: "Thiếu evidence cho boundary tracking."
    });
  });

  it("requires operational evidence before production activation", () => {
    const evidence = completeEvidence("production_activation");
    evidence.controlPlane.backupVerified = false;
    evidence.controlPlane.reconciliationVerified = false;

    const result = assessCutoverReadiness(evidence);
    const codes = result.blockers.map((blocker) => blocker.code);

    expect(codes).toContain("BACKUP_UNVERIFIED");
    expect(codes).toContain("RECONCILIATION_UNVERIFIED");
  });
});
