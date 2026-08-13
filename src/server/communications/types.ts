import type { UserRole } from "@/modules/operations/types";

export type CommunicationPartyType = "customer" | "supplier";

export type CommunicationThread = {
  id: string;
  partyType: CommunicationPartyType;
  partyId: string;
  createdAt: string;
  updatedAt: string;
};

export type CommunicationMessage = {
  id: string;
  threadId: string;
  senderUserId: string;
  senderName: string;
  senderRole: UserRole;
  body: string;
  idempotencyKey: string;
  sentAt: string;
};

export type CommunicationPresence = {
  partyType: CommunicationPartyType;
  partyId: string;
  userId: string;
  lastActiveAt: string;
};

export type CommunicationAuditEvent = {
  id: string;
  action: "thread_opened" | "message_sent";
  actorUserId: string;
  partyType: CommunicationPartyType;
  partyId: string;
  occurredAt: string;
  summary: string;
};
