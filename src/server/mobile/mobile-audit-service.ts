import { z } from "zod";
import { createAuditIntegrityReport, createAuditLogCsv } from "@/modules/operations/audit-integrity";
import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { visibleModulesForIdentity } from "@/server/identity/auth-context";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";
import type { SafeIdentityUser } from "@/server/identity/types";
import { PublicApiError } from "@/server/shared/public-api-error";

const auditQuerySchema = z.object({ query: z.string().trim().max(120).optional(), limit: z.coerce.number().int().min(1).max(100).default(40) });
const auditIdSchema = z.string().trim().min(1).max(128);

export async function getMobileAuditOverview(user: SafeIdentityUser, input: unknown) {
  requireAuditView(user);
  const query = auditQuerySchema.parse(input);
  const snapshot = projectOperationsSnapshot(await getDemoOperationsSnapshot(), user);
  const normalizedQuery = normalize(query.query);
  const logs = snapshot.state.auditLogs
    .filter((event) => !normalizedQuery || normalize([event.actorName, event.action, event.summary, event.targetId, event.correlationId, event.reason].filter(Boolean).join(" ")).includes(normalizedQuery))
    .slice()
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, query.limit)
    .map(toAuditListItem);
  const integrity = createAuditIntegrityReport(snapshot.state);
  return { revision: snapshot.revision, syncedAt: snapshot.syncedAt, integrity, logs };
}

export async function getMobileAuditDetail(user: SafeIdentityUser, auditId: string) {
  requireAuditView(user);
  const snapshot = projectOperationsSnapshot(await getDemoOperationsSnapshot(), user);
  const audit = snapshot.state.auditLogs.find((event) => event.id === auditIdSchema.parse(auditId));
  if (!audit) throw new PublicApiError(403, "Không tìm thấy nhật ký trong phạm vi được cấp quyền.");
  const sensitiveDetail = user.role === "owner" || user.role === "administrator";
  return { revision: snapshot.revision, syncedAt: snapshot.syncedAt, audit: { ...toAuditListItem(audit), reason: audit.reason, correlationId: audit.correlationId, before: sensitiveDetail ? audit.before : undefined, after: sensitiveDetail ? audit.after : undefined, detailRedacted: !sensitiveDetail } };
}

export async function getMobileAuditCsv(user: SafeIdentityUser) {
  requireAuditView(user);
  const snapshot = projectOperationsSnapshot(await getDemoOperationsSnapshot(), user);
  return createAuditLogCsv(snapshot.state.auditLogs);
}

function requireAuditView(user: SafeIdentityUser) { if (!visibleModulesForIdentity(user).includes("audit")) throw new PublicApiError(403, "Tài khoản này không có quyền xem nhật ký kiểm toán trên điện thoại."); }
function toAuditListItem(event: { id: string; actorName: string; action: string; targetId?: string; occurredAt: string; summary: string; permission?: string }) { return { id: event.id, actorName: event.actorName, action: event.action, targetId: event.targetId, occurredAt: event.occurredAt, summary: event.summary, permission: event.permission }; }
function normalize(value: string | undefined) { return (value ?? "").toLocaleLowerCase("vi-VN").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d"); }
