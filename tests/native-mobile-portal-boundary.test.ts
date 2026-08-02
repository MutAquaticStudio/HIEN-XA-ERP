import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIdentityUserFromBearerRequest: vi.fn(),
  requireIdentityUser: vi.fn(),
  operationsActorForIdentity: vi.fn()
}));

vi.mock("@/server/identity/auth-context", () => ({
  getIdentityUserFromBearerRequest: mocks.getIdentityUserFromBearerRequest,
  requireIdentityUser: mocks.requireIdentityUser,
  operationsActorForIdentity: mocks.operationsActorForIdentity
}));

import { GET as customerCatalog } from "@/app/api/mobile/customer/catalog/route";
import { POST as submitDeliveryCompletion } from "@/app/api/mobile/delivery/completions/route";
import { POST as customerReceipt } from "@/app/api/mobile/customer/delivery-receipts/route";
import { POST as customerOrder } from "@/app/api/mobile/customer/orders/route";
import { POST as customerProof } from "@/app/api/mobile/customer/payment-proofs/route";
import { GET as portalOverview } from "@/app/api/mobile/portal/overview/route";
import { GET as messages, POST as sendMessage } from "@/app/api/mobile/communications/messages/route";
import { POST as supplierNotice } from "@/app/api/mobile/supplier/delivery-notices/route";
import { POST as supplierResponse } from "@/app/api/mobile/supplier/responses/route";
import { POST as claimWorkOrder } from "@/app/api/mobile/workforce/work-orders/claim/route";

describe("native partner and field routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIdentityUserFromBearerRequest.mockResolvedValue(undefined);
  });

  it("rejects every new native route with 401 before portal or command handling when Bearer is absent", async () => {
    const routes: Array<{ route: (request: Request) => Promise<Response>; request: Request }> = [
      { route: portalOverview, request: new Request("https://erp.example.test/api/mobile/portal/overview") },
      { route: customerCatalog, request: new Request("https://erp.example.test/api/mobile/customer/catalog") },
      { route: submitDeliveryCompletion, request: new Request("https://erp.example.test/api/mobile/delivery/completions", { method: "POST" }) },
      { route: customerOrder, request: new Request("https://erp.example.test/api/mobile/customer/orders", { method: "POST" }) },
      { route: customerProof, request: new Request("https://erp.example.test/api/mobile/customer/payment-proofs", { method: "POST" }) },
      { route: customerReceipt, request: new Request("https://erp.example.test/api/mobile/customer/delivery-receipts", { method: "POST" }) },
      { route: supplierResponse, request: new Request("https://erp.example.test/api/mobile/supplier/responses", { method: "POST" }) },
      { route: supplierNotice, request: new Request("https://erp.example.test/api/mobile/supplier/delivery-notices", { method: "POST" }) },
      { route: claimWorkOrder, request: new Request("https://erp.example.test/api/mobile/workforce/work-orders/claim", { method: "POST" }) },
      { route: messages, request: new Request("https://erp.example.test/api/mobile/communications/messages?partyType=customer") },
      { route: sendMessage, request: new Request("https://erp.example.test/api/mobile/communications/messages", { method: "POST" }) }
    ];

    for (const { route, request } of routes) {
      const response = await route(request);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ ok: false, error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
    }
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
  });
});
