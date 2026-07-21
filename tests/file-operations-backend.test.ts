import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createOwnerActor } from "../src/modules/operations/service";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { OperationsCommandService } from "../src/server/application/operations-command-service";
import { FileOperationsBackend } from "../src/server/infrastructure/file-operations-backend";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("file operations backend", () => {
  it("persists committed state, revision, and idempotency across backend instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vlxd-operations-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "operations.json");
    const firstBackend = new FileOperationsBackend(filePath);
    const firstService = new OperationsCommandService(firstBackend);
    const input = {
      command: { type: "createSupplier" as const, displayName: "Nhà cung cấp bền vững", phone: "0901000000" },
      actor: createOwnerActor(),
      now: "2026-07-17T08:00:00.000+07:00",
      idempotencyKey: "persistent-supplier-create-12345"
    };

    await firstService.execute(input);
    const persisted = JSON.parse(await readFile(filePath, "utf8")) as {
      idempotencyRecords: Array<{ response?: { state?: unknown } }>;
    };
    expect(persisted.idempotencyRecords[0]?.response?.state).toBeUndefined();
    const secondBackend = new FileOperationsBackend(filePath);
    const secondService = new OperationsCommandService(secondBackend);
    const snapshot = await secondBackend.getSnapshot();
    const replay = await secondService.execute(input);

    expect(snapshot.revision).toBe(2);
    expect(snapshot.state.suppliers.some((supplier) => supplier.displayName === "Nhà cung cấp bền vững")).toBe(true);
    expect(replay.severity).toBe("warning");
    expect((await secondBackend.getSnapshot()).state.suppliers.filter((supplier) => supplier.displayName === "Nhà cung cấp bền vững")).toHaveLength(1);
  });

  it("hydrates allocations when loading supplier payments saved by the previous schema", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vlxd-operations-legacy-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "operations.json");
    const state = createInitialOperationsState();
    const legacyPayment = state.supplierPayments[0] as Partial<(typeof state.supplierPayments)[number]>;
    delete legacyPayment.allocations;
    await writeFile(filePath, JSON.stringify({ schemaVersion: 1, revision: 9, state, idempotencyRecords: [] }), "utf8");

    const snapshot = await new FileOperationsBackend(filePath).getSnapshot();

    expect(snapshot.revision).toBe(9);
    expect(snapshot.state.supplierPayments[0]?.allocations).toEqual([]);
  });
});
