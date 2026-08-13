import { describe, expect, it } from "vitest";
import type { RuntimeDocument, RuntimeDocumentStore } from "@/server/infrastructure/runtime-document-store";
import {
  applyCloudflareUatUxV2Fixture,
  CloudflareUatFixtureInputError,
  assertCloudflareUatCredentials
} from "@/server/testing/cloudflare-uat-ux-v2-fixture";
import { UAT_UXV2_IDENTITIES } from "@/server/testing/uat-ux-v2-fixture";

class MemoryDocuments implements RuntimeDocumentStore {
  private readonly values = new Map<string, RuntimeDocument<unknown>>();

  async read<T>(namespace: string, initial: T): Promise<RuntimeDocument<T>> {
    const current = this.values.get(namespace);
    return current ? structuredClone(current) as RuntimeDocument<T> : { revision: 0, payload: structuredClone(initial) };
  }

  async compareAndSwap<T>(namespace: string, expectedRevision: number, payload: T) {
    const current = this.values.get(namespace);
    if ((current?.revision ?? 0) !== expectedRevision) return { committed: false, revision: current?.revision ?? 0 };
    const next = { revision: expectedRevision + 1, payload: structuredClone(payload) };
    this.values.set(namespace, next);
    return { committed: true, revision: next.revision };
  }
}

class MemoryBucket {
  readonly objects = new Map<string, Uint8Array>();
  async get(key: string) {
    const value = this.objects.get(key);
    if (!value) return null;
    const copy = Uint8Array.from(value);
    return { arrayBuffer: async () => copy.buffer.slice(0) as ArrayBuffer };
  }
  async put(key: string, value: ArrayBuffer | ArrayBufferView) {
    this.objects.set(key, new Uint8Array(value instanceof ArrayBuffer ? value : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)));
  }
  async delete(key: string) { this.objects.delete(key); }
}

class MemoryMetadataDatabase {
  readonly ids = new Set<string>();
  prepare(query: string) {
    let values: unknown[] = [];
    return {
      bind: (...next: unknown[]) => { values = next; return this.prepareBound(query, () => values); },
      first: async <T>() => null as T | null,
      run: async () => ({ success: true, meta: { changes: 0 } })
    };
  }
  private prepareBound(query: string, values: () => unknown[]) {
    return {
      bind: (...next: unknown[]) => this.prepareBound(query, () => next),
      first: async <T>() => {
        const id = values()[0];
        return (typeof id === "string" && this.ids.has(id) ? { id } : null) as T | null;
      },
      run: async () => {
        if (!query.startsWith("INSERT INTO private_object_metadata")) return { success: true, meta: { changes: 0 } };
        const id = values()[0];
        if (typeof id !== "string" || this.ids.has(id)) return { success: true, meta: { changes: 0 } };
        this.ids.add(id);
        return { success: true, meta: { changes: 1 } };
      }
    };
  }
}

function credentials() {
  return Object.fromEntries(UAT_UXV2_IDENTITIES.map((identity, index) => [identity, {
    username: `uat.uxv2.${identity.toLocaleLowerCase("en-US").replace("_", ".")}`,
    password: `Fixture-${identity}-${index}-password-2026`
  }]));
}

describe("Cloudflare UAT UXV2 fixture", () => {
  it("creates isolated Cloudflare documents and private attachment metadata idempotently", async () => {
    const documents = new MemoryDocuments();
    const bucket = new MemoryBucket();
    const database = new MemoryMetadataDatabase();
    const input = credentials();
    assertCloudflareUatCredentials(input);

    const first = await applyCloudflareUatUxV2Fixture(input, { documents, bucket, database });
    const second = await applyCloudflareUatUxV2Fixture(input, { documents, bucket, database });
    const operations = await documents.read<{ state: { salesOrders: Array<{ documentNo: string }> } }>("operations", { state: { salesOrders: [] } });
    const identity = await documents.read<{ users: Array<{ username?: string }> }>("identity", { users: [] });

    expect(second).toEqual(first);
    expect(first.identityCount).toBe(UAT_UXV2_IDENTITIES.length);
    expect(operations.payload.state.salesOrders.map((order) => order.documentNo)).toEqual(expect.arrayContaining(["UAT-UXV2-SO-001", "UAT-UXV2-SO-B-001"]));
    expect(identity.payload.users.filter((user) => user.username?.startsWith("uat.uxv2.")).length).toBe(UAT_UXV2_IDENTITIES.length);
    expect(bucket.objects.size).toBe(4);
    expect(database.ids.size).toBe(4);
  });

  it("rejects missing identities and reused fixture passwords", () => {
    const input = credentials();
    delete (input as Record<string, unknown>).CUSTOMER_B;
    expect(() => assertCloudflareUatCredentials(input)).toThrow(CloudflareUatFixtureInputError);

    const repeated = credentials() as Record<string, { username: string; password: string }>;
    repeated.WORKER_B.password = repeated.WORKER.password;
    expect(() => assertCloudflareUatCredentials(repeated)).toThrow(CloudflareUatFixtureInputError);
  });
});
