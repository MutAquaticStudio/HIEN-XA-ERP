import { createHash } from "node:crypto";

const defaultMaximumReplayEntries = 2_000;

export class BoundedReplayStore<T> extends Map<string, T> {
  constructor(private readonly maximumEntries = defaultMaximumReplayEntries) {
    super();
  }

  override set(key: string, value: T) {
    if (this.has(key)) {
      this.delete(key);
    }
    super.set(key, value);
    while (this.size > this.maximumEntries) {
      const oldestKey = this.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.delete(oldestKey);
    }
    return this;
  }
}

export function hashCommandRequest(payload: unknown) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex")}`;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Request idempotency hash không chấp nhận số không hữu hạn.");
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const canonicalRecord: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
      const item = record[key];
      if (item !== undefined) {
        canonicalRecord[key] = canonicalize(item);
      }
    }

    return canonicalRecord;
  }

  throw new Error("Request idempotency hash chỉ hỗ trợ dữ liệu JSON.");
}
