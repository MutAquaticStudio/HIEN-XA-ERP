import type { OperationsModuleId } from "@/modules/operations/erp-registry";
import type { UserRole } from "@/modules/operations/types";

export type IdentityUserStatus = "invited" | "active" | "disabled";

export type IdentityUser = {
  id: string;
  email: string;
  normalizedEmail: string;
  username?: string;
  normalizedUsername?: string;
  displayName: string;
  role: UserRole;
  employeeId?: string;
  customerId?: string;
  supplierId?: string;
  moduleIds: OperationsModuleId[];
  status: IdentityUserStatus;
  passwordHash?: string;
  inviteTokenHash?: string;
  inviteExpiresAt?: string;
  invitedBy?: string;
  invitedAt?: string;
  acceptedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  failedLoginAttempts: number;
  lockedUntil?: string;
  sessionVersion: number;
};

export type IdentityAuditAction =
  | "bootstrap_owner_created"
  | "user_invited"
  | "managed_worker_created"
  | "managed_customer_created"
  | "managed_supplier_created"
  | "invitation_accepted"
  | "login_succeeded"
  | "login_failed"
  | "user_access_updated"
  | "user_password_reset"
  | "owner_recovered"
  | "employee_identity_linked";

export type IdentityAuditEvent = {
  id: string;
  action: IdentityAuditAction;
  actorUserId?: string;
  targetUserId?: string;
  targetEmail?: string;
  occurredAt: string;
  summary: string;
  correlationId?: string;
};

export type PersistedIdentityData = {
  schemaVersion: 1;
  revision: number;
  users: IdentityUser[];
  auditEvents: IdentityAuditEvent[];
};

export type SafeIdentityUser = Omit<IdentityUser, "passwordHash" | "inviteTokenHash">;

export type IdentitySnapshot = {
  revision: number;
  users: SafeIdentityUser[];
  auditEvents: IdentityAuditEvent[];
};

export type InvitationPreview = {
  email: string;
  role: UserRole;
  moduleIds: OperationsModuleId[];
  expiresAt: string;
};
