import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DeliveryTrackingState, DeliveryTrackingStore } from "@/server/delivery-tracking/types";

const emptyState = (): DeliveryTrackingState => ({ revision: 0, sessions: [], events: [] });

export class FileDeliveryTrackingStore implements DeliveryTrackingStore {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly filePath = process.env.VLXD_TRACKING_DATA_FILE || resolve(process.cwd(), ".data", "delivery-tracking.json")) {}

  async getSnapshot() {
    return structuredClone(await this.readState());
  }

  async transaction<T>(callback: (state: DeliveryTrackingState) => T | Promise<T>): Promise<T> {
    let release: () => void = () => {};
    const previous = this.tail;
    this.tail = new Promise<void>((resolveTail) => {
      release = resolveTail;
    });
    await previous;
    try {
      const state = await this.readState();
      const result = await callback(state);
      state.revision += 1;
      await this.writeState(state);
      return result;
    } finally {
      release();
    }
  }

  private async readState(): Promise<DeliveryTrackingState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<DeliveryTrackingState>;
      if (!Array.isArray(parsed.sessions) || !Array.isArray(parsed.events) || !Number.isInteger(parsed.revision)) {
        return emptyState();
      }
      return {
        revision: parsed.revision,
        sessions: parsed.sessions,
        events: parsed.events
      } as DeliveryTrackingState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyState();
      }
      throw error;
    }
  }

  private async writeState(state: DeliveryTrackingState) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(state, null, 2), "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

export class MemoryDeliveryTrackingStore implements DeliveryTrackingStore {
  private state: DeliveryTrackingState;

  constructor(initial: DeliveryTrackingState = emptyState()) {
    this.state = structuredClone(initial);
  }

  async getSnapshot() {
    return structuredClone(this.state);
  }

  async transaction<T>(callback: (state: DeliveryTrackingState) => T | Promise<T>) {
    const working = structuredClone(this.state);
    const result = await callback(working);
    working.revision += 1;
    this.state = working;
    return result;
  }
}
