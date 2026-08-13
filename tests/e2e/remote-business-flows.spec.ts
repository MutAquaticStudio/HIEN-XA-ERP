import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

type Identity = "OWNER" | "ACCOUNTANT" | "WAREHOUSE" | "DRIVER" | "DRIVER_B" | "WORKER" | "WORKER_B" | "CUSTOMER" | "CUSTOMER_B" | "SUPPLIER" | "SUPPLIER_B";
type FlowResult = { testId: string; status: "PASS" | "FAIL"; expected: string; actual: string; httpStatus?: number };

const flowResults: FlowResult[] = [];
const conflictResults: FlowResult[] = [];
const encodingResults: FlowResult[] = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test.afterEach(async ({}, info) => {
  const id = /TC-FLOW-\d{3}/.exec(info.title)?.[0];
  if (id) flowResults.push({ testId: id, status: info.status === "passed" ? "PASS" : "FAIL", expected: "Remote staging business contract passes", actual: info.status ?? "unknown" });
});

test.afterAll(() => {
  const evidencePath = process.env.QA_EVIDENCE_PATH;
  if (!evidencePath) throw new Error("QA_EVIDENCE_PATH is required for remote flow evidence.");
  mkdirSync(evidencePath, { recursive: true });
  const metadata = {
    finalWebRcSha: process.env.FINAL_WEB_RC_SHA ?? "uncommitted-local",
    cloudflareBuildId: process.env.CLOUDFLARE_BUILD_ID ?? "pending",
    workerVersion: process.env.CLOUDFLARE_WORKER_VERSION ?? "pending",
    timestamp: new Date().toISOString()
  };
  writeFileSync(join(evidencePath, "flow-uat-summary.json"), JSON.stringify({ ...metadata, results: flowResults }, null, 2), "utf8");
  writeFileSync(join(evidencePath, "conflict-409-412.json"), JSON.stringify({ ...metadata, results: conflictResults }, null, 2), "utf8");
  writeFileSync(join(evidencePath, "encoding-regression.json"), JSON.stringify({ ...metadata, results: encodingResults }, null, 2), "utf8");
});

test.beforeEach(async ({ request }) => resetFixture(request));

test("TC-FLOW-001 customer draft uses authoritative server pricing", async ({ request }) => {
  const customer = await token(request, "CUSTOMER");
  const response = await request.post("/api/mobile/customer/orders", { headers: customer, data: {
    idempotencyKey: key("flow-001"), deliveryAddress: "Điểm giao TC-FLOW-001", paymentMethod: "transfer",
    lines: [{ productUnitId: "uat-uxv2-product-unit", quantity: 2, unitPrice: 1, taxRate: 0 }]
  }});
  expect(response.status()).toBe(200);
  const overview = await body(request.get("/api/mobile/portal/overview", { headers: customer }));
  const order = overview.state.salesOrders.find((item: any) => item.deliveryAddress === "Điểm giao TC-FLOW-001");
  expect(order.lines[0]).toMatchObject({ unitPrice: 100_000, taxRate: 0.08, quantity: 2 });
});

test("TC-FLOW-002 historical order keeps its price snapshot", async ({ request }) => {
  const owner = await token(request, "OWNER");
  await ok(request.post("/api/mobile/sales", { headers: owner, data: { action: "createDraft", customerId: "uat-uxv2-customer", lines: [{ productUnitId: "uat-uxv2-product-unit", quantity: 1 }], idempotencyKey: key("flow-002-before") } }));
  const before = await body(request.get("/api/mobile/sales", { headers: owner }));
  const historical = before.orders.find((item: any) => item.documentNo !== "UAT-UXV2-SO-001" && item.customerId === "uat-uxv2-customer");
  expect(historical.lines[0].unitPrice).toBe(100_000);
  await fixtureControl(request, { action: "set_public_price", productUnitId: "uat-uxv2-product-unit", salePrice: 120_000, saleTaxRate: 0.08, reason: "Đổi giá để kiểm tra snapshot", idempotencyKey: key("flow-002-price") });
  const detail = await body(request.get(`/api/mobile/sales/${historical.id}`, { headers: owner }));
  expect(detail.order.lines[0].unitPrice).toBe(100_000);
  await ok(request.post("/api/mobile/sales", { headers: owner, data: { action: "createDraft", customerId: "uat-uxv2-customer", lines: [{ productUnitId: "uat-uxv2-product-unit", quantity: 1 }], idempotencyKey: key("flow-002-after") } }));
  const after = await body(request.get("/api/mobile/sales", { headers: owner }));
  expect(after.orders.some((item: any) => item.lines?.[0]?.unitPrice === 120_000)).toBe(true);
});

test("TC-FLOW-003 supplier and PO isolation", async ({ request }) => {
  const supplierA = await token(request, "SUPPLIER");
  const supplierB = await token(request, "SUPPLIER_B");
  const a = await body(request.get("/api/mobile/portal/overview", { headers: supplierA }));
  expect(JSON.stringify(a)).toContain("UAT-UXV2-PO-001");
  expect(JSON.stringify(a)).not.toContain("UAT-UXV2-PO-B-001");
  const cross = await request.post("/api/mobile/supplier/responses", { headers: supplierB, data: { purchaseOrderId: "uat-uxv2-purchase-order", status: "available", idempotencyKey: key("flow-003-cross") } });
  expect([403, 404]).toContain(cross.status());
  assertSafeError(await cross.text());
});

test("TC-FLOW-004 supplier response stays pending and does not post ledgers", async ({ request }) => {
  const supplier = await token(request, "SUPPLIER");
  const owner = await token(request, "OWNER");
  const before = await body(request.get("/api/mobile/portal/overview", { headers: owner }));
  const response = await request.post("/api/mobile/supplier/responses", { headers: supplier, data: { purchaseOrderId: "uat-uxv2-purchase-order", status: "available", proposedDeliveryDate: "2026-08-20", note: "Phản hồi TC-FLOW-004", idempotencyKey: key("flow-004") } });
  expect(response.status()).toBe(200);
  const after = await body(request.get("/api/mobile/portal/overview", { headers: owner }));
  expect(JSON.stringify(after)).toContain("Phản hồi TC-FLOW-004");
  expect(after.state.inventoryMovements).toHaveLength(before.state.inventoryMovements.length);
  expect(after.state.supplierLedgerEntries).toHaveLength(before.state.supplierLedgerEntries.length);
  expect(after.state.purchaseOrders.find((item: any) => item.id === "uat-uxv2-purchase-order").status).toBe("ordered");
});

test("TC-FLOW-005 driver assignment and deviation controls", async ({ request }) => {
  const driverA = await token(request, "DRIVER");
  const driverB = await token(request, "DRIVER_B");
  expect((await request.get("/api/mobile/delivery/overview?jobId=uat-uxv2-delivery-job", { headers: driverA })).status()).toBe(200);
  expect([403, 404]).toContain((await request.get("/api/mobile/delivery/overview?jobId=uat-uxv2-delivery-job", { headers: driverB })).status());
  const deviation = await request.post("/api/mobile/delivery/quantity-change", { headers: driverA, data: { deliveryJobId: "uat-uxv2-delivery-job", reason: "Thiếu hai bao khi giao thử", reportedLines: [{ lineId: "uat-uxv2-sales-line", quantity: 8 }], idempotencyKey: key("flow-005") } });
  expect(deviation.status()).toBe(200);
  const overview = await body(request.get("/api/mobile/delivery/overview?jobId=uat-uxv2-delivery-job", { headers: driverA }));
  expect(overview.jobs[0].lines[0].deliveredQuantity).toBe(0);
});

test("TC-FLOW-006 customer delivery confirmation keeps evidence private", async ({ request }) => {
  const customerA = await token(request, "CUSTOMER");
  const customerB = await token(request, "CUSTOMER_B");
  const cross = await request.post("/api/mobile/customer/delivery-receipts", { headers: customerB, multipart: { deliveryJobId: "uat-uxv2-delivery-job", idempotencyKey: key("flow-006-cross"), receiptImage: image() } });
  expect([403, 404]).toContain(cross.status());
  const own = await request.post("/api/mobile/customer/delivery-receipts", { headers: customerA, multipart: { deliveryJobId: "uat-uxv2-delivery-job", idempotencyKey: key("flow-006-own"), receiptImage: image() } });
  expect(own.status()).toBe(200);
  expect(await own.text()).not.toMatch(/https?:\/\//i);
  expect([403, 404]).toContain((await request.get("/api/mobile/attachments/d98741e8-4d11-4bdf-9ce2-0318c0a11001", { headers: customerB })).status());
});

test("TC-FLOW-007 accounting allocation enforces remaining balances", async ({ request }) => {
  const owner = await token(request, "OWNER");
  await ok(request.post("/api/mobile/receivables", { headers: owner, data: { action: "confirmPayment", paymentId: "uat-uxv2-customer-payment", confirm: true, idempotencyKey: key("flow-007-confirm") } }));
  await ok(request.post("/api/mobile/receivables", { headers: owner, data: { action: "allocatePayment", paymentId: "uat-uxv2-customer-payment", allocations: [{ ledgerEntryId: "uat-uxv2-customer-ledger-sale", amount: 200_000 }], confirm: true, idempotencyKey: key("flow-007-allocate") } }));
  const rejected = await request.post("/api/mobile/receivables", { headers: owner, data: { action: "allocatePayment", paymentId: "uat-uxv2-customer-payment", allocations: [{ ledgerEntryId: "uat-uxv2-customer-ledger-sale", amount: 100_000 }], confirm: true, idempotencyKey: key("flow-007-over") } });
  expect(rejected.status()).toBe(400);
  const overview = await body(request.get("/api/mobile/receivables", { headers: owner }));
  const payment = overview.payments.find((item: any) => item.id === "uat-uxv2-customer-payment");
  expect(payment.allocatedAmount).toBe(200_000);
  expect(payment.unallocatedAmount).toBe(50_000);
});

test("TC-FLOW-008 audit records mutation without secrets", async ({ request }) => {
  const supplier = await token(request, "SUPPLIER");
  const owner = await token(request, "OWNER");
  await ok(request.post("/api/mobile/supplier/responses", { headers: supplier, data: { purchaseOrderId: "uat-uxv2-purchase-order", status: "available", note: "Audit TC-FLOW-008", idempotencyKey: key("flow-008") } }));
  const audit = await body(request.get("/api/mobile/audit?query=submitSupplierPurchaseOrderResponse&limit=20", { headers: owner }));
  expect(audit.logs.length).toBeGreaterThan(0);
  const serialized = JSON.stringify(audit.logs);
  expect(serialized).not.toMatch(/password|token|cookie|session|secret|stack|sql/i);
});

test("TC-FLOW-009 concurrent worker claim has exactly one winner", async ({ request }) => {
  const workerA = await token(request, "WORKER");
  const workerB = await token(request, "WORKER_B");
  const payload = (suffix: string) => ({ workOrderId: "uat-uxv2-work-order-open", expectedVersion: 1, idempotencyKey: key(`flow-009-${suffix}`) });
  const [a, b] = await Promise.all([
    request.post("/api/mobile/workforce/work-orders/claim", { headers: workerA, data: payload("a") }),
    request.post("/api/mobile/workforce/work-orders/claim", { headers: workerB, data: payload("b") })
  ]);
  expect([a.status(), b.status()].sort()).toEqual([200, 412]);
  const loser = a.status() === 412 ? a : b;
  const error = await loser.json();
  expect(error).toMatchObject({ code: "STATE_CONFLICT", guidance: expect.any(String) });
  conflictResults.push({ testId: "HTTP-412", status: "PASS", expected: "One concurrent claimant receives a state conflict", actual: error.error, httpStatus: 412 });
});

test("TC-FLOW-010 idempotent retry creates one business document", async ({ request }) => {
  const customer = await token(request, "CUSTOMER");
  const payload = { idempotencyKey: key("flow-010"), deliveryAddress: "Điểm giao TC-FLOW-010", paymentMethod: "transfer", lines: [{ productUnitId: "uat-uxv2-product-unit", quantity: 1 }] };
  expect((await request.post("/api/mobile/customer/orders", { headers: customer, data: payload })).status()).toBe(200);
  expect((await request.post("/api/mobile/customer/orders", { headers: customer, data: payload })).status()).toBe(200);
  const overview = await body(request.get("/api/mobile/portal/overview", { headers: customer }));
  expect(overview.state.salesOrders.filter((item: any) => item.deliveryAddress === payload.deliveryAddress)).toHaveLength(1);
});

test("TC-FLOW-011 inventory count loads warehouse-scoped and zero-book lines", async ({ request }) => {
  const warehouse = await token(request, "WAREHOUSE");
  const session = await createCount(request, warehouse, "flow-011");
  expect(session.warehouseId).toBe("uat-uxv2-warehouse");
  expect(session.lines.some((line: any) => line.productUnitId === "uat-uxv2-product-out" && line.bookQuantity === 0)).toBe(true);
  expect(session.lines.every((line: any) => !String(line.productUnitId).includes("inactive"))).toBe(true);
});

test("TC-FLOW-012 discrepancy requires reason and private evidence", async ({ request }) => {
  const warehouse = await token(request, "WAREHOUSE");
  const session = await createCount(request, warehouse, "flow-012");
  const line = session.lines.find((item: any) => item.productUnitId === "uat-uxv2-product-unit");
  const invalid = await request.post("/api/mobile/inventory/count-sessions", { headers: warehouse, data: { action: "save_line", sessionId: session.id, lineId: line.id, countedQuantity: line.bookQuantity - 1, reason: "Thiếu một bao khi kiểm", expectedVersion: session.version, idempotencyKey: key("flow-012-invalid") } });
  expect(invalid.status()).toBe(400);
  const current = await countSession(request, warehouse, session.id);
  expect(current.version).toBe(session.version);
  expect(current.lines.find((item: any) => item.id === line.id).status).toBe("pending");
});

test("TC-FLOW-013 warehouse submits but cannot approve count", async ({ request }) => {
  const warehouse = await token(request, "WAREHOUSE");
  let session = await createCount(request, warehouse, "flow-013");
  session = await countAllEqual(request, warehouse, session, "flow-013");
  await ok(request.post("/api/mobile/inventory/count-sessions", { headers: warehouse, data: { action: "submit", sessionId: session.id, expectedVersion: session.version, idempotencyKey: key("flow-013-submit") } }));
  session = await countSession(request, warehouse, session.id);
  const approval = await request.post("/api/mobile/inventory/count-sessions", { headers: warehouse, data: { action: "approve", sessionId: session.id, expectedVersion: session.version, idempotencyKey: key("flow-013-approve") } });
  expect(approval.status()).toBe(403);
  expect((await countSession(request, warehouse, session.id)).status).toBe("submitted");
});

test("TC-FLOW-014 stale version is 409 and stock change forces recount", async ({ request }) => {
  const warehouse = await token(request, "WAREHOUSE");
  const owner = await token(request, "OWNER");
  let session = await createCount(request, warehouse, "flow-014");
  const originalVersion = session.version;
  const first = session.lines[0];
  await ok(request.post("/api/mobile/inventory/count-sessions", { headers: warehouse, data: { action: "save_line", sessionId: session.id, lineId: first.id, countedQuantity: first.bookQuantity, expectedVersion: originalVersion, idempotencyKey: key("flow-014-first") } }));
  const stale = await request.post("/api/mobile/inventory/count-sessions", { headers: warehouse, data: { action: "skip_line", sessionId: session.id, lineId: session.lines[1].id, expectedVersion: originalVersion, idempotencyKey: key("flow-014-stale") } });
  expect(stale.status()).toBe(409);
  const staleError = await stale.json();
  expect(staleError).toMatchObject({ code: "VERSION_CONFLICT", guidance: expect.any(String) });
  assertSafeError(JSON.stringify(staleError));
  conflictResults.push({ testId: "HTTP-409", status: "PASS", expected: "Stale inventory count version is rejected", actual: staleError.error, httpStatus: 409 });
  session = await countSession(request, warehouse, session.id);
  session = await countRemainingEqual(request, warehouse, session, "flow-014");
  await ok(request.post("/api/mobile/inventory/count-sessions", { headers: warehouse, data: { action: "submit", sessionId: session.id, expectedVersion: session.version, idempotencyKey: key("flow-014-submit") } }));
  session = await countSession(request, warehouse, session.id);
  await ok(request.post("/api/mobile/inventory/transfers", { headers: owner, data: { sourceWarehouseId: "uat-uxv2-warehouse", destinationWarehouseId: "uat-uxv2-warehouse-b", productUnitId: "uat-uxv2-product-unit", quantity: 1, reason: "Phát sinh trong lúc kiểm kê", idempotencyKey: key("flow-014-transfer") } }));
  await ok(request.post("/api/mobile/inventory/count-sessions", { headers: owner, data: { action: "approve", sessionId: session.id, expectedVersion: session.version, idempotencyKey: key("flow-014-owner") } }));
  expect((await countSession(request, owner, session.id)).status).toBe("needs_recount");
});

test("TC-FLOW-015 authorized approval posts one adjustment movement", async ({ request }) => {
  const { owner, session } = await postDiscrepantCount(request, "flow-015");
  expect(session.status).toBe("posted");
  const line = session.lines.find((item: any) => item.productUnitId === "uat-uxv2-product-unit");
  expect(line.postedMovementId).toBeTruthy();
  const inventory = await body(request.get("/api/mobile/inventory/overview", { headers: owner }));
  expect(inventory.stock.find((item: any) => item.warehouseId === "uat-uxv2-warehouse" && item.productUnitId === "uat-uxv2-product-unit").quantity).toBe(99);
});

test("TC-FLOW-016 reversal appends reverse movement and preserves history", async ({ request }) => {
  const { owner, session } = await postDiscrepantCount(request, "flow-016");
  const before = await body(request.get("/api/mobile/inventory/overview", { headers: owner }));
  await ok(request.post("/api/mobile/inventory/count-sessions", { headers: owner, data: { action: "reverse", sessionId: session.id, expectedVersion: session.version, reason: "Đảo phiếu kiểm thử hợp lệ", idempotencyKey: key("flow-016-reverse") } }));
  const reversed = await countSession(request, owner, session.id);
  const after = await body(request.get("/api/mobile/inventory/overview", { headers: owner }));
  expect(reversed.status).toBe("reversed");
  expect(after.movements.length).toBeGreaterThan(before.movements.length);
  expect(after.stock.find((item: any) => item.warehouseId === "uat-uxv2-warehouse" && item.productUnitId === "uat-uxv2-product-unit").quantity).toBe(100);
});

test("remote UTF-8 error contract remains valid Vietnamese", async ({ request }) => {
  const fixtureError = await request.post("/api/internal/integration/fixture", { data: {} });
  expect(fixtureError.status()).toBe(401);
  const fixtureText = await fixtureError.text();
  expect(fixtureText).toContain("Không có quyền");
  assertSafeError(fixtureText);
  const owner = await token(request, "OWNER");
  const malformed = await request.post("/api/mobile/inventory/count-sessions", { headers: owner, data: { action: "invalid" } });
  expect(malformed.status()).toBe(400);
  const mobileText = await malformed.text();
  expect(mobileText).toContain("Không thể cập nhật phiếu kiểm kê");
  assertSafeError(mobileText);
  encodingResults.push({ testId: "UAT-20260813-005", status: "PASS", expected: "Valid UTF-8 Vietnamese over real staging HTTP", actual: "Fixture 401 and mobile 400 contain valid Vietnamese", httpStatus: 400 });
});

async function resetFixture(request: APIRequestContext) {
  await fixtureControl(request, { action: "apply", credentials: Object.fromEntries(["OWNER","ACCOUNTANT","WAREHOUSE","DISPATCHER","DRIVER","WORKER","CUSTOMER","SUPPLIER","CUSTOMER_B","SUPPLIER_B","WORKER_B","DRIVER_B"].map((identity) => [identity, credential(identity as Identity)])) });
}

async function fixtureControl(request: APIRequestContext, data: unknown) {
  const secret = required("CLOUDFLARE_INTEGRATION_SECRET");
  const response = await request.post("/api/internal/integration/fixture", { headers: { "x-erp-integration-secret": secret }, data });
  expect(response.status(), await response.text()).toBe(200);
}

async function token(request: APIRequestContext, identity: Identity) {
  const response = await request.post("/api/mobile/auth/login", { data: { identifier: credential(identity).username, password: credential(identity).password } });
  expect(response.status()).toBe(200);
  const payload = await response.json();
  return { authorization: `Bearer ${payload.accessToken}` };
}

function credential(identity: Identity) { return { username: required(`E2E_${identity}_USERNAME`), password: required(`E2E_${identity}_PASSWORD`) }; }
function required(name: string) { const value = process.env[name]?.trim(); if (!value) throw new Error(`Missing ${name}`); return value; }
function key(name: string) { return `uat-uxv2-${name}-${Date.now()}`.slice(0, 127); }
function image() { return { name: "evidence.png", mimeType: "image/png", buffer: png }; }
async function body(promise: Promise<APIResponse>) { const response = await promise; expect(response.status(), await response.text()).toBe(200); return response.json(); }
async function ok(promise: Promise<APIResponse>) { const response = await promise; expect(response.status(), await response.text()).toBe(200); return response; }
function assertSafeError(text: string) { expect(text).not.toMatch(/(?:\u00c3[\u0080-\u00bf]|\u00c4[\u0080-\u00bf]|\u00c6[\u0080-\u00bf]|\ufffd)/u); expect(text).not.toMatch(/password|token|cookie|session|secret|stack|sql/i); }

async function countSession(request: APIRequestContext, headers: Record<string, string>, sessionId: string) {
  const payload = await body(request.get("/api/mobile/inventory/count-sessions", { headers }));
  const session = payload.sessions.find((item: any) => item.id === sessionId);
  expect(session).toBeTruthy();
  return session;
}

async function createCount(request: APIRequestContext, headers: Record<string, string>, suffix: string) {
  await ok(request.post("/api/mobile/inventory/count-sessions", { headers, data: { action: "create", warehouseId: "uat-uxv2-warehouse", idempotencyKey: key(`${suffix}-create`) } }));
  const payload = await body(request.get("/api/mobile/inventory/count-sessions", { headers }));
  return payload.sessions.find((item: any) => item.createdBy === "uat-uxv2-user-warehouse" && item.status === "draft");
}

async function countAllEqual(request: APIRequestContext, headers: Record<string, string>, initial: any, suffix: string) {
  let session = initial;
  for (const line of session.lines) {
    await ok(request.post("/api/mobile/inventory/count-sessions", { headers, data: { action: "save_line", sessionId: session.id, lineId: line.id, countedQuantity: line.bookQuantity, expectedVersion: session.version, idempotencyKey: key(`${suffix}-${line.id}`) } }));
    session = await countSession(request, headers, session.id);
  }
  return session;
}

async function countRemainingEqual(request: APIRequestContext, headers: Record<string, string>, initial: any, suffix: string) {
  let session = initial;
  for (const line of session.lines.filter((item: any) => item.status === "pending")) {
    await ok(request.post("/api/mobile/inventory/count-sessions", { headers, data: { action: "save_line", sessionId: session.id, lineId: line.id, countedQuantity: line.bookQuantity, expectedVersion: session.version, idempotencyKey: key(`${suffix}-${line.id}`) } }));
    session = await countSession(request, headers, session.id);
  }
  return session;
}

async function postDiscrepantCount(request: APIRequestContext, suffix: string) {
  const warehouse = await token(request, "WAREHOUSE");
  const owner = await token(request, "OWNER");
  let session = await createCount(request, warehouse, suffix);
  for (const line of session.lines) {
    if (line.productUnitId === "uat-uxv2-product-unit") {
      await ok(request.post("/api/mobile/inventory/count-sessions", { headers: warehouse, multipart: { action: "save_line", sessionId: session.id, lineId: line.id, countedQuantity: String(line.bookQuantity - 1), expectedVersion: String(session.version), reason: "Thiếu một bao có ảnh kiểm", idempotencyKey: key(`${suffix}-difference`), attachment: image() } }));
    } else {
      await ok(request.post("/api/mobile/inventory/count-sessions", { headers: warehouse, data: { action: "save_line", sessionId: session.id, lineId: line.id, countedQuantity: line.bookQuantity, expectedVersion: session.version, idempotencyKey: key(`${suffix}-${line.id}`) } }));
    }
    session = await countSession(request, warehouse, session.id);
  }
  await ok(request.post("/api/mobile/inventory/count-sessions", { headers: warehouse, data: { action: "submit", sessionId: session.id, expectedVersion: session.version, idempotencyKey: key(`${suffix}-submit`) } }));
  session = await countSession(request, owner, session.id);
  await ok(request.post("/api/mobile/inventory/count-sessions", { headers: owner, data: { action: "approve", sessionId: session.id, expectedVersion: session.version, idempotencyKey: key(`${suffix}-approve`) } }));
  return { owner, session: await countSession(request, owner, session.id) };
}
