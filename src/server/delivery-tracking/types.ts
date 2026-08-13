import type { OperationsActor, OperationsState } from "@/modules/operations/types";

export type DeliveryTrackingStatus = "active" | "stopped" | "expired";
export type DeliveryTrackingPointQuality = "accepted" | "suspect";

export type DeliveryTrackingPoint = {
  clientPointId: string;
  recordedAt: string;
  receivedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  headingDegrees?: number;
  speedMetersPerSecond?: number;
  quality: DeliveryTrackingPointQuality;
  suspectReason?: "low_accuracy" | "impossible_speed" | "out_of_order";
};

export type DeliveryTrackingSession = {
  id: string;
  deliveryJobId: string;
  employeeId: string;
  status: DeliveryTrackingStatus;
  startedAt: string;
  stoppedAt?: string;
  publicTokenHash?: string;
  shareExpiresAt?: string;
  shareRevokedAt?: string;
  retentionPurgeAfter: string;
  latestPoint?: DeliveryTrackingPoint;
  points: DeliveryTrackingPoint[];
};

export const nativeTrackingConsentPolicyVersion = "2026-07-29";

export type DeliveryTrackingConsentStatus = "granted" | "revoked";

export type DeliveryTrackingConsent = {
  id: string;
  deliveryJobId: string;
  employeeId: string;
  policyVersion: string;
  status: DeliveryTrackingConsentStatus;
  grantedAt: string;
  grantedBy: string;
  idempotencyKey: string;
  version: number;
  revokedAt?: string;
  revokedBy?: string;
  revocationIdempotencyKey?: string;
};

export type DeliveryTrackingEventAction =
  | "tracking_consent_granted"
  | "tracking_consent_revoked"
  | "tracking_started"
  | "tracking_stopped"
  | "tracking_share_created"
  | "tracking_share_revoked"
  | "tracking_retention_purged";

export type DeliveryTrackingEvent = {
  id: string;
  sessionId?: string;
  deliveryJobId?: string;
  actorId?: string;
  action: DeliveryTrackingEventAction;
  occurredAt: string;
  summary: string;
};

export type DeliveryTrackingState = {
  revision: number;
  sessions: DeliveryTrackingSession[];
  consents: DeliveryTrackingConsent[];
  events: DeliveryTrackingEvent[];
};

export type TrackingEventInput = Omit<DeliveryTrackingEvent, "id">;

export type DeliveryTrackingRetentionResult = {
  expiredShares: number;
  purgedSessions: number;
  purgedPoints: number;
  dryRun: boolean;
};

export type DeliveryTrackingStore = {
  getSnapshot(): Promise<DeliveryTrackingState>;
  grantConsent(input: { consent: DeliveryTrackingConsent; event: TrackingEventInput }): Promise<{ consentId: string; created: boolean; idempotencyConflict: boolean }>;
  revokeConsent(input: { consentId: string; employeeId: string; expectedVersion: number; idempotencyKey: string; revokedAt: string; actorId: string; event: TrackingEventInput }): Promise<{ updated: boolean; replayed: boolean; conflict: boolean; forbidden: boolean; missing: boolean }>;
  startSession(input: { session: DeliveryTrackingSession; event: TrackingEventInput }): Promise<{ sessionId: string; created: boolean }>;
  appendPoint(input: { sessionId: string; point: DeliveryTrackingPoint }): Promise<{ duplicate: boolean }>;
  stopSession(input: { sessionId: string; stoppedAt: string; retentionPurgeAfter: string; event: TrackingEventInput }): Promise<void>;
  createShare(input: { sessionId: string; publicTokenHash: string; shareExpiresAt: string; event: TrackingEventInput }): Promise<void>;
  revokeShare(input: { sessionId: string; revokedAt: string; event: TrackingEventInput }): Promise<void>;
  purge(input: { now: string; dryRun: boolean }): Promise<DeliveryTrackingRetentionResult>;
};

export type TrackingOperationsLoader = () => Promise<OperationsState>;

export type TrackingContext = {
  actor: OperationsActor;
  state: OperationsState;
};
