import type { RuntimeDocument, RuntimeDocumentStore } from "./runtime-document-store";
import { getCloudflareD1Database, type D1DatabaseLike } from "./cloudflare-bindings";

type RuntimeDocumentRow = {
  revision: number;
  payload: string;
};

export class CloudflareRuntimeDocumentStore implements RuntimeDocumentStore {
  constructor(private readonly database?: D1DatabaseLike) {}

  async read<T>(namespace: string, initial: T): Promise<RuntimeDocument<T>> {
    const row = await this.db()
      .prepare("SELECT revision, payload FROM erp_runtime_documents WHERE namespace = ?1")
      .bind(namespace)
      .first<RuntimeDocumentRow>();
    if (!row) {
      return { revision: 0, payload: structuredClone(initial) };
    }
    if (!Number.isInteger(row.revision) || row.revision < 1 || typeof row.payload !== "string") {
      throw new Error(`Dữ liệu Cloudflare ${namespace} không hợp lệ.`);
    }
    try {
      return {
        revision: row.revision,
        payload: structuredClone(JSON.parse(row.payload) as T)
      };
    } catch {
      throw new Error(`Dữ liệu Cloudflare ${namespace} không đọc được.`);
    }
  }

  async compareAndSwap<T>(namespace: string, expectedRevision: number, payload: T) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error("Phiên bản dữ liệu Cloudflare không hợp lệ.");
    }
    const serialized = JSON.stringify(payload);
    const now = new Date().toISOString();
    const result = expectedRevision === 0
      ? await this.db()
          .prepare(`
            INSERT INTO erp_runtime_documents(namespace, revision, schema_version, payload, updated_at)
            VALUES (?1, 1, 1, ?2, ?3)
            ON CONFLICT(namespace) DO NOTHING
          `)
          .bind(namespace, serialized, now)
          .run()
      : await this.db()
          .prepare(`
            UPDATE erp_runtime_documents
            SET revision = revision + 1, payload = ?1, updated_at = ?2
            WHERE namespace = ?3 AND revision = ?4
          `)
          .bind(serialized, now, namespace, expectedRevision)
          .run();
    if (!result.success) {
      throw new Error(`Không thể ghi dữ liệu Cloudflare ${namespace}.`);
    }
    const committed = Number(result.meta?.changes ?? 0) === 1;
    return {
      committed,
      revision: committed ? expectedRevision + 1 : (await this.read(namespace, payload)).revision
    };
  }

  private db() {
    return this.database ?? getCloudflareD1Database();
  }
}
