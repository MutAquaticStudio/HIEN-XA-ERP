import { createHash } from "node:crypto";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsState } from "@/modules/operations/types";
import type { PersistedIdentityData } from "@/server/identity/types";
import {
  createUatUxV2CommunicationData,
  createUatUxV2IdentityData,
  createUatUxV2OperationsState,
  createUatUxV2PushData,
  UAT_UXV2_ATTACHMENT_IDS,
  UAT_UXV2_IDENTITIES,
  UAT_UXV2_PREFIX,
  type UatUxV2Identity
} from "./uat-ux-v2-fixture";
import { CloudflareRuntimeDocumentStore } from "@/server/infrastructure/cloudflare-runtime-document-store";
import {
  getCloudflareD1Database,
  getCloudflarePrivateBucket,
  type D1DatabaseLike,
  type R2BucketLike
} from "@/server/infrastructure/cloudflare-bindings";
import type { RuntimeDocumentStore } from "@/server/infrastructure/runtime-document-store";

export type CloudflareUatCredentials = Parameters<typeof createUatUxV2IdentityData>[1];

type PersistedOperationsData = {
  schemaVersion: 1;
  state: OperationsState;
  idempotencyRecords: unknown[];
};

type PersistedCommunicationData = Parameters<typeof createUatUxV2CommunicationData>[0];
type PersistedPushData = Parameters<typeof createUatUxV2PushData>[0];

export type CloudflareUatFixtureDependencies = {
  documents?: RuntimeDocumentStore;
  bucket?: R2BucketLike;
  database?: D1DatabaseLike;
};

export class CloudflareUatFixtureInputError extends Error {
  readonly name = "CloudflareUatFixtureInputError";
}

export async function applyCloudflareUatUxV2Fixture(
  credentials: CloudflareUatCredentials,
  dependencies: CloudflareUatFixtureDependencies = {}
) {
  const documents = dependencies.documents ?? new CloudflareRuntimeDocumentStore();
  const bucket = dependencies.bucket ?? getCloudflarePrivateBucket();
  const database = dependencies.database ?? getCloudflareD1Database();
  const operationsRevision = await updateDocument<PersistedOperationsData>(
    documents,
    "operations",
    { schemaVersion: 1, state: createInitialOperationsState(), idempotencyRecords: [] },
    (current) => ({
      ...current,
      state: createUatUxV2OperationsState(current.state),
      idempotencyRecords: current.idempotencyRecords.filter((record) => !JSON.stringify(record).includes("uat-uxv2-"))
    })
  );
  const identityRevision = await updateDocument<PersistedIdentityData>(
    documents,
    "identity",
    { schemaVersion: 1, revision: 0, users: [], auditEvents: [] },
    (current, nextRevision) => createUatUxV2IdentityData(current, credentials, nextRevision)
  );
  const communicationRevision = await updateDocument<PersistedCommunicationData>(
    documents,
    "communications",
    { schemaVersion: 1, revision: 0, threads: [], messages: [], auditEvents: [], presence: [] } as PersistedCommunicationData,
    (current, nextRevision) => createUatUxV2CommunicationData(current, nextRevision)
  );
  const pushRevision = await updateDocument<PersistedPushData>(
    documents,
    "push_notifications",
    { schemaVersion: 1, revision: 0, subscriptions: [], events: [], deliveries: [] } as PersistedPushData,
    (current, nextRevision) => createUatUxV2PushData(current, nextRevision)
  );
  await ensurePrivateAttachments(bucket, database);
  return {
    operationsRevision,
    identityRevision,
    communicationRevision,
    pushRevision,
    identityCount: UAT_UXV2_IDENTITIES.length
  };
}

async function updateDocument<T>(
  documents: RuntimeDocumentStore,
  namespace: string,
  initial: T,
  update: (current: T, nextRevision: number) => T
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await documents.read(namespace, initial);
    const next = update(structuredClone(current.payload), current.revision + 1);
    if (JSON.stringify(next) === JSON.stringify(current.payload)) return current.revision;
    const committed = await documents.compareAndSwap(namespace, current.revision, next);
    if (committed.committed) return committed.revision;
  }
  throw new Error(`Không thể áp dụng fixture ${UAT_UXV2_PREFIX} vì runtime document thay đổi liên tục.`);
}

const attachmentIds = Object.values(UAT_UXV2_ATTACHMENT_IDS);

const attachmentOwners: Record<string, string> = {
  [UAT_UXV2_ATTACHMENT_IDS.customer]: "uat-uxv2-user-customer",
  [UAT_UXV2_ATTACHMENT_IDS.customerB]: "uat-uxv2-user-customer-b",
  [UAT_UXV2_ATTACHMENT_IDS.supplier]: "uat-uxv2-user-supplier",
  [UAT_UXV2_ATTACHMENT_IDS.supplierB]: "uat-uxv2-user-supplier-b"
};

const fixturePng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

async function ensurePrivateAttachments(bucket: R2BucketLike, database: D1DatabaseLike) {
  const sha256 = createHash("sha256").update(fixturePng).digest("hex");
  for (const id of attachmentIds) {
    const objectKey = `${id}.png`;
    if (!await bucket.get(objectKey)) {
      await bucket.put(objectKey, fixturePng, { httpMetadata: { contentType: "image/png" } });
    }
    const existing = await database
      .prepare("SELECT id FROM private_object_metadata WHERE id = ?1 AND status = 'active'")
      .bind(id)
      .first<{ id: string }>();
    if (existing) continue;
    const result = await database
      .prepare(`INSERT INTO private_object_metadata(
        id, object_key, owner_scope, owner_id, content_type, byte_size, sha256, status, uploaded_by, created_at
      ) VALUES (?1, ?2, 'operations_actor', ?3, 'image/png', ?4, ?5, 'active', ?3, ?6)`)
      .bind(id, objectKey, attachmentOwners[id], fixturePng.length, sha256, "2026-08-02T00:00:00.000Z")
      .run();
    if (!result.success || Number(result.meta?.changes ?? 0) !== 1) {
      const concurrent = await database
        .prepare("SELECT id FROM private_object_metadata WHERE id = ?1 AND status = 'active'")
        .bind(id)
        .first<{ id: string }>();
      if (!concurrent) throw new Error(`Không thể tạo metadata chứng từ fixture ${id}.`);
    }
  }
}

export function assertCloudflareUatCredentials(value: unknown): asserts value is CloudflareUatCredentials {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Thông tin tài khoản fixture không hợp lệ.");
  const credentials = value as Record<string, unknown>;
  const expected = new Set<string>(UAT_UXV2_IDENTITIES);
  if (Object.keys(credentials).length !== expected.size || Object.keys(credentials).some((key) => !expected.has(key))) {
    throw new CloudflareUatFixtureInputError("Danh sách tài khoản fixture không hợp lệ.");
  }
  const passwords = new Set<string>();
  for (const identity of UAT_UXV2_IDENTITIES) {
    const entry = credentials[identity] as { username?: unknown; password?: unknown } | undefined;
    const expectedUsername = `uat.uxv2.${identity.toLocaleLowerCase("en-US").replace("_", ".")}`;
    if (!entry || entry.username !== expectedUsername || typeof entry.password !== "string" || entry.password.length < 20 || entry.password.length > 128 || !/\p{L}/u.test(entry.password) || !/\p{N}/u.test(entry.password)) {
      throw new CloudflareUatFixtureInputError(`Thông tin ${identity} không hợp lệ.`);
    }
    if (passwords.has(entry.password)) {
      throw new CloudflareUatFixtureInputError("Mỗi tài khoản fixture phải dùng mật khẩu khác nhau.");
    }
    passwords.add(entry.password);
  }
}
