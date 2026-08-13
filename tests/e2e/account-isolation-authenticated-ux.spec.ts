import { expect, test, type APIRequestContext } from "@playwright/test";

type IdentityName = "CUSTOMER" | "CUSTOMER_B" | "SUPPLIER" | "SUPPLIER_B" | "WORKER" | "WORKER_B" | "DRIVER" | "DRIVER_B";

function credential(identity: IdentityName) {
  const username = process.env[`E2E_${identity}_USERNAME`];
  const password = process.env[`E2E_${identity}_PASSWORD`];
  if (!username || !password) throw new Error(`Thiếu tài khoản E2E_${identity}; authenticated UAT không được phép skip.`);
  return { username, password };
}

async function mobileToken(request: APIRequestContext, identity: IdentityName) {
  const account = credential(identity);
  const response = await request.post("/api/mobile/auth/login", { data: { identifier: account.username, password: account.password } });
  expect(response.status()).toBe(200);
  const body = await response.json() as { accessToken?: string };
  expect(body.accessToken).toBeTruthy();
  return { authorization: `Bearer ${body.accessToken}` };
}

test.describe("cô lập dữ liệu theo tài khoản UAT", () => {
  test("khách A/B chỉ nhận đơn và thông tin của mình", async ({ request }) => {
    const customerA = await mobileToken(request, "CUSTOMER");
    const customerB = await mobileToken(request, "CUSTOMER_B");
    const overviewA = await request.get("/api/mobile/portal/overview", { headers: customerA });
    const overviewB = await request.get("/api/mobile/portal/overview", { headers: customerB });
    expect(overviewA.status()).toBe(200);
    expect(overviewB.status()).toBe(200);
    expect(JSON.stringify(await overviewA.json())).toContain("UAT-UXV2-SO-001");
    expect(JSON.stringify(await overviewA.json())).not.toContain("UAT-UXV2-SO-B-001");
    expect(JSON.stringify(await overviewB.json())).toContain("UAT-UXV2-SO-B-001");
    expect(JSON.stringify(await overviewB.json())).not.toContain("UAT-UXV2-SO-001");
    expect((await request.get("/api/mobile/attachments/d98741e8-4d11-4bdf-9ce2-0318c0a11001", { headers: customerA })).status()).toBe(200);
    expect([403, 404]).toContain((await request.get("/api/mobile/attachments/d98741e8-4d11-4bdf-9ce2-0318c0a11002", { headers: customerA })).status());
  });

  test("nhà cung cấp A/B chỉ nhận phiếu mua và thông tin của mình", async ({ request }) => {
    const supplierA = await mobileToken(request, "SUPPLIER");
    const supplierB = await mobileToken(request, "SUPPLIER_B");
    const overviewA = await request.get("/api/mobile/portal/overview", { headers: supplierA });
    const overviewB = await request.get("/api/mobile/portal/overview", { headers: supplierB });
    expect(overviewA.status()).toBe(200);
    expect(overviewB.status()).toBe(200);
    expect(JSON.stringify(await overviewA.json())).toContain("UAT-UXV2-PO-001");
    expect(JSON.stringify(await overviewA.json())).not.toContain("UAT-UXV2-PO-B-001");
    expect(JSON.stringify(await overviewB.json())).toContain("UAT-UXV2-PO-B-001");
    expect(JSON.stringify(await overviewB.json())).not.toContain("UAT-UXV2-PO-001");
    expect((await request.get("/api/mobile/attachments/d98741e8-4d11-4bdf-9ce2-0318c0a11003", { headers: supplierA })).status()).toBe(200);
    expect([403, 404]).toContain((await request.get("/api/mobile/attachments/d98741e8-4d11-4bdf-9ce2-0318c0a11004", { headers: supplierA })).status());
  });

  test("thợ A/B chỉ nhận công việc của mình và không thể nhận nhầm", async ({ request }, testInfo) => {
    const workerA = await mobileToken(request, "WORKER");
    const workerB = await mobileToken(request, "WORKER_B");
    const overviewA = await request.get("/api/mobile/workforce", { headers: workerA });
    const overviewB = await request.get("/api/mobile/workforce", { headers: workerB });
    expect(overviewA.status()).toBe(200);
    expect(overviewB.status()).toBe(200);
    expect(JSON.stringify(await overviewA.json())).toContain("UAT-UXV2-CV-001");
    expect(JSON.stringify(await overviewA.json())).not.toContain("UAT-UXV2-CV-B-001");
    expect(JSON.stringify(await overviewB.json())).toContain("UAT-UXV2-CV-B-001");
    expect(JSON.stringify(await overviewB.json())).not.toContain("UAT-UXV2-CV-001");
    const crossClaim = await request.post("/api/mobile/workforce/work-orders/claim", {
      headers: workerA,
      data: {
        workOrderId: "uat-uxv2-work-order-b",
        expectedVersion: 2,
        idempotencyKey: `uat-uxv2-worker-a-cross-claim-${testInfo.project.name}`
      }
    });
    expect(crossClaim.status()).toBe(412);
    await expect(crossClaim.json()).resolves.toMatchObject({
      ok: false,
      code: "STATE_CONFLICT"
    });
  });

  test("tài xế A/B chỉ nhận chuyến được phân công", async ({ request }) => {
    const driverA = await mobileToken(request, "DRIVER");
    const driverB = await mobileToken(request, "DRIVER_B");
    const overviewA = await request.get("/api/mobile/delivery/overview", { headers: driverA });
    const overviewB = await request.get("/api/mobile/delivery/overview", { headers: driverB });
    expect(overviewA.status()).toBe(200);
    expect(overviewB.status()).toBe(200);
    expect(JSON.stringify(await overviewA.json())).toContain("UAT-UXV2-GH-001");
    expect(JSON.stringify(await overviewA.json())).not.toContain("UAT-UXV2-GH-B-001");
    expect(JSON.stringify(await overviewB.json())).toContain("UAT-UXV2-GH-B-001");
    expect(JSON.stringify(await overviewB.json())).not.toContain("UAT-UXV2-GH-001");
  });
});
