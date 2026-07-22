import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsState } from "@/modules/operations/types";
import type { IdempotencyRecord, OperationsUnitOfWork, TransactionRunner } from "../application/ports";

const maximumIdempotencyRecords = 2_000;

export class MemoryOperationsBackend implements TransactionRunner {
  private state: OperationsState;
  private revision = 1;
  private readonly idempotencyRecords = new Map<string, IdempotencyRecord>();
  private queue: Promise<void> = Promise.resolve();

  constructor(initialState: OperationsState = createInitialOperationsState()) {
    this.state = structuredClone(initialState) as OperationsState;
  }

  async transaction<T>(handler: (tx: OperationsUnitOfWork) => Promise<T>): Promise<T> {
    const task = this.queue.then(() => this.runTransaction(handler));
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  private async runTransaction<T>(handler: (tx: OperationsUnitOfWork) => Promise<T>): Promise<T> {
    const workingState = structuredClone(this.state) as OperationsState;
    const workingIdempotency = new Map(this.idempotencyRecords);
    let stateSaved = false;

    const tx: OperationsUnitOfWork = {
      findIdempotencyRecord: async (key) => workingIdempotency.get(key),
      recordIdempotency: async (record) => {
        if (workingIdempotency.has(record.key)) {
          throw new Error("Idempotency key đã tồn tại trong transaction.");
        }
        workingIdempotency.set(record.key, structuredClone(record) as IdempotencyRecord);
        while (workingIdempotency.size > maximumIdempotencyRecords) {
          const oldestKey = workingIdempotency.keys().next().value;
          if (!oldestKey) {
            break;
          }
          workingIdempotency.delete(oldestKey);
        }
      },
      loadOperationsStateForUpdate: async () => workingState,
      saveOperationsState: async (nextState) => {
        replaceObject(workingState, nextState);
        stateSaved = true;
      }
    };

    const result = await handler(tx);

    this.state = structuredClone(workingState) as OperationsState;
    if (stateSaved) {
      this.revision += 1;
    }
    this.idempotencyRecords.clear();
    for (const [key, value] of workingIdempotency.entries()) {
      this.idempotencyRecords.set(key, structuredClone(value) as IdempotencyRecord);
    }

    return result;
  }

  getState() {
    return structuredClone(this.state) as OperationsState;
  }

  getSnapshot() {
    return this.queue.then(() => ({
      state: this.getState(),
      revision: this.revision
    }));
  }

  getRevision() {
    return this.revision;
  }

  async reset(nextState: OperationsState = createInitialOperationsState()) {
    await this.enqueue(async () => {
      this.state = structuredClone(nextState) as OperationsState;
      this.idempotencyRecords.clear();
      this.revision += 1;
    });
  }

  private async enqueue<T>(handler: () => Promise<T>) {
    const task = this.queue.then(handler);
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  async getStateWithLock() {
    await this.queue;
    return {
      state: this.getState(),
      revision: this.revision
    };
  }
}

function replaceObject<T extends object>(target: T, source: T) {
  const nextState = structuredClone(source);
  for (const key of Object.keys(target) as Array<keyof T>) {
    delete target[key];
  }
  Object.assign(target, nextState);
}
