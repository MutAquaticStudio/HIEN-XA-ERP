import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/mobile/management/operations/route";
import { GET } from "@/app/api/mobile/management/overview/route";

describe("mobile management overview route", () => {
  it("rejects a request that does not include a native Bearer session", async () => {
    const response = await GET(new Request("https://erp.example.test/api/mobile/management/overview"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("rejects a management mutation that does not include a native Bearer session", async () => {
    const response = await POST(new Request("https://erp.example.test/api/mobile/management/operations", {
      method: "POST",
      body: JSON.stringify({ operation: "confirmSalesOrder", targetId: "so-001", idempotencyKey: "mobile-sales-confirm-001" })
    }));

    expect(response.status).toBe(401);
  });
});
