import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsState } from "@/modules/operations/types";
import type { IdempotencyRecord, OperationsUnitOfWork, TransactionRunner } from "../application/ports";
import { SupabaseRuntimeDocumentStore } from "./supabase-runtime-document-store";
import type { RuntimeDocumentStore } from "./runtime-document-store";

type PersistedOperationsData = {
  schemaVersion: 1;
  state: OperationsState;
  idempotencyRecords: IdempotencyRecord[];
};

const namespace = "operations";
const maximumIdempotencyRecords = 2_000;
const maximumCommitAttempts = 6;

export class SupabaseOperationsBackend implements TransactionRunner {
  constructor(
    private readonly documents: RuntimeDocumentStore = new SupabaseRuntimeDocumentStore(),
    private readonly initialState: () => OperationsState = createInitialOperationsState
  ) {}

  async getSnapshot() {
    const document = await this.documents.read(namespace, this.createInitialData());
    const data = parsePersistedData(document.payload);
    return { state: structuredClone(data.state) as OperationsState, revision: document.revision };
  }

  async reset(nextState: OperationsState = this.initialState()) {
    for (let attempt = 0; attempt < maximumCommitAttempts; attempt += 1) {
      const document = await this.documents.read(namespace, this.createInitialData());
      const committed = await this.documents.compareAndSwap(namespace, document.revision, {
        schemaVersion: 1,
        state: structuredClone(nextState) as OperationsState,
        idempotencyRecords: []
      } satisfies PersistedOperationsData);
      if (committed.committed) return;
    }
    throw new Error("Không thể reset dữ liệu vận hành do xung đột đồng thời.");
  }

  async transaction<T>(handler: (tx: OperationsUnitOfWork) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < maximumCommitAttempts; attempt += 1) {
      const document = await this.documents.read(namespace, this.createInitialData());
      const persisted = parsePersistedData(document.payload);
      const workingState = structuredClone(persisted.state) as OperationsState;
      const idempotency = new Map(
        persisted.idempotencyRecords.map((record) => [record.key, structuredClone(record) as IdempotencyRecord])
      );
      let stateSaved = false;
      let idempotencySaved = false;

      const tx: OperationsUnitOfWork = {
        findIdempotencyRecord: async (key) => idempotency.get(key),
        recordIdempotency: async (record) => {
          if (idempotency.has(record.key)) {
            throw new Error("Idempotency key đã tồn tại trong transaction.");
          }
          idempotency.set(record.key, structuredClone(record) as IdempotencyRecord);
          while (idempotency.size > maximumIdempotencyRecords) {
            const oldestKey = idempotency.keys().next().value;
            if (!oldestKey) break;
            idempotency.delete(oldestKey);
          }
          idempotencySaved = true;
        },
        loadOperationsStateForUpdate: async () => workingState,
        saveOperationsState: async (nextState) => {
          replaceObject(workingState, nextState);
          stateSaved = true;
        }
      };

      const result = await handler(tx);
      if (!stateSaved && !idempotencySaved) return result;

      const committed = await this.documents.compareAndSwap(namespace, document.revision, {
        schemaVersion: 1,
        state: workingState,
        idempotencyRecords: [...idempotency.values()]
      } satisfies PersistedOperationsData);
      if (committed.committed) return result;
    }
    throw new Error("Không thể hoàn tất giao dịch do xung đột đồng thời. Vui lòng thử lại.");
  }

  private createInitialData(): PersistedOperationsData {
    return { schemaVersion: 1, state: this.initialState(), idempotencyRecords: [] };
  }
}

function parsePersistedData(value: unknown): PersistedOperationsData {
  if (!value || typeof value !== "object") {
    throw new Error("Runtime operations payload không hợp lệ.");
  }
  const data = value as Partial<PersistedOperationsData>;
  if (data.schemaVersion !== 1 || !data.state || !Array.isArray(data.idempotencyRecords)) {
    throw new Error("Runtime operations payload thiếu dữ liệu bắt buộc.");
  }
  return data as PersistedOperationsData;
}

function replaceObject<T extends object>(target: T, source: T) {
  const replacement = structuredClone(source);
  for (const key of Object.keys(target) as Array<keyof T>) {
    delete target[key];
  }
  Object.assign(target, replacement);
}
