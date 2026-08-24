type IntentRecord = {
  fingerprint: string;
  idempotencyKey: string;
  inFlight: boolean;
};

export type MutationIntentLease = {
  idempotencyKey: string;
  shouldExecute: boolean;
};

/**
 * Keeps idempotency state inside the mounted application runtime. It is not
 * written to browser-global storage and therefore cannot leak between users.
 */
export class MutationIntentRegistry {
  private readonly intents = new Map<string, IntentRecord>();

  begin(scope: string, payload: unknown, createKey: () => string): MutationIntentLease {
    const fingerprint = mutationIntentFingerprint(payload);
    const existing = this.intents.get(scope);
    if (existing?.inFlight) {
      return { idempotencyKey: existing.idempotencyKey, shouldExecute: false };
    }
    if (existing && existing.fingerprint === fingerprint) {
      existing.inFlight = true;
      return { idempotencyKey: existing.idempotencyKey, shouldExecute: true };
    }

    const next = { fingerprint, idempotencyKey: createKey(), inFlight: true };
    this.intents.set(scope, next);
    return { idempotencyKey: next.idempotencyKey, shouldExecute: true };
  }

  retainForRetry(scope: string, idempotencyKey: string) {
    const current = this.intents.get(scope);
    if (current?.idempotencyKey === idempotencyKey) current.inFlight = false;
  }

  complete(scope: string, idempotencyKey: string) {
    const current = this.intents.get(scope);
    if (current?.idempotencyKey === idempotencyKey) this.intents.delete(scope);
  }
}

export function mutationIntentFingerprint(value: unknown): string {
  return JSON.stringify(canonicalizeIntent(value));
}

function canonicalizeIntent(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (value instanceof File) {
    return { name: value.name, size: value.size, type: value.type, lastModified: value.lastModified };
  }
  if (Array.isArray(value)) return value.map(canonicalizeIntent);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().flatMap((key) =>
      record[key] === undefined ? [] : [[key, canonicalizeIntent(record[key])]]
    ));
  }
  return String(value);
}
