import type { AuditLog, OperationsState } from "./types";

export type AuditIntegrityIssue = {
  severity: "error" | "warning";
  code: string;
  auditId?: string;
  message: string;
};

export type AuditIntegrityReport = {
  status: "healthy" | "warning" | "error";
  auditCount: number;
  correlatedCount: number;
  reversalCount: number;
  issues: AuditIntegrityIssue[];
};

export function createAuditIntegrityReport(state: OperationsState): AuditIntegrityReport {
  const issues: AuditIntegrityIssue[] = [];
  const auditIds = new Set<string>();
  const correlationIds = new Set<string>();
  const processedByKey = new Map(state.processedOperations.map((item) => [item.idempotencyKey, item]));

  for (const event of state.auditLogs) {
    if (auditIds.has(event.id)) {
      issues.push(issue("error", "duplicate_audit_id", `Nhật ký ${event.id} bị trùng định danh.`, event.id));
    }
    auditIds.add(event.id);

    if (!event.actorId || !event.actorName.trim() || !event.action.trim() || !event.entityType.trim() || !event.summary.trim()) {
      issues.push(issue("error", "audit_required_field_missing", `Nhật ký ${event.id} thiếu trường bắt buộc.`, event.id));
    }
    if (Number.isNaN(Date.parse(event.occurredAt))) {
      issues.push(issue("error", "audit_time_invalid", `Nhật ký ${event.id} có thời điểm không hợp lệ.`, event.id));
    }

    const isSystemEvent = event.actorId === "system" || event.action === "OperationsStateCreated";
    if (!isSystemEvent && (!event.permission || !event.before || !event.after)) {
      issues.push(issue("warning", "audit_context_incomplete", `Nhật ký ${event.id} thiếu quyền hoặc ảnh chụp trước/sau.`, event.id));
    }

    if (isReversalAction(event.action)) {
      if (!event.targetId) {
        issues.push(issue("error", "reversal_target_missing", `Nhật ký đảo ${event.id} thiếu chứng từ đích.`, event.id));
      }
      if (!event.reason || event.reason.trim().length < 5) {
        issues.push(issue("error", "reversal_reason_missing", `Nhật ký đảo ${event.id} thiếu lý do hợp lệ.`, event.id));
      }
    }

    if (event.correlationId) {
      if (correlationIds.has(event.correlationId)) {
        issues.push(issue("error", "duplicate_correlation_id", `Mã liên kết ${event.correlationId} xuất hiện nhiều lần.`, event.id));
      }
      correlationIds.add(event.correlationId);
      const processed = processedByKey.get(event.correlationId);
      if (!processed) {
        issues.push(issue("warning", "audit_without_processed_command", `Nhật ký ${event.id} không có thao tác đã xử lý tương ứng.`, event.id));
      } else if (processed.operation !== event.action || processed.summary !== event.summary) {
        issues.push(issue("error", "audit_command_mismatch", `Nhật ký ${event.id} không khớp thao tác hoặc kết quả đã lưu.`, event.id));
      }
    } else if (!isSystemEvent) {
      issues.push(issue("error", "correlation_id_missing", `Nhật ký ${event.id} thiếu mã chống chạy trùng.`, event.id));
    }
  }

  for (const processed of state.processedOperations) {
    if (!state.auditLogs.some((event) => event.correlationId === processed.idempotencyKey)) {
      issues.push(issue("error", "processed_command_without_audit", `Thao tác ${processed.operation} đã xử lý nhưng thiếu nhật ký hoạt động.`));
    }
  }

  return {
    status: issues.some((item) => item.severity === "error") ? "error" : issues.length > 0 ? "warning" : "healthy",
    auditCount: state.auditLogs.length,
    correlatedCount: state.auditLogs.filter((event) => Boolean(event.correlationId)).length,
    reversalCount: state.auditLogs.filter((event) => isReversalAction(event.action)).length,
    issues
  };
}

export function getNewAuditIntegrityErrors(before: OperationsState, after: OperationsState) {
  const previousCounts = new Map<string, number>();
  for (const item of createAuditIntegrityReport(before).issues.filter((issue) => issue.severity === "error")) {
    const key = auditIssueKey(item);
    previousCounts.set(key, (previousCounts.get(key) ?? 0) + 1);
  }

  return createAuditIntegrityReport(after).issues.filter((item) => {
    if (item.severity !== "error") {
      return false;
    }
    const key = auditIssueKey(item);
    const previousCount = previousCounts.get(key) ?? 0;
    if (previousCount <= 0) {
      return true;
    }
    previousCounts.set(key, previousCount - 1);
    return false;
  });
}

export function createAuditLogCsv(logs: AuditLog[]) {
  const rows: Array<Array<string>> = [
    ["Thời điểm", "Người thao tác", "Vai trò", "Thao tác", "Quyền", "Chứng từ liên quan", "Lý do", "Mã liên kết", "Tóm tắt"],
    ...logs.map((event) => [
      event.occurredAt,
      event.actorName,
      event.actorRole ?? "",
      event.action,
      event.permission ?? "",
      event.targetId ?? "",
      event.reason ?? "",
      event.correlationId ?? "",
      event.summary
    ])
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

function isReversalAction(action: string) {
  return action.startsWith("reverse") || action === "failDelivery";
}

function issue(severity: "error" | "warning", code: string, message: string, auditId?: string): AuditIntegrityIssue {
  return { severity, code, message, auditId };
}

function auditIssueKey(item: AuditIntegrityIssue) {
  return `${item.code}|${item.auditId ?? "-"}|${item.message}`;
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
