import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeliveryTrackingConsent,
  DeliveryTrackingEvent,
  DeliveryTrackingPoint,
  DeliveryTrackingRetentionResult,
  DeliveryTrackingSession,
  DeliveryTrackingState,
  DeliveryTrackingStore,
  TrackingEventInput
} from "@/server/delivery-tracking/types";
import { getSupabaseServerClient } from "./supabase-server-client";

const maxSessionsInSnapshot = 1_000;
const maxPointsInSnapshot = 20_000;
const maxEventsInSnapshot = 4_000;

export class SupabaseDeliveryTrackingStore implements DeliveryTrackingStore {
  constructor(private readonly client: SupabaseClient = getSupabaseServerClient()) {}

  async getSnapshot(): Promise<DeliveryTrackingState> {
    const database = this.client as any;
    const sessionsResult = await database
      .from("delivery_tracking_sessions")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(maxSessionsInSnapshot);
    if (sessionsResult.error) throw new Error(`Không thể đọc phiên GPS: ${sessionsResult.error.message}`);
    const sessionRows = (sessionsResult.data ?? []) as Array<Record<string, unknown>>;
    const sessionIds = sessionRows.map((row) => String(row.id));
    const consentsResult = await database
      .from("delivery_tracking_consents")
      .select("*")
      .order("granted_at", { ascending: false })
      .limit(maxSessionsInSnapshot);
    if (consentsResult.error) throw new Error(`Không thể đọc xác nhận GPS: ${consentsResult.error.message}`);

    const [pointsResult, eventsResult] = await Promise.all([
      sessionIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : database.from("delivery_tracking_points").select("*").in("session_id", sessionIds).order("recorded_at", { ascending: false }).limit(maxPointsInSnapshot),
      database.from("delivery_tracking_events").select("*").order("occurred_at", { ascending: false }).limit(maxEventsInSnapshot)
    ]);
    if (pointsResult.error) throw new Error(`Không thể đọc điểm GPS: ${pointsResult.error.message}`);
    if (eventsResult.error) throw new Error(`Không thể đọc audit GPS: ${eventsResult.error.message}`);

    const pointsBySession = new Map<string, DeliveryTrackingPoint[]>();
    for (const row of (pointsResult.data ?? []) as Array<Record<string, unknown>>) {
      const sessionId = String(row.session_id);
      const points = pointsBySession.get(sessionId) ?? [];
      points.push(toPoint(row));
      pointsBySession.set(sessionId, points);
    }
    const events = ((eventsResult.data ?? []) as Array<Record<string, unknown>>).map(toEvent);
    const sessions = sessionRows.map((row) => {
      const points = (pointsBySession.get(String(row.id)) ?? []).reverse().slice(-2_400);
      return toSession(row, points);
    });
    const consents = ((consentsResult.data ?? []) as Array<Record<string, unknown>>).map(toConsent);
    const revision = [...sessions.map((session) => new Date(session.stoppedAt ?? session.startedAt).getTime()), ...consents.map((consent) => new Date(consent.revokedAt ?? consent.grantedAt).getTime())]
      .reduce((latest, value) => Math.max(latest, value), 0);
    return { revision, sessions, consents, events };
  }

  async grantConsent(input: { consent: DeliveryTrackingConsent; event: TrackingEventInput }) {
    const result = await this.rpc("delivery_tracking_grant_consent", {
      p_consent_id: input.consent.id,
      p_delivery_job_id: input.consent.deliveryJobId,
      p_employee_id: input.consent.employeeId,
      p_policy_version: input.consent.policyVersion,
      p_idempotency_key: input.consent.idempotencyKey,
      p_actor_id: input.event.actorId ?? null,
      p_granted_at: input.consent.grantedAt,
      p_summary: input.event.summary
    });
    return { consentId: String(result.consent_id ?? result.consentId), created: Boolean(result.created), idempotencyConflict: Boolean(result.idempotency_conflict ?? result.idempotencyConflict) };
  }

  async revokeConsent(input: { consentId: string; employeeId: string; expectedVersion: number; idempotencyKey: string; revokedAt: string; actorId: string; event: TrackingEventInput }) {
    const result = await this.rpc("delivery_tracking_revoke_consent", {
      p_consent_id: input.consentId,
      p_employee_id: input.employeeId,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
      p_actor_id: input.actorId,
      p_revoked_at: input.revokedAt,
      p_summary: input.event.summary
    });
    return { updated: Boolean(result.updated), replayed: Boolean(result.replayed), conflict: Boolean(result.conflict), forbidden: Boolean(result.forbidden), missing: Boolean(result.missing) };
  }

  async startSession(input: { session: DeliveryTrackingSession; event: TrackingEventInput }) {
    const result = await this.rpc("delivery_tracking_start_session", {
      p_session_id: input.session.id,
      p_delivery_job_id: input.session.deliveryJobId,
      p_employee_id: input.session.employeeId,
      p_started_at: input.session.startedAt,
      p_retention_purge_after: input.session.retentionPurgeAfter,
      p_actor_id: input.event.actorId ?? null,
      p_summary: input.event.summary
    });
    return { sessionId: String(result.session_id ?? result.sessionId), created: Boolean(result.created) };
  }

  async appendPoint(input: { sessionId: string; point: DeliveryTrackingPoint }) {
    const result = await this.rpc("delivery_tracking_record_point", {
      p_session_id: input.sessionId,
      p_client_point_id: input.point.clientPointId,
      p_recorded_at: input.point.recordedAt,
      p_received_at: input.point.receivedAt,
      p_latitude: input.point.latitude,
      p_longitude: input.point.longitude,
      p_accuracy_meters: input.point.accuracyMeters ?? null,
      p_heading_degrees: input.point.headingDegrees ?? null,
      p_speed_meters_per_second: input.point.speedMetersPerSecond ?? null,
      p_quality: input.point.quality,
      p_suspect_reason: input.point.suspectReason ?? null
    });
    return { duplicate: Boolean(result.duplicate) };
  }

  async stopSession(input: { sessionId: string; stoppedAt: string; retentionPurgeAfter: string; event: TrackingEventInput }) {
    await this.rpc("delivery_tracking_stop_session", {
      p_session_id: input.sessionId,
      p_stopped_at: input.stoppedAt,
      p_retention_purge_after: input.retentionPurgeAfter,
      p_actor_id: input.event.actorId ?? null,
      p_summary: input.event.summary
    });
  }

  async createShare(input: { sessionId: string; publicTokenHash: string; shareExpiresAt: string; event: TrackingEventInput }) {
    await this.rpc("delivery_tracking_create_share", {
      p_session_id: input.sessionId,
      p_public_token_hash: input.publicTokenHash,
      p_share_expires_at: input.shareExpiresAt,
      p_actor_id: input.event.actorId ?? null,
      p_summary: input.event.summary
    });
  }

  async revokeShare(input: { sessionId: string; revokedAt: string; event: TrackingEventInput }) {
    await this.rpc("delivery_tracking_revoke_share", {
      p_session_id: input.sessionId,
      p_revoked_at: input.revokedAt,
      p_actor_id: input.event.actorId ?? null,
      p_summary: input.event.summary
    });
  }

  async purge(input: { now: string; dryRun: boolean }): Promise<DeliveryTrackingRetentionResult> {
    const result = await this.rpc("delivery_tracking_purge_retention", { p_now: input.now, p_dry_run: input.dryRun });
    return {
      expiredShares: Number(result.expired_shares ?? result.expiredShares ?? 0),
      purgedSessions: Number(result.purged_sessions ?? result.purgedSessions ?? 0),
      purgedPoints: Number(result.purged_points ?? result.purgedPoints ?? 0),
      dryRun: Boolean(result.dry_run ?? result.dryRun)
    };
  }

  private async rpc(name: string, parameters: Record<string, unknown>) {
    const { data, error } = await this.client.rpc(name, parameters);
    if (error) throw new Error(`Không thể cập nhật dữ liệu GPS: ${error.message}`);
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result !== "object") throw new Error(`Phản hồi GPS từ máy chủ không hợp lệ cho ${name}.`);
    return result as Record<string, unknown>;
  }
}

function toPoint(row: Record<string, unknown>): DeliveryTrackingPoint {
  return {
    clientPointId: String(row.client_point_id),
    recordedAt: String(row.recorded_at),
    receivedAt: String(row.received_at),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracyMeters: row.accuracy_meters === null || row.accuracy_meters === undefined ? undefined : Number(row.accuracy_meters),
    headingDegrees: row.heading_degrees === null || row.heading_degrees === undefined ? undefined : Number(row.heading_degrees),
    speedMetersPerSecond: row.speed_meters_per_second === null || row.speed_meters_per_second === undefined ? undefined : Number(row.speed_meters_per_second),
    quality: row.quality === "suspect" ? "suspect" : "accepted",
    suspectReason: typeof row.suspect_reason === "string" ? row.suspect_reason as DeliveryTrackingPoint["suspectReason"] : undefined
  };
}

function toSession(row: Record<string, unknown>, points: DeliveryTrackingPoint[]): DeliveryTrackingSession {
  const latest = row.latest_recorded_at
    ? points.find((point) => point.recordedAt === String(row.latest_recorded_at) && point.quality === "accepted")
    : undefined;
  return {
    id: String(row.id),
    deliveryJobId: String(row.delivery_job_id),
    employeeId: String(row.employee_id),
    status: row.status === "stopped" || row.status === "expired" ? row.status : "active",
    startedAt: String(row.started_at),
    stoppedAt: typeof row.stopped_at === "string" ? row.stopped_at : undefined,
    publicTokenHash: typeof row.public_token_hash === "string" ? row.public_token_hash : undefined,
    shareExpiresAt: typeof row.share_expires_at === "string" ? row.share_expires_at : undefined,
    shareRevokedAt: typeof row.share_revoked_at === "string" ? row.share_revoked_at : undefined,
    retentionPurgeAfter: String(row.retention_purge_after ?? row.stopped_at ?? row.started_at),
    latestPoint: latest,
    points
  };
}

function toConsent(row: Record<string, unknown>): DeliveryTrackingConsent {
  return {
    id: String(row.id),
    deliveryJobId: String(row.delivery_job_id),
    employeeId: String(row.employee_id),
    policyVersion: String(row.policy_version),
    status: row.status === "revoked" ? "revoked" : "granted",
    grantedAt: String(row.granted_at),
    grantedBy: String(row.granted_by),
    idempotencyKey: String(row.idempotency_key),
    version: Number(row.version ?? 1),
    revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : undefined,
    revokedBy: typeof row.revoked_by === "string" ? row.revoked_by : undefined,
    revocationIdempotencyKey: typeof row.revocation_idempotency_key === "string" ? row.revocation_idempotency_key : undefined
  };
}

function toEvent(row: Record<string, unknown>): DeliveryTrackingEvent {
  return {
    id: String(row.id),
    sessionId: typeof row.session_id === "string" ? row.session_id : undefined,
    deliveryJobId: typeof row.delivery_job_id === "string" ? row.delivery_job_id : undefined,
    actorId: typeof row.actor_id === "string" ? row.actor_id : undefined,
    action: row.action as DeliveryTrackingEvent["action"],
    occurredAt: String(row.occurred_at),
    summary: String(row.summary)
  };
}
