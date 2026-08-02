import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { SupabaseCommunicationStore } from "../src/server/communications/supabase-communication-store";
import { SupabaseOperationsBackend } from "../src/server/infrastructure/supabase-operations-backend";
import { SupabasePushNotificationStore } from "../src/server/notifications/supabase-push-notification-store";

type StoredDocument = { revision: number; payload: unknown };

class FakeRuntimeDocumentStore {
  private readonly documents = new Map<string, StoredDocument>();
  conflictsRemaining = 0;
  readCalls = 0;
  commitCalls = 0;

  seed(namespace: string, payload: unknown, revision = 1) {
    this.documents.set(namespace, { revision, payload: structuredClone(payload) });
  }

  async read<T>(namespace: string, initial: T) {
    this.readCalls += 1;
    const document = this.documents.get(namespace) ?? { revision: 0, payload: structuredClone(initial) };
    return { revision: document.revision, payload: structuredClone(document.payload) as T };
  }

  async compareAndSwap<T>(namespace: string, expectedRevision: number, payload: T) {
    this.commitCalls += 1;
    const current = this.documents.get(namespace) ?? { revision: 0, payload: structuredClone(payload) };
    if (this.conflictsRemaining > 0) {
      this.conflictsRemaining -= 1;
      this.documents.set(namespace, { revision: current.revision + 1, payload: structuredClone(current.payload) });
      return { committed: false, revision: current.revision + 1 };
    }
    if (current.revision !== expectedRevision) {
      return { committed: false, revision: current.revision };
    }
    this.documents.set(namespace, { revision: current.revision + 1, payload: structuredClone(payload) });
    return { committed: true, revision: current.revision + 1 };
  }
}

describe("Supabase runtime stores", () => {
  it("retries a conflicted operations transaction without duplicating its state update", async () => {
    const documents = new FakeRuntimeDocumentStore();
    const initialState = createInitialOperationsState();
    documents.seed("operations", { schemaVersion: 1, state: initialState, idempotencyRecords: [] });
    documents.conflictsRemaining = 1;
    const backend = new SupabaseOperationsBackend(documents as never);
    const originalCreditLimit = initialState.customers[0]!.creditLimit;
    let handlerRuns = 0;

    await backend.transaction(async (tx) => {
      handlerRuns += 1;
      const state = await tx.loadOperationsStateForUpdate();
      state.customers[0]!.creditLimit += 100_000;
      await tx.saveOperationsState(state);
    });

    const snapshot = await backend.getSnapshot();
    expect(handlerRuns).toBe(2);
    expect(snapshot.state.customers[0]!.creditLimit).toBe(originalCreditLimit + 100_000);
    expect(documents.commitCalls).toBe(2);
  });

  it("persists one idempotency record and exposes it to a later transaction", async () => {
    const backend = new SupabaseOperationsBackend(new FakeRuntimeDocumentStore() as never);
    const record = {
      key: "runtime-store-idempotency-001",
      operation: "createCustomer" as const,
      requestHash: "a".repeat(64),
      response: { summary: "Đã tạo khách hàng.", severity: "success" as const },
      createdAt: "2026-07-27T00:00:00.000Z"
    };

    await backend.transaction((tx) => tx.recordIdempotency(record));
    const found = await backend.transaction((tx) => tx.findIdempotencyRecord(record.key));

    expect(found).toEqual(record);
  });

  it("deduplicates push subscriptions and stops retrying after three failed deliveries", async () => {
    const store = new SupabasePushNotificationStore(new FakeRuntimeDocumentStore() as never);
    const user = { id: "customer-user", role: "customer", customerId: "cus-minh-anh" } as never;
    const firstSubscription = await store.upsertSubscription(user, { channel: "web", endpoint: "https://push.example/customer" });
    const repeatedSubscription = await store.upsertSubscription(user, { channel: "web", endpoint: "https://push.example/customer" });
    const event = await store.ensureEvent({
      eventKey: "payment-proof:001",
      audience: { customerId: "cus-minh-anh" },
      payload: { title: "Đã nhận minh chứng", body: "Kế toán sẽ đối soát.", url: "/khach-hang", tag: "payment-proof" }
    });

    let latest = event;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      latest = (await store.recordAttempts(latest.id, [{ subscriptionId: firstSubscription.id, channel: "web", status: "failed", detail: "temporary" }]))!;
    }

    expect(repeatedSubscription.id).toBe(firstSubscription.id);
    expect(latest).toMatchObject({ status: "failed", attempts: 3, lastError: "temporary" });
    expect(await store.getDeliverableEvents()).toEqual([]);
  });

  it("isolates partner messages by party and makes retries idempotent", async () => {
    const store = new SupabaseCommunicationStore(new FakeRuntimeDocumentStore() as never);
    const input = {
      partyType: "customer" as const,
      partyId: "cus-minh-anh",
      senderUserId: "customer-user",
      senderName: "Công trình Minh Anh",
      senderRole: "customer" as const,
      body: "Xin báo giúp tình trạng giao hàng.",
      idempotencyKey: "message-001"
    };

    const first = await store.sendMessage(input);
    const retry = await store.sendMessage(input);
    await store.sendMessage({ ...input, partyId: "cus-tuan-lai", idempotencyKey: "message-002", body: "Tôi cần báo giá." });

    expect(retry.id).toBe(first.id);
    expect(await store.getMessages("customer", "cus-minh-anh")).toHaveLength(1);
    expect(await store.getMessages("customer", "cus-tuan-lai")).toHaveLength(1);
    expect(await store.getMessages("supplier", "sup-hoang-thach")).toEqual([]);
  });

});
