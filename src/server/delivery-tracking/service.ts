import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DeliveryJob, OperationsActor, OperationsState } from "@/modules/operations/types";
import type {
  DeliveryTrackingEvent,
  DeliveryTrackingPoint,
  DeliveryTrackingSession,
  DeliveryTrackingStore,
  TrackingOperationsLoader
} from "./types";

const activeShareLifetimeMs = 4 * 60 * 60 * 1_000;
const completedShareLifetimeMs = 30 * 60 * 1_000;
const maxPointsPerSession = 2_400;
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
    const visibleJobs = operations.deliveryJobs.filter((job) =>
      canManage || (assignedEmployee ? isAssignedToJob(job, assignedEmployee.id) : false)
    );
    const sessions = (await this.store.getSnapshot()).sessions
      .filter((session) => visibleJobs.some((job) => job.id === session.deliveryJobId))
      .map((session) => toSessionView(session, operations, true));

    return {
      canManage,
      jobs: visibleJobs.map((job) => ({
        id: job.id,
        documentNo: job.documentNo,
        status: job.status,
        plannedDate: job.plannedDate,
        trackingEligible: job.status === "in_transit"
      })),
      sessions
    };
  }

  async start(actor: OperationsActor, deliveryJobId: string) {
    const operations = await this.loadOperationsState();
    const job = requireDeliveryJob(operations, deliveryJobId);
    const employee = requireAssignedEmployee(operations, actor, job);
    if (job.status !== "in_transit") {
      throw new Error("Chi duoc bat chia se vi tri khi chuyen giao dang tren duong.");
    }
    const startedAt = this.now().toISOString();
    const publicToken = randomBytes(32).toString("base64url");
    const publicTokenHash = hashToken(publicToken);

    return this.store.transaction((state) => {
      const existing = state.sessions.find((session) => session.deliveryJobId === job.id && session.status === "active");
      if (existing) {
        if (existing.employeeId !== employee.id && !canManageTracking(actor)) {
          throw new Error("Chuyen giao nay dang duoc thiet bi khac chia se vi tri.");
        }
        existing.publicTokenHash = publicTokenHash;
        existing.shareExpiresAt = new Date(this.now().getTime() + activeShareLifetimeMs).toISOString();
        addEvent(state.events, {
          sessionId: existing.id,
          actorId: actor.id,
          action: "tracking_share_created",
          occurredAt: startedAt,
          summary: `Customer tracking link renewed for ${job.documentNo}.`
        });
        return { session: toSessionView(existing, operations, true), publicToken };
      }

      const session: DeliveryTrackingSession = {
        id: randomUUID(),
        deliveryJobId: job.id,
        employeeId: employee.id,
        status: "active",
        startedAt,
        publicTokenHash,
        shareExpiresAt: new Date(this.now().getTime() + activeShareLifetimeMs).toISOString(),
        points: []
      };
      state.sessions.push(session);
      addEvent(state.events, {
        sessionId: session.id,
        actorId: actor.id,
        action: "tracking_started",
        occurredAt: startedAt,
        summary: `${actor.displayName} started live tracking for ${job.documentNo}.`
      });
      addEvent(state.events, {
        sessionId: session.id,
        actorId: actor.id,
        action: "tracking_share_created",
        occurredAt: startedAt,
        summary: `Customer tracking link created for ${job.documentNo}.`
      });
      return { session: toSessionView(session, operations, true), publicToken };
    });
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
    const point = validatePoint(input, this.now().toISOString());
    return this.store.transaction((state) => {
      const session = state.sessions.find((item) => item.id === input.sessionId);
      if (!session || session.status !== "active") {
        throw new Error("Phien chia se vi tri khong con hoat dong.");
      }
      const job = requireDeliveryJob(operations, session.deliveryJobId);
      const employee = requireAssignedEmployee(operations, actor, job);
      if (session.employeeId !== employee.id && !canManageTracking(actor)) {
        throw new Error("Ban khong duoc phep cap nhat vi tri cho chuyen giao nay.");
      }
      if (job.status !== "in_transit") {
        throw new Error("Chuyen giao khong con o trang thai dang di duong.");
      }
      const duplicate = session.points.find((item) => item.clientPointId === point.clientPointId);
      if (duplicate) {
        return toSessionView(session, operations, true);
      }
      session.points.push(point);
      if (session.points.length > maxPointsPerSession) {
        session.points.splice(0, session.points.length - maxPointsPerSession);
      }
      session.latestPoint = point;
      return toSessionView(session, operations, true);
    });
  }

  async stop(actor: OperationsActor, sessionId: string) {
    const operations = await this.loadOperationsState();
    const stoppedAt = this.now().toISOString();
    return this.store.transaction((state) => {
      const session = state.sessions.find((item) => item.id === sessionId);
      if (!session || session.status !== "active") {
        throw new Error("Phien chia se vi tri khong con hoat dong.");
      }
      const job = requireDeliveryJob(operations, session.deliveryJobId);
      const employee = requireAssignedEmployee(operations, actor, job);
      if (session.employeeId !== employee.id && !canManageTracking(actor)) {
        throw new Error("Ban khong duoc phep dung chia se vi tri cho chuyen giao nay.");
      }
      session.status = "stopped";
      session.stoppedAt = stoppedAt;
      session.shareExpiresAt = new Date(this.now().getTime() + completedShareLifetimeMs).toISOString();
      addEvent(state.events, {
        sessionId: session.id,
        actorId: actor.id,
        action: "tracking_stopped",
        occurredAt: stoppedAt,
        summary: `${actor.displayName} stopped live tracking for ${job.documentNo}.`
      });
      return toSessionView(session, operations, true);
    });
  }

  async getPublicTracking(publicToken: string) {
    if (!/^[A-Za-z0-9_-]{30,128}$/.test(publicToken)) {
      return undefined;
    }
    const operations = await this.loadOperationsState();
    const session = (await this.store.getSnapshot()).sessions.find((item) => item.publicTokenHash === hashToken(publicToken));
    if (!session || new Date(session.shareExpiresAt).getTime() <= this.now().getTime()) {
      return undefined;
    }
    const job = operations.deliveryJobs.find((item) => item.id === session.deliveryJobId);
    if (!job) {
      return undefined;
    }
    return {
      session: toSessionView(session, operations, false),
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
}, receivedAt: string): DeliveryTrackingPoint {
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(input.clientPointId)) {
    throw new Error("Ma diem GPS khong hop le.");
  }
  const recordedAt = new Date(input.recordedAt);
  if (Number.isNaN(recordedAt.getTime()) || recordedAt.getTime() > new Date(receivedAt).getTime() + 5 * 60 * 1_000) {
    throw new Error("Thoi gian ghi nhan GPS khong hop le.");
  }
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new Error("Vi do GPS khong hop le.");
  }
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new Error("Kinh do GPS khong hop le.");
  }
  if (input.accuracyMeters !== undefined && (!Number.isFinite(input.accuracyMeters) || input.accuracyMeters < 0 || input.accuracyMeters > 10_000)) {
    throw new Error("Do chinh xac GPS khong hop le.");
  }
  if (input.headingDegrees !== undefined && (!Number.isFinite(input.headingDegrees) || input.headingDegrees < 0 || input.headingDegrees > 360)) {
    throw new Error("Huong di GPS khong hop le.");
  }
  if (input.speedMetersPerSecond !== undefined && (!Number.isFinite(input.speedMetersPerSecond) || input.speedMetersPerSecond < 0 || input.speedMetersPerSecond > 100)) {
    throw new Error("Toc do GPS khong hop le.");
  }
  return {
    clientPointId: input.clientPointId,
    recordedAt: recordedAt.toISOString(),
    receivedAt,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyMeters: input.accuracyMeters,
    headingDegrees: input.headingDegrees,
    speedMetersPerSecond: input.speedMetersPerSecond
  };
}

function requireDeliveryJob(state: OperationsState, deliveryJobId: string) {
  const job = state.deliveryJobs.find((item) => item.id === deliveryJobId);
  if (!job) {
    throw new Error("Khong tim thay chuyen giao.");
  }
  return job;
}

function requireAssignedEmployee(state: OperationsState, actor: OperationsActor, job: DeliveryJob) {
  const employee = findAssignedEmployee(state, actor);
  if (!employee || !isAssignedToJob(job, employee.id)) {
    throw new Error("Ban khong duoc phan cong cho chuyen giao nay.");
  }
  return employee;
}

function findAssignedEmployee(state: OperationsState, actor: OperationsActor) {
  const actorName = normalizeName(actor.displayName);
  return state.employees.find((employee) => employee.status === "active" && normalizeName(employee.displayName) === actorName);
}

function isAssignedToJob(job: DeliveryJob, employeeId: string) {
  return job.driverId === employeeId || job.helperIds.includes(employeeId);
}

function canManageTracking(actor: OperationsActor) {
  return adminTrackingRoles.has(actor.role) && actor.permissions.some((permission) => permission.startsWith("delivery."));
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function normalizeName(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi-VN");
}

function addEvent(events: DeliveryTrackingEvent[], input: Omit<DeliveryTrackingEvent, "id">) {
  events.unshift({ id: randomUUID(), ...input });
}

function toSessionView(session: DeliveryTrackingSession, state: OperationsState, includeRoute: boolean) {
  const job = state.deliveryJobs.find((item) => item.id === session.deliveryJobId);
  const employee = state.employees.find((item) => item.id === session.employeeId);
  return {
    id: session.id,
    deliveryJobId: session.deliveryJobId,
    documentNo: job?.documentNo ?? "Chuyen giao",
    status: session.status,
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    shareExpiresAt: session.shareExpiresAt,
    driverLabel: includeRoute ? employee?.displayName ?? "Nhan vien giao hang" : "Tai xe dang giao hang",
    latestPoint: session.latestPoint,
    points: includeRoute ? session.points.slice(-240) : session.points.slice(-240)
  };
}
