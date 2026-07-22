import type { OperationsActor, OperationsState } from "@/modules/operations/types";

export type DeliveryTrackingStatus = "active" | "stopped" | "expired";

export type DeliveryTrackingPoint = {
  clientPointId: string;
  recordedAt: string;
  receivedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  headingDegrees?: number;
  speedMetersPerSecond?: number;
};

export type DeliveryTrackingSession = {
  id: string;
  deliveryJobId: string;
  employeeId: string;
  status: DeliveryTrackingStatus;
  startedAt: string;
  stoppedAt?: string;
  publicTokenHash: string;
  shareExpiresAt: string;
  latestPoint?: DeliveryTrackingPoint;
  points: DeliveryTrackingPoint[];
};

export type DeliveryTrackingEvent = {
  id: string;
  sessionId: string;
  actorId: string;
  action: "tracking_started" | "tracking_stopped" | "tracking_share_created";
  occurredAt: string;
  summary: string;
};

export type DeliveryTrackingState = {
  revision: number;
  sessions: DeliveryTrackingSession[];
  events: DeliveryTrackingEvent[];
};

export type DeliveryTrackingStore = {
  getSnapshot(): Promise<DeliveryTrackingState>;
  transaction<T>(callback: (state: DeliveryTrackingState) => T | Promise<T>): Promise<T>;
};

export type TrackingOperationsLoader = () => Promise<OperationsState>;

export type TrackingContext = {
  actor: OperationsActor;
  state: OperationsState;
};
