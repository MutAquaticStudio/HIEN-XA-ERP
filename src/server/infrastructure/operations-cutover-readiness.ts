export const CUTOVER_BOUNDARIES = [
  "identity",
  "master_data",
  "sales",
  "procurement",
  "inventory",
  "delivery",
  "receivables",
  "payables",
  "cash",
  "workforce",
  "compensation",
  "attachments",
  "approvals",
  "communications",
  "push",
  "tracking",
  "import",
  "audit",
  "idempotency"
] as const;

export type CutoverBoundary = (typeof CUTOVER_BOUNDARIES)[number];
export type CutoverReadinessStage = "staging_rehearsal" | "production_activation";
export type MutationBackend = "runtime_document" | "normalized_postgres";

export interface CutoverBoundaryEvidence {
  mapped: boolean;
  repositoryBacked: boolean;
  authorizationVerified: boolean;
  integrationVerified: boolean;
}

export interface CutoverControlPlaneEvidence {
  normalizedSchemaVerified: boolean;
  rlsVerified: boolean;
  storagePrivateVerified: boolean;
  migrationRehearsalVerified: boolean;
  reconciliationVerified: boolean;
  backupVerified: boolean;
  rollbackVerified: boolean;
  maintenanceWindowVerified: boolean;
  liveRoutesVerified: boolean;
  endToEndVerified: boolean;
  securityScanVerified: boolean;
}

export interface CutoverSourceEvidence {
  namespace: string;
  revision: number;
  checksum: string;
  schemaVersion: number;
}

export interface CutoverReadinessEvidence {
  stage: CutoverReadinessStage;
  mutationBackend: MutationBackend;
  source: CutoverSourceEvidence;
  boundaries: Partial<Record<CutoverBoundary, CutoverBoundaryEvidence>>;
  controlPlane: CutoverControlPlaneEvidence;
}

export type CutoverReadinessCode =
  | "SOURCE_NAMESPACE_REQUIRED"
  | "SOURCE_REVISION_INVALID"
  | "SOURCE_CHECKSUM_INVALID"
  | "SOURCE_SCHEMA_VERSION_INVALID"
  | "NORMALIZED_MUTATION_REPOSITORY_REQUIRED"
  | "BOUNDARY_EVIDENCE_MISSING"
  | "BOUNDARY_MAPPING_INCOMPLETE"
  | "BOUNDARY_REPOSITORY_INCOMPLETE"
  | "BOUNDARY_AUTHORIZATION_UNVERIFIED"
  | "BOUNDARY_INTEGRATION_UNVERIFIED"
  | "NORMALIZED_SCHEMA_UNVERIFIED"
  | "RLS_UNVERIFIED"
  | "PRIVATE_STORAGE_UNVERIFIED"
  | "MIGRATION_REHEARSAL_UNVERIFIED"
  | "RECONCILIATION_UNVERIFIED"
  | "BACKUP_UNVERIFIED"
  | "ROLLBACK_UNVERIFIED"
  | "MAINTENANCE_WINDOW_UNVERIFIED"
  | "LIVE_ROUTES_UNVERIFIED"
  | "END_TO_END_UNVERIFIED"
  | "SECURITY_SCAN_UNVERIFIED";

export interface CutoverReadinessBlocker {
  code: CutoverReadinessCode;
  subject?: CutoverBoundary;
  message: string;
}

export interface CutoverReadinessResult {
  ready: boolean;
  stage: CutoverReadinessStage;
  blockers: CutoverReadinessBlocker[];
  nextActions: string[];
}

const SHA_256_PATTERN = /^[a-f0-9]{64}$/;

const controlPlaneRequirements: Array<{
  key: keyof CutoverControlPlaneEvidence;
  code: CutoverReadinessCode;
  message: string;
  productionOnly?: boolean;
}> = [
  {
    key: "normalizedSchemaVerified",
    code: "NORMALIZED_SCHEMA_UNVERIFIED",
    message: "Chưa xác nhận schema PostgreSQL chuẩn hóa trên staging."
  },
  {
    key: "rlsVerified",
    code: "RLS_UNVERIFIED",
    message: "Chưa kiểm thử RLS và quyền RPC server-only trên staging."
  },
  {
    key: "storagePrivateVerified",
    code: "PRIVATE_STORAGE_UNVERIFIED",
    message: "Chưa kiểm thử policy Storage private cho chứng từ và ảnh xác nhận."
  },
  {
    key: "migrationRehearsalVerified",
    code: "MIGRATION_REHEARSAL_UNVERIFIED",
    message: "Chưa có rehearsal migration một chiều thành công."
  },
  {
    key: "reconciliationVerified",
    code: "RECONCILIATION_UNVERIFIED",
    message: "Chưa có biên bản đối chiếu kho, công nợ, quỹ, tiền công và audit bằng 0.",
    productionOnly: true
  },
  {
    key: "backupVerified",
    code: "BACKUP_UNVERIFIED",
    message: "Chưa xác nhận backup có thể khôi phục trước cutover.",
    productionOnly: true
  },
  {
    key: "rollbackVerified",
    code: "ROLLBACK_UNVERIFIED",
    message: "Chưa kiểm chứng rollback runbook.",
    productionOnly: true
  },
  {
    key: "maintenanceWindowVerified",
    code: "MAINTENANCE_WINDOW_UNVERIFIED",
    message: "Chưa xác nhận cửa sổ bảo trì và chế độ read-only.",
    productionOnly: true
  },
  {
    key: "liveRoutesVerified",
    code: "LIVE_ROUTES_UNVERIFIED",
    message: "Chưa kiểm tra route production sau khi chuyển traffic.",
    productionOnly: true
  },
  {
    key: "endToEndVerified",
    code: "END_TO_END_UNVERIFIED",
    message: "Chưa có UAT/E2E đầy đủ cho các vai trò trong pilot.",
    productionOnly: true
  },
  {
    key: "securityScanVerified",
    code: "SECURITY_SCAN_UNVERIFIED",
    message: "Chưa có deep security scan mới sau thay đổi cutover.",
    productionOnly: true
  }
];

function addBlocker(
  blockers: CutoverReadinessBlocker[],
  code: CutoverReadinessCode,
  message: string,
  subject?: CutoverBoundary
) {
  blockers.push({ code, message, subject });
}

/**
 * Evaluates evidence only. It never switches traffic, runs a migration, or
 * writes a cutover record. A production activation remains intentionally
 * blocked until every normalized boundary and external operational gate has
 * evidence.
 */
export function assessCutoverReadiness(evidence: CutoverReadinessEvidence): CutoverReadinessResult {
  const blockers: CutoverReadinessBlocker[] = [];

  if (!evidence.source.namespace.trim()) {
    addBlocker(blockers, "SOURCE_NAMESPACE_REQUIRED", "Thiếu namespace của runtime snapshot.");
  }
  if (!Number.isSafeInteger(evidence.source.revision) || evidence.source.revision < 0) {
    addBlocker(blockers, "SOURCE_REVISION_INVALID", "Revision của runtime snapshot không hợp lệ.");
  }
  if (!SHA_256_PATTERN.test(evidence.source.checksum)) {
    addBlocker(blockers, "SOURCE_CHECKSUM_INVALID", "Checksum runtime snapshot phải là SHA-256 hợp lệ.");
  }
  if (!Number.isSafeInteger(evidence.source.schemaVersion) || evidence.source.schemaVersion <= 0) {
    addBlocker(blockers, "SOURCE_SCHEMA_VERSION_INVALID", "Schema version của runtime snapshot không hợp lệ.");
  }

  if (evidence.mutationBackend !== "normalized_postgres") {
    addBlocker(
      blockers,
      "NORMALIZED_MUTATION_REPOSITORY_REQUIRED",
      "Mutation nghiệp vụ vẫn ghi runtime document; chưa được chuyển sang repository PostgreSQL chuẩn hóa."
    );
  }

  for (const boundary of CUTOVER_BOUNDARIES) {
    const boundaryEvidence = evidence.boundaries[boundary];
    if (!boundaryEvidence) {
      addBlocker(blockers, "BOUNDARY_EVIDENCE_MISSING", `Thiếu evidence cho boundary ${boundary}.`, boundary);
      continue;
    }
    if (!boundaryEvidence.mapped) {
      addBlocker(blockers, "BOUNDARY_MAPPING_INCOMPLETE", `Chưa map đầy đủ boundary ${boundary}.`, boundary);
    }
    if (!boundaryEvidence.repositoryBacked) {
      addBlocker(
        blockers,
        "BOUNDARY_REPOSITORY_INCOMPLETE",
        `Boundary ${boundary} chưa có repository PostgreSQL transaction.`,
        boundary
      );
    }
    if (!boundaryEvidence.authorizationVerified) {
      addBlocker(
        blockers,
        "BOUNDARY_AUTHORIZATION_UNVERIFIED",
        `Boundary ${boundary} chưa có bằng chứng authorization/RLS.`,
        boundary
      );
    }
    if (!boundaryEvidence.integrationVerified) {
      addBlocker(
        blockers,
        "BOUNDARY_INTEGRATION_UNVERIFIED",
        `Boundary ${boundary} chưa có database integration test đạt.`,
        boundary
      );
    }
  }

  for (const requirement of controlPlaneRequirements) {
    if (requirement.productionOnly && evidence.stage !== "production_activation") {
      continue;
    }
    if (!evidence.controlPlane[requirement.key]) {
      addBlocker(blockers, requirement.code, requirement.message);
    }
  }

  const nextActions = blockers.length === 0
    ? [
        evidence.stage === "production_activation"
          ? "Có thể ghi checkpoint vào control plane và thực hiện cutover theo runbook đã duyệt."
          : "Có thể bắt đầu rehearsal một chiều trên staging cô lập."
      ]
    : [
        "Không chuyển traffic hoặc bật production_active khi còn blocker.",
        "Khắc phục từng blocker, lưu evidence trên staging, rồi đánh giá lại bằng snapshot checksum mới."
      ];

  return {
    ready: blockers.length === 0,
    stage: evidence.stage,
    blockers,
    nextActions
  };
}
