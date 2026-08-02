import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsState } from "@/modules/operations/types";
import {
  exportOperationsCutoverSnapshot,
  type OperationsCutoverManifest,
  type ReadOnlyOperationsSnapshotSource
} from "./operations-cutover";
import { SupabaseRuntimeDocumentStore } from "./supabase-runtime-document-store";

type PersistedOperationsDocument = {
  schemaVersion: number;
  state: OperationsState;
  idempotencyRecords: unknown[];
};

type OperationsDocumentReader = Pick<SupabaseRuntimeDocumentStore, "read">;

export class OperationsCutoverRehearsal {
  constructor(private readonly documents: OperationsDocumentReader = new SupabaseRuntimeDocumentStore()) {}

  async exportSnapshot(now = new Date().toISOString()): Promise<OperationsCutoverManifest> {
    const source: ReadOnlyOperationsSnapshotSource = {
      read: async () => this.documents.read<PersistedOperationsDocument>("operations", initialDocument())
    };
    return exportOperationsCutoverSnapshot(source, now);
  }
}

function initialDocument(): PersistedOperationsDocument {
  return {
    schemaVersion: 1,
    state: createInitialOperationsState(),
    idempotencyRecords: []
  };
}
