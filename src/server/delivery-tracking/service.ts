import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PublicApiError } from "@/server/shared/public-api-error";
import type { DeliveryJob, OperationsActor, OperationsState } from "@/modules/operations/types";
import type {
  DeliveryTrackingConsent,
  DeliveryTrackingPoint,
  DeliveryTrackingSession,
  DeliveryTrackingStore,
  TrackingOperationsLoader
} from "./types";
import { nativeTrackingConsentPolicyVersion } from "./types";

const activeShareLifetimeMs = 4 * 60 * 60 * 1_000;
const retentionMs = 90 * 24 * 60 * 60 * 1_000;
const maxPointsPerSession = 2_400;
const maxCustomerPoints = 24;
const minPointIntervalMs = 20 * 1_000;
const minPointDistanceMeters = 50;
const maxOfflinePointAgeMs = 6 * 60 * 60 * 1_000;
const maxCustomerAccuracyMeters = 150;
const maxPlausibleSpeedMetersPerSecond = 44.45;
const adminTrackingRoles = new Set(["owner", "administrator", "dispatcher", "supervisor"]);

export class DeliveryTrackingService {
  constructor(
    private readonly store: DeliveryTrackingStore,
    private readonly loadOperationsState: TrackingOperationsLoader,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getOverview(actor: OperationsActor) {
    const operations = await this.loadOperationsState();
    const canManage = canManageTracking(actor);
    const assignedEmployee = canManage ? undefined : findAssignedEmployee(operations, actor);
    const visibleJobs = operations.deliveryJobs.filter((job) => canManage || (assignedEmployee ? isAssignedToJob(job, assignedEmployee.id) : false));
    const state = await this.store.getSnapshot();
    return {
      canManage,
      jobs: visibleJobs.map((job) => ({
        id: job.id,
        documentNo: job.documentNo,
        status: job.status,
        plannedDate: job.plannedDate,
        deliveryAddress: operations.salesOrders.find((order) => order.id === job.salesOrderId)?.deliveryAddress,
        trackingEligible: job.status === "in_transit"
      })),
      sessions: state.sessions
        .filter((session) => visibleJobs.some((job) => job.id === session.deliveryJobId))
        .map((session) => toSessionView(session, operations, "admin"))
    };
  }

  async getCustomerOverview(actor: OperationsActor) {
    if (actor.role !== "customer" || !actor.customerId) throw new PublicApiError(403, "Tài khoản này không có quyền xem hành trình giao hàng.");
    const operations = await this.loadOperationsState();
    const customerOrderIds = new Set(operations.salesOrders.filter((order) => order.customerId === actor.customerId).map((order) => order.id));
    const state = await this.store.getSnapshot();
    return {
      sessions: state.sessions
        .filter((session) => {
          const job = operations.deliveryJobs.find((item) => item.id === session.deliveryJobId);
          return Boolean(job && customerOrderIds.has(job.salesOrderId) && job.status === "in_transit");
        })
        .map((session) => toSessionView(session, operations, "customer"))
    };
  }

  async start(actor: OperationsActor, deliveryJobId: string) {
    const operations = await this.loadOperationsState();
    const job = requireDeliveryJob(operations, deliveryJobId);
    const employee = requireAssignedDriver(operations, actor, job);
    const consent = (await this.store.getSnapshot()).consents.find(
      (item) => item.deliveryJobId === job.id &&
        item.employeeId === employee.id &&
        item.policyVersion === nativeTrackingConsentPolicyVersion &&
        item.status === "granted"
    );
    if (!consent) throw new PublicApiError(412, "Cần xác nhận cho phép GPS trước khi bắt đầu chia sẻ vị trí.");
    if (job.status !== "in_transit") throw new PublicApiError(400, "Chỉ được bật chia sẻ vị trí khi chuyến giao đang trên đường.");
    const startedAt = this.now().toISOString();
    const session: DeliveryTrackingSession = {
      id: randomUUID(),
      deliveryJobId: job.id,
      employeeId: employee.id,
      status: "active",
      startedAt,
      retentionPurgeAfter: new Date(this.now().getTime() + retentionMs).toISOString(),
      points: []
    };
    const result = await this.store.startSession({
      session,
      event: {
        sessionId: session.id,
        actorId: actor.id,
        action: "tracking_started",
        occurredAt: startedAt,
        summary: `${actor.displayName} started live tracking for ${job.documentNo}.`
      }
    });
    const persisted = await requireSession(this.store, result.sessionId);
    if (!result.created && persisted.employeeId !== employee.id && !canManageTracking(actor)) {
      throw new PublicApiError(400, "Chuyến giao này đang được thiết bị khác chia sẻ vị trí.");
    }
    return { session: toSessionView(persisted, operations, "admin"), created: result.created };
  }

  async grantConsent(actor: OperationsActor, input: { deliveryJobId: string; policyVersion: string; idempotencyKey: string }) {
    if (input.policyVersion !== nativeTrackingConsentPolicyVersion) {
      throw new PublicApiError(400, "Phiên bản điều khoản GPS không hợp lệ. Vui lòng cập nhật ứng dụng.");
    }
    const operations = await this.loadOperationsState();
    const job = requireDeliveryJob(operations, input.deliveryJobId);
    const employee = requireAssignedDriver(operations, actor, job);
    if (job.status !== "in_transit") throw new PublicApiError(412, "Chỉ có thể xác nhận GPS cho chuyến đang giao.");
    const grantedAt = this.now().toISOString();
    const consent: DeliveryTrackingConsent = {
      id: randomUUID(),
      deliveryJobId: job.id,
      employeeId: employee.id,
      policyVersion: input.policyVersion,
      status: "granted",
      grantedAt,
      grantedBy: actor.id,
      idempotencyKey: input.idempotencyKey,
      version: 1
    };
    const result = await this.store.grantConsent({
      consent,
      event: {
        deliveryJobId: job.id,
        actorId: actor.id,
        action: "tracking_consent_granted",
        occurredAt: grantedAt,
        summary: `${actor.displayName} granted GPS consent ${input.policyVersion} for ${job.documentNo}.`
      }
    });
    if (result.idempotencyConflict) throw new PublicApiError(409, "Mã chống trùng đã được dùng cho một xác nhận GPS khác.");
    return { consent: toConsentView(await requireConsent(this.store, result.consentId)), created: result.created };
  }

  async revokeConsent(actor: OperationsActor, input: { consentId: string; expectedVersion: number; idempotencyKey: string }) {
    const existing = await requireConsent(this.store, input.consentId);
    const operations = await this.loadOperationsState();
    const job = requireDeliveryJob(operations, existing.deliveryJobId);
    const employee = requireAssignedDriver(operations, actor, job);
    const revokedAt = this.now().toISOString();
    const result = await this.store.revokeConsent({
      consentId: existing.id,
      employeeId: employee.id,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      revokedAt,
      actorId: actor.id,
      event: {
        deliveryJobId: job.id,
        actorId: actor.id,
        action: "tracking_consent_revoked",
        occurredAt: revokedAt,
        summary: `${actor.displayName} revoked GPS consent for ${job.documentNo}.`
      }
    });
    if (result.missing) throw new PublicApiError(400, "Không tìm thấy xác nhận GPS.");
    if (result.forbidden) throw new PublicApiError(403, "Bạn không có quyền thu hồi xác nhận GPS này.");
    if (result.conflict) throw new PublicApiError(409, "Xác nhận GPS đã thay đổi. Vui lòng tải lại trước khi thử lại.");
    return { consent: toConsentView(await requireConsent(this.store, existing.id)), replayed: result.replayed };
  }

  async recordPoint(actor: OperationsActor, input: {
    sessionId: string;
    clientPointId: string;
    recordedAt: string;
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    headingDegrees?: number;
    speedMetersPerSecond?: number;
  }) {
    const operations = await this.loadOperationsState();
    const session = await requireSession(this.store, input.sessionId);
    const job = requireDeliveryJob(operations, session.deliveryJobId);
    const employee = requireAssignedEmployee(operations, actor, job);
    if (session.employeeId !== employee.id && !canManageTracking(actor)) throw new PublicApiError(403, "Bạn không được phép cập nhật vị trí cho chuyến giao này.");
    if (session.status !== "active" || job.status !== "in_transit") throw new PublicApiError(400, "Chuyến giao không còn ở trạng thái đang đi đường.");
    if (session.points.some((point) => point.clientPointId === input.clientPointId)) {
      return { ...toSessionView(session, operations, "admin"), pointAccepted: false, duplicate: true };
    }
    const point = validatePoint(input, session, this.now());
    if (shouldThrottle(session, point)) return { ...toSessionView(session, operations, "admin"), pointAccepted: false, throttled: true };
    const result = await this.store.appendPoint({ sessionId: session.id, point });
    const persisted = await requireSession(this.store, session.id);
    return { ...toSessionView(persisted, operations, "admin"), pointAccepted: !result.duplicate, duplicate: result.duplicate };
  }

  async stop(actor: OperationsActor, sessionId: string) {
    const operations = await this.loadOperationsState();
    const session = await requireSession(this.store, sessionId);
    const job = requireDeliveryJob(operations, session.deliveryJobId);
    const employee = requireAssignedEmployee(operations, actor, job);
    if (session.employeeId !== employee.id && !canManageTracking(actor)) throw new PublicApiError(403, "Bạn không được phép dừng chia sẻ vị trí cho chuyến giao này.");
    const stoppedAt = this.now().toISOString();
    await this.store.stopSession({
      sessionId,
      stoppedAt,
      retentionPurgeAfter: new Date(this.now().getTime() + retentionMs).toISOString(),
      event: {
        sessionId,
        actorId: actor.id,
        action: "tracking_stopped",
        occurredAt: stoppedAt,
        summary: `${actor.displayName} stopped live tracking for ${job.documentNo}.`
      }
    });
    return toSessionView(await requireSession(this.store, sessionId), operations, "admin");
  }

  async createPublicShare(actor: OperationsActor, sessionId: string) {
    requireTrackingManager(actor);
    const operations = await this.loadOperationsState();
    const session = await requireSession(this.store, sessionId);
    const job = requireDeliveryJob(operations, session.deliveryJobId);
    if (session.status !== "active" || job.status !== "in_transit") throw new PublicApiError(400, "Chỉ có thể tạo liên kết khi chuyến đang giao.");
    const token = randomBytes(32).toString("base64url");
    const occurredAt = this.now().toISOString();
    await this.store.createShare({
      sessionId,
      publicTokenHash: hashToken(token),
      shareExpiresAt: new Date(this.now().getTime() + activeShareLifetimeMs).toISOString(),
      event: {
        sessionId,
        actorId: actor.id,
        action: "tracking_share_created",
        occurredAt,
        summary: `Customer tracking link created for ${job.documentNo}.`
      }
    });
    return { publicToken: token, session: toSessionView(await requireSession(this.store, sessionId), operations, "admin") };
  }

  async revokePublicShare(actor: OperationsActor, sessionId: string) {
    requireTrackingManager(actor);
    const operations = await this.loadOperationsState();
    const session = await requireSession(this.store, sessionId);
    const job = requireDeliveryJob(operations, session.deliveryJobId);
    const occurredAt = this.now().toISOString();
    await this.store.revokeShare({
      sessionId,
      revokedAt: occurredAt,
      event: {
        sessionId,
        actorId: actor.id,
        action: "tracking_share_revoked",
        occurredAt,
        summary: `Customer tracking link revoked for ${job.documentNo}.`
      }
    });
    return toSessionView(await requireSession(this.store, sessionId), operations, "admin");
  }

  async runRetention(dryRun = false) {
    return this.store.purge({ now: this.now().toISOString(), dryRun });
  }

  async getPublicTracking(publicToken: string) {
    if (!/^[A-Za-z0-9_-]{30,128}$/.test(publicToken)) return undefined;
    const operations = await this.loadOperationsState();
    const session = (await this.store.getSnapshot()).sessions.find((item) => item.publicTokenHash === hashToken(publicToken));
    if (!session || !session.shareExpiresAt || session.shareRevokedAt || new Date(session.shareExpiresAt).getTime() <= this.now().getTime()) return undefined;
    const job = operations.deliveryJobs.find((item) => item.id === session.deliveryJobId);
    if (!job || job.status !== "in_transit") return undefined;
    return {
      session: toSessionView(session, operations, "customer"),
      status: job.status,
      documentNo: job.documentNo,
      updatedAt: session.latestPoint?.receivedAt ?? session.startedAt,
      shareExpiresAt: session.shareExpiresAt
    };
  }
}

function validatePoint(input: {
  clientPointId: string;
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  headingDegrees?: number;
  speedMetersPerSecond?: number;
}, session: DeliveryTrackingSession, now: Date): DeliveryTrackingPoint {
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(input.clientPointId)) throw new PublicApiError(400, "Mã điểm GPS không hợp lệ.");
  const recordedAt = new Date(input.recordedAt);
  const nowMs = now.getTime();
  if (Number.isNaN(recordedAt.getTime()) || recordedAt.getTime() > nowMs + 5 * 60 * 1_000) throw new PublicApiError(400, "Thời gian ghi nhận GPS không hợp lệ.");
  if (recordedAt.getTime() < new Date(session.startedAt).getTime() - 2 * 60 * 1_000 || nowMs - recordedAt.getTime() > maxOfflinePointAgeMs) {
    throw new PublicApiError(400, "Điểm GPS đã quá cũ cho phiên giao hàng này.");
  }
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) throw new PublicApiError(400, "Vĩ độ GPS không hợp lệ.");
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) throw new PublicApiError(400, "Kinh độ GPS không hợp lệ.");
  if (input.accuracyMeters !== undefined && (!Number.isFinite(input.accuracyMeters) || input.accuracyMeters < 0 || input.accuracyMeters > 10_000)) throw new PublicApiError(400, "Độ chính xác GPS không hợp lệ.");
  if (input.headingDegrees !== undefined && (!Number.isFinite(input.headingDegrees) || input.headingDegrees < 0 || input.headingDegrees > 360)) throw new PublicApiError(400, "Hướng đi GPS không hợp lệ.");
  if (input.speedMetersPerSecond !== undefined && (!Number.isFinite(input.speedMetersPerSecond) || input.speedMetersPerSecond < 0 || input.speedMetersPerSecond > 100)) throw new PublicApiError(400, "Tốc độ GPS không hợp lệ.");
  const latestAccepted = [...session.points].reverse().find((point) => point.quality === "accepted");
  let suspectReason: DeliveryTrackingPoint["suspectReason"];
  if ((input.accuracyMeters ?? 0) > maxCustomerAccuracyMeters) suspectReason = "low_accuracy";
  if (!suspectReason && latestAccepted) {
    const seconds = Math.max(1, (recordedAt.getTime() - new Date(latestAccepted.recordedAt).getTime()) / 1_000);
    if (seconds <= 0) suspectReason = "out_of_order";
    else if (distanceMeters(latestAccepted.latitude, latestAccepted.longitude, input.latitude, input.longitude) / seconds > maxPlausibleSpeedMetersPerSecond) suspectReason = "impossible_speed";
  }
  return {
    clientPointId: input.clientPointId,
    recordedAt: recordedAt.toISOString(),
    receivedAt: now.toISOString(),
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyMeters: input.accuracyMeters,
    headingDegrees: input.headingDegrees,
    speedMetersPerSecond: input.speedMetersPerSecond,
    quality: suspectReason ? "suspect" : "accepted",
    suspectReason
  };
}

function shouldThrottle(session: DeliveryTrackingSession, point: DeliveryTrackingPoint) {
  const latest = [...session.points].reverse().find((item) => item.quality === "accepted");
  if (!latest) return false;
  const elapsed = new Date(point.receivedAt).getTime() - new Date(latest.receivedAt).getTime();
  return elapsed < minPointIntervalMs && distanceMeters(latest.latitude, latest.longitude, point.latitude, point.longitude) < minPointDistanceMeters;
}

function requireDeliveryJob(state: OperationsState, deliveryJobId: string) {
  const job = state.deliveryJobs.find((item) => item.id === deliveryJobId);
  if (!job) throw new PublicApiError(400, "Không tìm thấy chuyến giao.");
  return job;
}

function requireAssignedEmployee(state: OperationsState, actor: OperationsActor, job: DeliveryJob) {
  const employee = findAssignedEmployee(state, actor);
  if (!employee || !isAssignedToJob(job, employee.id)) throw new PublicApiError(403, "Bạn không được phân công cho chuyến giao này.");
  return employee;
}

function requireAssignedDriver(state: OperationsState, actor: OperationsActor, job: DeliveryJob) {
  const employee = findAssignedEmployee(state, actor);
  if (!employee || actor.role !== "driver" || job.driverId !== employee.id) {
    throw new PublicApiError(403, "Chỉ tài xế được phân công mới được xác nhận GPS cho chuyến giao này.");
  }
  return employee;
}

function findAssignedEmployee(state: OperationsState, actor: OperationsActor) {
  if (!actor.employeeId) {
    return undefined;
  }
  return state.employees.find(
    (employee) =>
      employee.id === actor.employeeId &&
      employee.status === "active" &&
      (actor.role === "driver" || actor.role === "worker")
  );
}

function isAssignedToJob(job: DeliveryJob, employeeId: string) {
  return job.driverId === employeeId || job.helperIds.includes(employeeId);
}

function canManageTracking(actor: OperationsActor) {
  return adminTrackingRoles.has(actor.role) && actor.permissions.some((permission) => permission.startsWith("delivery."));
}

function requireTrackingManager(actor: OperationsActor) {
  if (!canManageTracking(actor)) throw new PublicApiError(403, "Chỉ chủ cửa hàng hoặc điều phối được tạo và thu hồi liên kết theo dõi.");
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

async function requireSession(store: DeliveryTrackingStore, sessionId: string) {
  const session = (await store.getSnapshot()).sessions.find((item) => item.id === sessionId);
  if (!session) throw new PublicApiError(400, "Không tìm thấy phiên theo dõi giao hàng.");
  return session;
}

async function requireConsent(store: DeliveryTrackingStore, consentId: string) {
  const consent = (await store.getSnapshot()).consents.find((item) => item.id === consentId);
  if (!consent) throw new PublicApiError(400, "Không tìm thấy xác nhận GPS.");
  return consent;
}

function toSessionView(session: DeliveryTrackingSession, state: OperationsState, audience: "admin" | "customer") {
  const job = state.deliveryJobs.find((item) => item.id === session.deliveryJobId);
  const employee = state.employees.find((item) => item.id === session.employeeId);
  const accepted = session.points.filter((point) => point.quality === "accepted");
  const points = audience === "admin"
    ? session.points.slice(-maxPointsPerSession)
    : accepted.slice(-maxCustomerPoints).map(blurPoint);
  const latestPoint = audience === "admin"
    ? session.latestPoint
    : session.latestPoint && session.latestPoint.quality === "accepted" ? blurPoint(session.latestPoint) : undefined;
  return {
    id: session.id,
    deliveryJobId: session.deliveryJobId,
    documentNo: job?.documentNo ?? "Chuyến giao",
    status: session.status,
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    shareExpiresAt: audience === "admin" ? session.shareExpiresAt : undefined,
    shareActive: audience === "admin" ? Boolean(session.publicTokenHash && !session.shareRevokedAt && session.shareExpiresAt && new Date(session.shareExpiresAt).getTime() > Date.now()) : undefined,
    driverLabel: audience === "admin" ? employee?.displayName ?? "Nhân viên giao hàng" : "Tài xế đang giao hàng",
    latestPoint,
    points
  };
}

function toConsentView(consent: DeliveryTrackingConsent) {
  return {
    id: consent.id,
    deliveryJobId: consent.deliveryJobId,
    policyVersion: consent.policyVersion,
    status: consent.status,
    grantedAt: consent.grantedAt,
    revokedAt: consent.revokedAt,
    version: consent.version
  };
}

function blurPoint(point: DeliveryTrackingPoint) {
  const grid = 0.0005;
  return { ...point, latitude: Math.round(point.latitude / grid) * grid, longitude: Math.round(point.longitude / grid) * grid };
}

function distanceMeters(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const radius = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
