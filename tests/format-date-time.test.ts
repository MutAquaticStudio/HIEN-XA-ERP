import { describe, expect, it } from "vitest";
import { formatDateTime } from "@/lib/format";

describe("formatDateTime", () => {
  it("uses the business timezone independently from the host timezone", () => {
    expect(formatDateTime("2026-07-29T00:30:00.000Z")).toBe("07:30 29/7/26");
  });
});
