import { randomUUID } from "node:crypto";
import { SupabaseRuntimeDocumentStore } from "@/server/infrastructure/supabase-runtime-document-store";
import type { RuntimeDocumentStore } from "@/server/infrastructure/runtime-document-store";
import type { CommunicationAuditEvent, CommunicationMessage, CommunicationPartyType, CommunicationThread } from "./types";

type CommunicationData = {
  schemaVersion: 1;
  revision: number;
  threads: CommunicationThread[];
  messages: CommunicationMessage[];
  auditEvents: CommunicationAuditEvent[];
};

const namespace = "communications";
const maximumWriteAttempts = 6;

export class SupabaseCommunicationStore {
  constructor(private readonly documents: RuntimeDocumentStore = new SupabaseRuntimeDocumentStore()) {}

  async getMessages(partyType: CommunicationPartyType, partyId: string) {
    const data = await this.getSnapshot();
    const threadId = threadIdentifier(partyType, partyId);
    return data.messages.filter((message) => message.threadId === threadId).slice(-100);
  }

  async sendMessage(input: Omit<CommunicationMessage, "id" | "threadId" | "sentAt"> & { partyType: CommunicationPartyType; partyId: string }) {
    return this.transaction((data) => {
      const threadId = threadIdentifier(input.partyType, input.partyId);
      const duplicate = data.messages.find((message) => message.threadId === threadId && message.idempotencyKey === input.idempotencyKey);
      if (duplicate) return duplicate;
      const now = new Date().toISOString();
      let thread = data.threads.find((candidate) => candidate.id === threadId);
      if (!thread) {
        thread = { id: threadId, partyType: input.partyType, partyId: input.partyId, createdAt: now, updatedAt: now };
        data.threads.push(thread);
        data.auditEvents.unshift({ id: randomUUID(), action: "thread_opened", actorUserId: input.senderUserId, partyType: input.partyType, partyId: input.partyId, occurredAt: now, summary: "Mở trao đổi với đối tác." });
      }
      thread.updatedAt = now;
      const message: CommunicationMessage = { id: randomUUID(), threadId, senderUserId: input.senderUserId, senderName: input.senderName, senderRole: input.senderRole, body: input.body, idempotencyKey: input.idempotencyKey, sentAt: now };
      data.messages.push(message);
      data.auditEvents.unshift({ id: randomUUID(), action: "message_sent", actorUserId: input.senderUserId, partyType: input.partyType, partyId: input.partyId, occurredAt: now, summary: "Gửi tin nhắn đối tác." });
      data.messages = data.messages.slice(-3_000);
      data.auditEvents = data.auditEvents.slice(0, 3_000);
      return message;
    });
  }

  private async getSnapshot(): Promise<CommunicationData> {
    const document = await this.documents.read(namespace, emptyData());
    return { ...structuredClone(document.payload), revision: document.revision };
  }

  private async transaction<T>(mutator: (data: CommunicationData) => T | Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < maximumWriteAttempts; attempt += 1) {
      const document = await this.documents.read(namespace, emptyData());
      const data = { ...structuredClone(document.payload), revision: document.revision };
      const result = await mutator(data);
      data.revision = document.revision + 1;
      const commit = await this.documents.compareAndSwap(namespace, document.revision, data);
      if (commit.committed) return structuredClone(result);
    }
    throw new Error("Không thể gửi tin nhắn vì cuộc trao đổi vừa được cập nhật. Vui lòng thử lại.");
  }
}

function threadIdentifier(partyType: CommunicationPartyType, partyId: string) {
  return `partner:${partyType}:${partyId}`;
}

function emptyData(): CommunicationData {
  return { schemaVersion: 1, revision: 0, threads: [], messages: [], auditEvents: [] };
}
