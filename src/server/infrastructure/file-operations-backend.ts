import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsState } from "@/modules/operations/types";
import { normalizeUnitName } from "@/modules/operations/unit-settings";
import type { IdempotencyRecord, OperationsUnitOfWork, TransactionRunner } from "../application/ports";

type PersistedOperationsData = {
  schemaVersion: 1;
  revision: number;
  state: OperationsState;
  idempotencyRecords: IdempotencyRecord[];
};

const maximumIdempotencyRecords = 2_000;

export class FileOperationsBackend implements TransactionRunner {
  private queue: Promise<void> = Promise.resolve();
  readonly filePath: string;

  constructor(filePath = resolve(/* turbopackIgnore: true */ process.cwd(), ".data", "operations.json")) {
    this.filePath = filePath;
  }

  transaction<T>(handler: (tx: OperationsUnitOfWork) => Promise<T>): Promise<T> {
    const task = this.queue.then(() => this.runTransaction(handler));
    this.queue = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  async getSnapshot() {
    await this.queue;
    const data = await this.load();
    return {
      state: structuredClone(data.state) as OperationsState,
      revision: data.revision
    };
  }

  async reset(nextState: OperationsState = createInitialOperationsState()) {
    await this.enqueue(async () => {
      const current = await this.load();
      await this.persist({
        schemaVersion: 1,
        revision: current.revision + 1,
        state: structuredClone(nextState) as OperationsState,
        idempotencyRecords: []
      });
    });
  }

  private async runTransaction<T>(handler: (tx: OperationsUnitOfWork) => Promise<T>) {
    const persisted = await this.load();
    const workingState = structuredClone(persisted.state) as OperationsState;
    const workingIdempotency = new Map(
      persisted.idempotencyRecords.map((record) => [record.key, structuredClone(record) as IdempotencyRecord])
    );
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
    await this.persist({
      schemaVersion: 1,
      revision: persisted.revision + (stateSaved ? 1 : 0),
      state: workingState,
      idempotencyRecords: [...workingIdempotency.values()]
    });
    return result;
  }

  private async load(): Promise<PersistedOperationsData> {
    try {
      const raw = await readFile(/* turbopackIgnore: true */ this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedOperationsData;
      if (parsed.schemaVersion !== 1 || !Number.isInteger(parsed.revision) || !parsed.state) {
        throw new Error("Dữ liệu vận hành không đúng phiên bản hoặc bị thiếu trường bắt buộc.");
      }
      parsed.state.cashVouchers ??= [];
      parsed.state.bankTransferProofs ??= [];
      parsed.state.employeeAdvances ??= [];
      parsed.state.importJobs ??= [];
      parsed.state.approvalRequests ??= [];
      parsed.state.approvalRequests.forEach((request) => {
        request.attachments ??= [];
      });
      const initialState = createInitialOperationsState();
      parsed.state.unitDefinitions ??= initialState.unitDefinitions;
      parsed.state.purchaseUnitConversions ??= initialState.purchaseUnitConversions;
      const unitNameById = new Map(parsed.state.unitDefinitions.map((unit) => [unit.id, unit.name]));
      parsed.state.purchaseUnitConversions.forEach((conversion) => {
        const isVehicleUnit = normalizeUnitName(unitNameById.get(conversion.unitId) ?? "") === "xe";
        conversion.conversionMode ??= isVehicleUnit ? "variable" : "fixed";
        if (conversion.conversionMode === "variable") {
          conversion.factorToBase = null;
        }
      });
      parsed.state.importIssues.forEach((issue) => {
        issue.importJobId ??= parsed.state.importJobs.find((job) => issue.id.startsWith(`${job.id}-issue-`))?.id;
      });
      parsed.state.importJobs.forEach((job) => {
        job.status = parsed.state.importIssues.some((issue) => issue.importJobId === job.id && issue.status === "open")
          ? "dry_run"
          : "reviewed";
      });
      parsed.state.vehicles ??= initialState.vehicles;
      parsed.state.deliveryJobs.forEach((job) => {
        job.vehicleId ??= parsed.state.vehicles[0]?.id ?? "";
      });
      hydrateLegacyPaymentAllocations(parsed.state);
      hydrateLegacyDirectDeliveryMetadata(parsed.state);
      hydrateLegacyInventoryLedgerMetadata(parsed.state);
      parsed.state.compensationBatches.forEach((batch, index) => {
        batch.workOrderId ??= parsed.state.workOrders[index]?.id ?? "";
      });
      return parsed;
    } catch (error) {
      if (isMissingFileError(error)) {
        const initial: PersistedOperationsData = {
          schemaVersion: 1,
          revision: 1,
          state: createInitialOperationsState(),
          idempotencyRecords: []
        };
        await this.persist(initial);
        return initial;
      }
      throw error;
    }
  }

  private async persist(data: PersistedOperationsData) {
    await mkdir(/* turbopackIgnore: true */ dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(/* turbopackIgnore: true */ temporaryPath, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
    await rename(/* turbopackIgnore: true */ temporaryPath, /* turbopackIgnore: true */ this.filePath);
  }

  private enqueue<T>(handler: () => Promise<T>) {
    const task = this.queue.then(handler);
    this.queue = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function replaceObject<T extends object>(target: T, source: T) {
  for (const key of Object.keys(target) as Array<keyof T>) {
    delete target[key];
  }
  Object.assign(target, structuredClone(source));
}

function hydrateLegacyPaymentAllocations(state: OperationsState) {
  for (const payment of [...state.customerPayments, ...state.supplierPayments]) {
    payment.allocations ??= [];
    if (payment.status === "allocated" || payment.status === "partially_allocated") {
      const allocatedAmount = payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
      payment.status = allocatedAmount <= 0
        ? "confirmed"
        : allocatedAmount < payment.amount
          ? "partially_allocated"
          : "allocated";
    }
  }
}

function hydrateLegacyDirectDeliveryMetadata(state: OperationsState) {
  for (const purchaseOrder of state.purchaseOrders) {
    for (const purchaseLine of purchaseOrder.lines.filter((line) => line.destinationType === "customer_direct" && line.receivedQuantity > 0)) {
      const salesOrder = state.salesOrders.find((order) => order.lines.some((line) => line.id === purchaseLine.salesOrderLineId));
      const salesLine = salesOrder?.lines.find((line) => line.id === purchaseLine.salesOrderLineId);
      if (!salesOrder || !salesLine) {
        continue;
      }
      const legacyPayables = state.supplierLedgerEntries.filter((entry) =>
        entry.sourceDocument === purchaseOrder.documentNo &&
        entry.direction === "credit" &&
        !entry.entryType
      );
      const legacyReceivables = state.customerLedgerEntries.filter((entry) =>
        entry.customerId === salesOrder.customerId &&
        entry.sourceDocument === `${salesOrder.documentNo}:GIAO-THANG` &&
        entry.direction === "debit" &&
        !entry.postingGroupId
      );
      legacyPayables.forEach((payable, index) => {
        const grossUnitCost = purchaseLine.unitCost * (1 + purchaseLine.taxRate);
        const quantity = grossUnitCost > 0 ? payable.amount / grossUnitCost : purchaseLine.receivedQuantity;
        const postingGroupId = `direct-${purchaseLine.id}-${index + 1}`;
        payable.netAmount = quantity * purchaseLine.unitCost;
        payable.taxAmount = quantity * purchaseLine.unitCost * purchaseLine.taxRate;
        payable.quantity = quantity;
        payable.sourceLineId = purchaseLine.id;
        payable.postingGroupId = postingGroupId;
        payable.entryType = "direct_delivery";

        const receivable = legacyReceivables[index];
        if (receivable) {
          receivable.quantity = quantity;
          receivable.sourceLineId = salesLine.id;
          receivable.postingGroupId = postingGroupId;
          receivable.entryType = "sale_delivery";
        }
      });
    }
  }
}

function hydrateLegacyInventoryLedgerMetadata(state: OperationsState) {
  for (const movement of state.inventoryMovements) {
    if (movement.movementType === "receipt") {
      const payable = state.supplierLedgerEntries.find((entry) =>
        !entry.postingGroupId &&
        entry.entryType === "inventory_receipt" &&
        entry.direction === "credit" &&
        entry.sourceDocument === movement.sourceDocument &&
        entry.sourceLineId === movement.sourceLineId &&
        (entry.quantity === undefined || amountsEqual(entry.quantity, movement.quantity))
      );
      if (payable) {
        payable.postingGroupId = movement.postingKey;
        hydrateLegacyLedgerReversal(state.supplierLedgerEntries, payable, movement.postingKey, "debit");
      }
    }

    if (movement.movementType === "issue") {
      const receivable = state.customerLedgerEntries.find((entry) =>
        !entry.postingGroupId &&
        entry.entryType === "sale_delivery" &&
        entry.direction === "debit" &&
        entry.sourceDocument === `${movement.sourceDocument}:GIAO-KHO` &&
        entry.sourceLineId === movement.sourceLineId &&
        (entry.quantity === undefined || amountsEqual(entry.quantity, Math.abs(movement.quantity)))
      );
      if (receivable) {
        receivable.postingGroupId = movement.postingKey;
        hydrateLegacyLedgerReversal(state.customerLedgerEntries, receivable, movement.postingKey, "credit");
      }
    }
  }
}

function hydrateLegacyLedgerReversal<
  T extends OperationsState["customerLedgerEntries"][number] | OperationsState["supplierLedgerEntries"][number]
>(entries: T[], original: T, postingGroupId: string, reversalDirection: "debit" | "credit") {
  const reversal = entries.find((entry) =>
    !entry.postingGroupId &&
    entry.entryType === "reversal" &&
    entry.direction === reversalDirection &&
    entry.sourceLineId === original.sourceLineId &&
    amountsEqual(entry.amount, original.amount)
  );
  if (reversal) {
    reversal.postingGroupId = postingGroupId;
  }
}

function amountsEqual(left: number, right: number) {
  return Math.abs(left - right) <= 0.000001;
}
