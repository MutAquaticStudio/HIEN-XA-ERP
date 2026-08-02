import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "./supabase-server-client";

export type RuntimeDocument<T> = {
  revision: number;
  payload: T;
};

export class SupabaseRuntimeDocumentStore {
  constructor(private readonly client: SupabaseClient = getSupabaseServerClient()) {}

  async read<T>(namespace: string, initial: T): Promise<RuntimeDocument<T>> {
    const { data, error } = await this.client.rpc("read_erp_runtime_document", {
      p_namespace: namespace
    });
    if (error) {
      throw new Error(`Không thể đọc runtime document ${namespace}: ${error.message}`);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return { revision: 0, payload: structuredClone(initial) };
    }
    return {
      revision: Number(row.revision),
      payload: structuredClone(row.payload as T)
    };
  }

  async compareAndSwap<T>(namespace: string, expectedRevision: number, payload: T) {
    const { data, error } = await this.client.rpc("commit_erp_runtime_document", {
      p_namespace: namespace,
      p_expected_revision: expectedRevision,
      p_payload: payload
    });
    if (error) {
      throw new Error(`Không thể ghi runtime document ${namespace}: ${error.message}`);
    }
    const result = (Array.isArray(data) ? data[0] : data) as { committed?: boolean; revision?: number } | null;
    if (!result || typeof result.committed !== "boolean" || !Number.isInteger(result.revision)) {
      throw new Error(`Phản hồi runtime document ${namespace} không hợp lệ.`);
    }
    return { committed: result.committed, revision: Number(result.revision) };
  }
}
