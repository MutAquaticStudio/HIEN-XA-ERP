import { describe, expect, it } from "vitest";
import { hashCommandRequest } from "../src/server/application/idempotency";

describe("idempotency request hashing", () => {
  it("uses a stable canonical hash for equivalent JSON payloads", () => {
    const left = hashCommandRequest({
      type: "createSupplier",
      displayName: "Thép Việt Nhật",
      phone: "0909 111 222",
      nested: {
        b: 2,
        a: 1
      }
    });
    const right = hashCommandRequest({
      nested: {
        a: 1,
        b: 2
      },
      phone: "0909 111 222",
      displayName: "Thép Việt Nhật",
      type: "createSupplier"
    });

    expect(left).toBe(right);
    expect(left).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects non-JSON and non-finite values", () => {
    expect(() => hashCommandRequest({ amount: Number.NaN })).toThrow("không hữu hạn");
    expect(() => hashCommandRequest({ callback: () => undefined })).toThrow("JSON");
  });
});
