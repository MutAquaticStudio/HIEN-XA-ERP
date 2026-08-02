import { describe, expect, it, vi } from "vitest";
import { SupabaseDeliveryTrackingStore } from "@/server/infrastructure/supabase-delivery-tracking-store";

describe("Supabase delivery tracking store", () => {
  it("uses server-only transactional RPCs instead of the runtime document store", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { session_id: "11111111-1111-4111-8111-111111111111", created: true }, error: null });
    const store = new SupabaseDeliveryTrackingStore({ rpc } as never);

    const result = await store.startSession({
      session: {
        id: "11111111-1111-4111-8111-111111111111",
        deliveryJobId: "22222222-2222-4222-8222-222222222222",
        employeeId: "33333333-3333-4333-8333-333333333333",
        status: "active",
        startedAt: "2026-07-28T00:00:00.000Z",
        retentionPurgeAfter: "2026-10-26T00:00:00.000Z",
        points: []
      },
      event: { sessionId: "11111111-1111-4111-8111-111111111111", actorId: "44444444-4444-4444-8444-444444444444", action: "tracking_started", occurredAt: "2026-07-28T00:00:00.000Z", summary: "started" }
    });

    expect(result).toEqual({ sessionId: "11111111-1111-4111-8111-111111111111", created: true });
    expect(rpc).toHaveBeenCalledWith("delivery_tracking_start_session", expect.objectContaining({ p_delivery_job_id: "22222222-2222-4222-8222-222222222222" }));
  });
});
