import { describe, expect, it, vi } from "vitest";
import { MutationIntentRegistry, mutationIntentFingerprint } from "@/components/erp-v2/mutation-intent-registry";
import { hashErpV2CommandRequest } from "@/server/application/idempotency";

describe("browser mutation intent idempotency", () => {
  it("blocks a rapid double submit while keeping the same key", () => {
    const registry = new MutationIntentRegistry();
    const createKey = vi.fn(() => "stable-operation-key-0001");
    const first = registry.begin("create:customer", { name: "Công trình A" }, createKey);
    const second = registry.begin("create:customer", { name: "Công trình A" }, createKey);

    expect(first).toEqual({ idempotencyKey: "stable-operation-key-0001", shouldExecute: true });
    expect(second).toEqual({ idempotencyKey: "stable-operation-key-0001", shouldExecute: false });
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it("blocks a second click while the first delayed response is still pending", async () => {
    const registry = new MutationIntentRegistry();
    let releaseResponse!: () => void;
    const delayedResponse = new Promise<void>((resolve) => { releaseResponse = resolve; });
    const first = registry.begin("operation:delivery:GH-1", { quantity: 3 }, () => "delayed-response-key-0001");
    const request = delayedResponse.then(() => registry.complete("operation:delivery:GH-1", first.idempotencyKey));

    const secondClick = registry.begin("operation:delivery:GH-1", { quantity: 3 }, () => "must-not-be-created");
    expect(secondClick).toEqual({ idempotencyKey: first.idempotencyKey, shouldExecute: false });

    releaseResponse();
    await request;
    const nextIntent = registry.begin("operation:delivery:GH-1", { quantity: 3 }, () => "delayed-response-key-0002");
    expect(nextIntent).toEqual({ idempotencyKey: "delayed-response-key-0002", shouldExecute: true });
  });

  it("reuses the same key after a lost response or server error with unknown persistence outcome", () => {
    const registry = new MutationIntentRegistry();
    const keys = ["stable-operation-key-0002", "unexpected-second-key"];
    const first = registry.begin("operation:confirm:SO-1", { expectedVersion: 1 }, () => keys.shift()!);
    registry.retainForRetry("operation:confirm:SO-1", first.idempotencyKey);
    const retry = registry.begin("operation:confirm:SO-1", { expectedVersion: 1 }, () => keys.shift()!);

    expect(retry).toEqual({ idempotencyKey: first.idempotencyKey, shouldExecute: true });
    expect(keys).toEqual(["unexpected-second-key"]);
  });

  it("replays a lost response after server persistence without a duplicate mutation", async () => {
    const registry = new MutationIntentRegistry();
    const persistedKeys = new Set<string>();
    let mutationCount = 0;
    const persist = async (key: string, loseResponse: boolean) => {
      if (!persistedKeys.has(key)) {
        persistedKeys.add(key);
        mutationCount += 1;
      }
      if (loseResponse) throw new Error("response lost after commit");
      return "replayed";
    };
    const scope = "operation:confirm-payment:PAY-1";
    const first = registry.begin(scope, { expectedVersion: 1 }, () => "lost-response-key-0001");
    await expect(persist(first.idempotencyKey, true)).rejects.toThrow(/response lost/);
    registry.retainForRetry(scope, first.idempotencyKey);

    const retry = registry.begin(scope, { expectedVersion: 1 }, () => "must-not-rotate");
    await expect(persist(retry.idempotencyKey, false)).resolves.toBe("replayed");
    registry.complete(scope, retry.idempotencyKey);

    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(mutationCount).toBe(1);
  });

  it("retries a server failure before persistence with one mutation and the retained key", async () => {
    const registry = new MutationIntentRegistry();
    let attempts = 0;
    let mutationCount = 0;
    const persist = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("server 5xx before persistence");
      mutationCount += 1;
    };
    const scope = "create:customer-payment";
    const first = registry.begin(scope, { amount: 120_000 }, () => "server-5xx-key-0001");
    await expect(persist()).rejects.toThrow(/5xx/);
    registry.retainForRetry(scope, first.idempotencyKey);

    const retry = registry.begin(scope, { amount: 120_000 }, () => "must-not-rotate");
    await expect(persist()).resolves.toBeUndefined();
    registry.complete(scope, retry.idempotencyKey);

    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(mutationCount).toBe(1);
  });

  it("creates a new key when the user fixes a validation error by changing the payload", () => {
    const registry = new MutationIntentRegistry();
    const first = registry.begin("operation:reject:GH-1", { reason: "" }, () => "validation-key-0001");
    registry.retainForRetry("operation:reject:GH-1", first.idempotencyKey);
    const corrected = registry.begin("operation:reject:GH-1", { reason: "Số lượng chưa khớp" }, () => "validation-key-0002");

    expect(corrected).toEqual({ idempotencyKey: "validation-key-0002", shouldExecute: true });
  });

  it("rotates only after successful completion so an intentional second action is new", () => {
    const registry = new MutationIntentRegistry();
    const first = registry.begin("create:supplier", { name: "Nhà cung cấp A" }, () => "success-key-0001");
    registry.complete("create:supplier", first.idempotencyKey);
    const intentionalSecond = registry.begin("create:supplier", { name: "Nhà cung cấp A" }, () => "success-key-0002");

    expect(intentionalSecond).toEqual({ idempotencyKey: "success-key-0002", shouldExecute: true });
  });

  it("uses a deterministic payload fingerprint regardless of object key order", () => {
    expect(mutationIntentFingerprint({ b: 2, a: { d: 4, c: 3 } })).toBe(
      mutationIntentFingerprint({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it("treats upload retries with new storage ids as the same logical command", () => {
    const shared = {
      fileName: "xac-nhan.png",
      contentType: "image/png",
      size: 128,
      sha256: "same-content-sha",
      uploadedBy: "worker-1"
    };
    const first = hashErpV2CommandRequest({
      operation: "submitDeliveryCompletion",
      options: { attachments: [{ ...shared, id: "attachment-1", uploadedAt: "2026-08-24T01:00:00.000Z" }] }
    });
    const retry = hashErpV2CommandRequest({
      operation: "submitDeliveryCompletion",
      options: { attachments: [{ ...shared, id: "attachment-2", uploadedAt: "2026-08-24T01:00:05.000Z" }] }
    });
    const differentFile = hashErpV2CommandRequest({
      operation: "submitDeliveryCompletion",
      options: { attachments: [{ ...shared, sha256: "different-content-sha", id: "attachment-3", uploadedAt: "2026-08-24T01:00:05.000Z" }] }
    });

    expect(retry).toBe(first);
    expect(differentFile).not.toBe(first);
  });
});
