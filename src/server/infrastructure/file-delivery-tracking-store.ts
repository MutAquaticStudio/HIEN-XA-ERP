import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import type {
  DeliveryTrackingConsent,
  DeliveryTrackingRetentionResult,
  DeliveryTrackingSession,
  DeliveryTrackingState,
  DeliveryTrackingStore,
  TrackingEventInput
} from "@/server/delivery-tracking/types";

const emptyState = (): DeliveryTrackingState => ({ revision: 0, sessions: [], consents: [], events: [] });

abstract class BaseDeliveryTrackingStore implements DeliveryTrackingStore {
  abstract getSnapshot(): Promise<DeliveryTrackingState>;
  protected abstract update<T>(callback: (state: DeliveryTrackingState) => T | Promise<T>): Promise<T>;

  async grantConsent(input: { consent: DeliveryTrackingConsent; event: TrackingEventInput }) {
    return this.update((state) => {
      const replay = state.consents.find((consent) => consent.employeeId === input.consent.employeeId && consent.idempotencyKey === input.consent.idempotencyKey);
      if (replay) {
        return {
          consentId: replay.id,
          created: false,
          idempotencyConflict: replay.deliveryJobId !== input.consent.deliveryJobId || replay.policyVersion !== input.consent.policyVersion
        };
      }
      const active = state.consents.find((consent) =>
        consent.deliveryJobId === input.consent.deliveryJobId &&
        consent.employeeId === input.consent.employeeId &&
        consent.policyVersion === input.consent.policyVersion &&
        consent.status === "granted"
      );
      if (active) return { consentId: active.id, created: false, idempotencyConflict: false };
      state.consents.push(structuredClone(input.consent));
      addEvent(state, input.event);
      return { consentId: input.consent.id, created: true, idempotencyConflict: false };
    });
  }

  async revokeConsent(input: { consentId: string; employeeId: string; expectedVersion: number; idempotencyKey: string; revokedAt: string; actorId: string; event: TrackingEventInput }) {
    return this.update((state) => {
      const consent = state.consents.find((item) => item.id === input.consentId);
      if (!consent) return { updated: false, replayed: false, conflict: false, forbidden: false, missing: true };
      if (consent.employeeId !== input.employeeId) return { updated: false, replayed: false, conflict: false, forbidden: true, missing: false };
      if (consent.revocationIdempotencyKey === input.idempotencyKey || consent.status === "revoked") {
        return { updated: false, replayed: true, conflict: false, forbidden: false, missing: false };
      }
      if (consent.version !== input.expectedVersion) return { updated: false, replayed: false, conflict: true, forbidden: false, missing: false };
      consent.status = "revoked";
      consent.revokedAt = input.revokedAt;
      consent.revokedBy = input.actorId;
      consent.revocationIdempotencyKey = input.idempotencyKey;
      consent.version += 1;
      addEvent(state, input.event);
      return { updated: true, replayed: false, conflict: false, forbidden: false, missing: false };
    });
  }

  async startSession(input: { session: DeliveryTrackingSession; event: TrackingEventInput }) {
    return this.update((state) => {
      const active = state.sessions.find((session) => session.deliveryJobId === input.session.deliveryJobId && session.status === "active");
      if (active) return { sessionId: active.id, created: false };
      state.sessions.push(structuredClone(input.session));
      addEvent(state, input.event);
      return { sessionId: input.session.id, created: true };
    });
  }

  async appendPoint(input: { sessionId: string; point: DeliveryTrackingSession["points"][number] }) {
    return this.update((state) => {
      const session = requireSession(state, input.sessionId);
      if (session.status !== "active") throw new Error("Phiên chia sẻ vị trí không còn hoạt động.");
      if (session.points.some((point) => point.clientPointId === input.point.clientPointId)) return { duplicate: true };
      session.points.push(structuredClone(input.point));
      if (session.points.length > 2_400) session.points.splice(0, session.points.length - 2_400);
      if (input.point.quality === "accepted") session.latestPoint = structuredClone(input.point);
      return { duplicate: false };
    });
  }

  async stopSession(input: { sessionId: string; stoppedAt: string; retentionPurgeAfter: string; event: TrackingEventInput }) {
    await this.update((state) => {
      const session = requireSession(state, input.sessionId);
      if (session.status !== "active") throw new Error("Phiên chia sẻ vị trí không còn hoạt động.");
      session.status = "stopped";
      session.stoppedAt = input.stoppedAt;
      session.retentionPurgeAfter = input.retentionPurgeAfter;
      if (session.publicTokenHash && !session.shareRevokedAt) {
        session.shareRevokedAt = input.stoppedAt;
        addEvent(state, {
          sessionId: session.id,
          actorId: input.event.actorId,
          action: "tracking_share_revoked",
          occurredAt: input.stoppedAt,
          summary: "Customer tracking link revoked because the tracking session stopped."
        });
      }
      addEvent(state, input.event);
    });
  }

  async createShare(input: { sessionId: string; publicTokenHash: string; shareExpiresAt: string; event: TrackingEventInput }) {
    await this.update((state) => {
      const session = requireSession(state, input.sessionId);
      if (session.status !== "active") throw new Error("Chỉ có thể tạo liên kết khi chuyến đang được theo dõi.");
      session.publicTokenHash = input.publicTokenHash;
      session.shareExpiresAt = input.shareExpiresAt;
      session.shareRevokedAt = undefined;
      addEvent(state, input.event);
    });
  }

  async revokeShare(input: { sessionId: string; revokedAt: string; event: TrackingEventInput }) {
    await this.update((state) => {
      const session = requireSession(state, input.sessionId);
      if (session.shareRevokedAt) return;
      session.shareRevokedAt = input.revokedAt;
      addEvent(state, input.event);
    });
  }

  async purge(input: { now: string; dryRun: boolean }): Promise<DeliveryTrackingRetentionResult> {
    if (input.dryRun) return inspectRetention(await this.getSnapshot(), input.now, true);
    return this.update((state) => {
      const result = inspectRetention(state, input.now, false);
      for (const session of state.sessions) {
        if (session.shareExpiresAt && !session.shareRevokedAt && new Date(session.shareExpiresAt).getTime() <= new Date(input.now).getTime()) {
          session.shareRevokedAt = input.now;
          addEvent(state, {
            sessionId: session.id,
            action: "tracking_share_revoked",
            occurredAt: input.now,
            summary: "Customer tracking link expired automatically."
          });
        }
        if (new Date(session.retentionPurgeAfter).getTime() <= new Date(input.now).getTime() && session.points.length > 0) {
          const purged = session.points.length;
          session.points = [];
          session.latestPoint = undefined;
          addEvent(state, {
            sessionId: session.id,
            action: "tracking_retention_purged",
            occurredAt: input.now,
            summary: `Purged ${purged} retained GPS points after the retention period.`
          });
        }
      }
      return result;
    });
  }
}

export class FileDeliveryTrackingStore extends BaseDeliveryTrackingStore {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly filePath = process.env.VLXD_TRACKING_DATA_FILE || resolve(process.cwd(), ".data", "delivery-tracking.json")) {
    super();
  }

  async getSnapshot() {
    return structuredClone(await this.readState());
  }

  protected async update<T>(callback: (state: DeliveryTrackingState) => T | Promise<T>): Promise<T> {
    let release: () => void = () => {};
    const previous = this.tail;
    this.tail = new Promise<void>((resolveTail) => { release = resolveTail; });
    await previous;
    try {
      const state = await this.readState();
      const result = await callback(state);
      state.revision += 1;
      await this.writeState(state);
      return result;
    } finally {
      release();
    }
  }

  private async readState(): Promise<DeliveryTrackingState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<DeliveryTrackingState>;
      if (!Array.isArray(parsed.sessions) || !Array.isArray(parsed.events) || !Number.isInteger(parsed.revision)) return emptyState();
      return { revision: parsed.revision, sessions: parsed.sessions, consents: Array.isArray(parsed.consents) ? parsed.consents : [], events: parsed.events } as DeliveryTrackingState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw error;
    }
  }

  private async writeState(state: DeliveryTrackingState) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(state, null, 2), "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

export class MemoryDeliveryTrackingStore extends BaseDeliveryTrackingStore {
  private state: DeliveryTrackingState;
  private tail: Promise<void> = Promise.resolve();

  constructor(initial: DeliveryTrackingState = emptyState()) {
    super();
    this.state = structuredClone(initial);
  }

  async getSnapshot() {
    return structuredClone(this.state);
  }

  protected async update<T>(callback: (state: DeliveryTrackingState) => T | Promise<T>) {
    let release: () => void = () => {};
    const previous = this.tail;
    this.tail = new Promise<void>((resolveTail) => { release = resolveTail; });
    await previous;
    try {
      const working = structuredClone(this.state);
      const result = await callback(working);
      working.revision += 1;
      this.state = working;
      return result;
    } finally {
      release();
    }
  }
}

function requireSession(state: DeliveryTrackingState, sessionId: string) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error("Không tìm thấy phiên theo dõi giao hàng.");
  return session;
}

function addEvent(state: DeliveryTrackingState, input: TrackingEventInput) {
  state.events.unshift({ id: randomUUID(), ...input });
}

function inspectRetention(state: DeliveryTrackingState, now: string, dryRun: boolean): DeliveryTrackingRetentionResult {
  const nowMs = new Date(now).getTime();
  const expiredShares = state.sessions.filter((session) => session.shareExpiresAt && !session.shareRevokedAt && new Date(session.shareExpiresAt).getTime() <= nowMs).length;
  const expiredSessions = state.sessions.filter((session) => new Date(session.retentionPurgeAfter).getTime() <= nowMs && session.points.length > 0);
  return {
    expiredShares,
    purgedSessions: expiredSessions.length,
    purgedPoints: expiredSessions.reduce((sum, session) => sum + session.points.length, 0),
    dryRun
  };
}
