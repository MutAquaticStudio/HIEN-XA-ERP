import { randomUUID } from "node:crypto";
import {
  getCloudflareBackgroundQueue,
  getCloudflareD1Database,
  getCloudflarePrivateBucket
} from "./cloudflare-bindings";

export type CloudflareIntegrationProbeResult = {
  migrationCount: number;
  cas: "passed";
  idempotencyReplay: "passed";
  r2PrivateRoundTrip: "passed";
  queueEnqueue: "passed";
  reconciliation: 0;
};

export async function runCloudflareIntegrationProbe(runId: string): Promise<CloudflareIntegrationProbeResult> {
  const database = getCloudflareD1Database();
  const bucket = getCloudflarePrivateBucket();
  const queue = getCloudflareBackgroundQueue();
  const namespace = `uat-rem-${runId}`;
  const objectKey = `uat-rem/${runId}/${randomUUID()}.txt`;
  let objectWritten = false;

  try {
    const migrationRow = await database.prepare("SELECT COUNT(*) AS count FROM d1_migrations").first<{ count: number }>();
    const migrationCount = Number(migrationRow?.count ?? 0);
    if (migrationCount < 1) throw new Error("D1 staging has no applied migration history.");

    const inserted = await database
      .prepare(`INSERT INTO erp_runtime_documents(namespace, revision, schema_version, payload, updated_at)
        VALUES (?1, 1, 1, ?2, ?3) ON CONFLICT(namespace) DO NOTHING`)
      .bind(namespace, JSON.stringify({ runId, step: 1 }), new Date().toISOString())
      .run();
    if (!inserted.success || Number(inserted.meta?.changes ?? 0) !== 1) {
      throw new Error("Cloudflare staging probe namespace already exists or could not be created.");
    }

    const updated = await database
      .prepare("UPDATE erp_runtime_documents SET revision = revision + 1, payload = ?1 WHERE namespace = ?2 AND revision = 1")
      .bind(JSON.stringify({ runId, step: 2 }), namespace)
      .run();
    if (!updated.success || Number(updated.meta?.changes ?? 0) !== 1) {
      throw new Error("D1 CAS update did not commit exactly once.");
    }

    const replay = await database
      .prepare("UPDATE erp_runtime_documents SET revision = revision + 1, payload = ?1 WHERE namespace = ?2 AND revision = 1")
      .bind(JSON.stringify({ runId, step: 2 }), namespace)
      .run();
    if (!replay.success || Number(replay.meta?.changes ?? 0) !== 0) {
      throw new Error("D1 stale replay was not rejected.");
    }

    const body = new TextEncoder().encode(`UAT-REM private object ${runId}`);
    await bucket.put(objectKey, body, { httpMetadata: { contentType: "text/plain" } });
    objectWritten = true;
    const stored = await bucket.get(objectKey);
    if (!stored || new TextDecoder().decode(await stored.arrayBuffer()) !== `UAT-REM private object ${runId}`) {
      throw new Error("R2 private object round-trip failed.");
    }

    await queue.send({ type: "uat_rem_probe", runId, financialPostingAllowed: false }, { contentType: "json" });

    return {
      migrationCount,
      cas: "passed",
      idempotencyReplay: "passed",
      r2PrivateRoundTrip: "passed",
      queueEnqueue: "passed",
      reconciliation: 0
    };
  } finally {
    await database.prepare("DELETE FROM erp_runtime_documents WHERE namespace = ?1").bind(namespace).run().catch(() => undefined);
    if (objectWritten) await bucket.delete(objectKey).catch(() => undefined);
  }
}
