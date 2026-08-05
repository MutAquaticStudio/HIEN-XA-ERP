import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CommunicationAuditEvent, CommunicationMessage, CommunicationPartyType, CommunicationPresence, CommunicationThread } from "./types";

type CommunicationData = {
  schemaVersion: 1;
  revision: number;
  threads: CommunicationThread[];
  messages: CommunicationMessage[];
  auditEvents: CommunicationAuditEvent[];
  presence: CommunicationPresence[];
};

const onlinePresenceWindowMilliseconds = 90_000;
const presenceRetentionMilliseconds = 24 * 60 * 60 * 1000;

export class FileCommunicationStore {
  private queue = Promise.resolve();
  private readonly filePath: string;

  constructor(filePath = process.env.VLXD_COMMUNICATION_DATA_FILE) {
    this.filePath = filePath?.trim() || join(process.cwd(), ".data", "communications.json");
  }

  async getMessages(partyType: CommunicationPartyType, partyId: string) {
    const data = await this.getSnapshot();
    const threadId = threadIdentifier(partyType, partyId);
    return data.messages.filter((message) => message.threadId === threadId).slice(-100);
  }

  async touchPresence(input: Omit<CommunicationPresence, "lastActiveAt">, now = new Date()) {
    return this.transaction((data) => {
      const nowMilliseconds = now.getTime();
      data.presence = data.presence.filter((record) => isRecentPresence(record, nowMilliseconds, presenceRetentionMilliseconds));
      const existing = data.presence.find((record) => record.partyType === input.partyType && record.partyId === input.partyId && record.userId === input.userId);
      if (existing) {
        existing.lastActiveAt = now.toISOString();
        return;
      }
      data.presence.push({ ...input, lastActiveAt: now.toISOString() });
    });
  }

  async getActivePresence(now = new Date()) {
    const data = await this.getSnapshot();
    return data.presence.filter((record) => isRecentPresence(record, now.getTime(), onlinePresenceWindowMilliseconds));
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
      const message: CommunicationMessage = {
        id: randomUUID(),
        threadId,
        senderUserId: input.senderUserId,
        senderName: input.senderName,
        senderRole: input.senderRole,
        body: input.body,
        idempotencyKey: input.idempotencyKey,
        sentAt: now
      };
      data.messages.push(message);
      data.auditEvents.unshift({ id: randomUUID(), action: "message_sent", actorUserId: input.senderUserId, partyType: input.partyType, partyId: input.partyId, occurredAt: now, summary: "Gửi tin nhắn đối tác." });
      data.messages = data.messages.slice(-3000);
      data.auditEvents = data.auditEvents.slice(0, 3000);
      return message;
    });
  }

  private async getSnapshot(): Promise<CommunicationData> {
    await this.queue;
    return structuredClone(await this.readData());
  }

  private async transaction<T>(mutator: (data: CommunicationData) => T | Promise<T>) {
    const task = this.queue.then(async () => {
      const data = await this.readData();
      const result = await mutator(data);
      data.revision += 1;
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.filePath);
      return structuredClone(result);
    });
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  private async readData(): Promise<CommunicationData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const data = JSON.parse(raw) as Partial<CommunicationData>;
      if (data.schemaVersion !== 1) return emptyData();
      return { schemaVersion: 1, revision: typeof data.revision === "number" && Number.isInteger(data.revision) ? data.revision : 0, threads: Array.isArray(data.threads) ? data.threads : [], messages: Array.isArray(data.messages) ? data.messages : [], auditEvents: Array.isArray(data.auditEvents) ? data.auditEvents : [], presence: Array.isArray(data.presence) ? data.presence : [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyData();
      throw error;
    }
  }
}

function threadIdentifier(partyType: CommunicationPartyType, partyId: string) {
  return `partner:${partyType}:${partyId}`;
}

function emptyData(): CommunicationData {
  return { schemaVersion: 1, revision: 0, threads: [], messages: [], auditEvents: [], presence: [] };
}

function isRecentPresence(record: CommunicationPresence, nowMilliseconds: number, maximumAgeMilliseconds: number) {
  const activeAtMilliseconds = Date.parse(record.lastActiveAt);
  return Number.isFinite(activeAtMilliseconds) && activeAtMilliseconds <= nowMilliseconds && nowMilliseconds - activeAtMilliseconds < maximumAgeMilliseconds;
}
