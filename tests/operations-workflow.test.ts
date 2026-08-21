import { describe, expect, it } from "vitest";
import { runCreateCommand } from "../src/modules/operations/create-commands";
import { getOpenCustomerDebtObligations, getOpenSupplierDebtObligations } from "../src/modules/operations/debt-reconciliation";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { cashBalance, customerBalance, employeeBalance, stockBalance, supplierBalance } from "../src/modules/operations/selectors";
import { createOwnerActor, createRoleActor, runOperation } from "../src/modules/operations/commands";
import type { OperationName, OperationsState } from "../src/modules/operations/types";

const now = "2026-07-16T10:00:00.000+07:00";

function run(state: OperationsState, operation: OperationName, key: string = operation, targetId?: string) {
  return runOperation({
    state,
    operation,
    actor: createOwnerActor(),
    now,
    idempotencyKey: `test-${key}-12345`,
    targetId,
    options: testOperationOptions(operation)
  }).state;
}

function testOperationOptions(operation: OperationName) {
  if (operation === "completeDelivery") {
    return { recipientName: "Nguyễn Văn Nhận", evidence: "Biên bản giao nhận TEST-001" };
  }
  if (["failDelivery", "reverseInventoryMovement", "reverseDirectDelivery", "reverseCustomerPayment", "reverseSupplierPayment", "reverseCashVoucher", "reverseEmployeePayment", "reverseEmployeeAdvance"].includes(operation)) {
    return { reason: "Điều chỉnh chứng từ trong kiểm thử" };
  }
  return undefined;
}

function create(state: OperationsState, command: Parameters<typeof runCreateCommand>[0]["command"], key: string = command.type) {
  return runCreateCommand({
    state,
    command,
    actor: createOwnerActor(),
    now,
    idempotencyKey: `test-${key}-create-12345`
  }).state;
}

function configurePurchaseUnit(
  state: OperationsState,
  input: {
    name: string;
    productUnitId: string;
    conversionMode: "fixed" | "variable";
    factorToBase?: number;
  },
  key: string
) {
  const unitState = create(state, {
    type: "createUnitDefinition",
    name: input.name
  }, `${key}-unit`);
  const unit = unitState.unitDefinitions.at(-1);
  if (!unit) {
    throw new Error("Missing configured purchase unit.");
  }
  return create(unitState, {
    type: "upsertPurchaseUnitConversion",
    productUnitId: input.productUnitId,
    unitId: unit.id,
    conversionMode: input.conversionMode,
    factorToBase: input.factorToBase
  }, `${key}-conversion`);
}

describe("operations workflow", () => {
  it("runs the ERP flow end to end through append-only ledgers and movements", () => {
    let state = createInitialOperationsState();

    for (const operation of [
      "confirmSalesOrder",
      "allocateSalesSources",
      "postGoodsReceipt",
      "confirmDirectDelivery",
      "startDeliveryLoading",
      "dispatchDelivery",
      "completeDelivery",
      "confirmCustomerPayment",
      "allocateCustomerPayment",
      "confirmSupplierPayment",
      "approveWorkOutput",
      "postCompensation",
      "payEmployee",
      "resolveImportIssue"
    ] satisfies OperationName[]) {
      state = run(state, operation);
    }

    expect(state.salesOrders[0]?.status).toBe("delivered");
    expect(stockBalance(state, "wh-main", "pu-cement-bag")).toBe(0);
    expect(stockBalance(state, "wh-main", "pu-sand-m3")).toBe(0);
    expect(customerBalance(state.customerLedgerEntries, "cus-minh-anh")).toBe(6297200);
    expect(cashBalance(state)).toBe(1850000);
    expect(employeeBalance(state, "emp-worker-nam")).toBe(30000);
    expect(state.importIssues[0]?.status).toBe("resolved");
  });

  it("does not create warehouse movement for supplier direct delivery", () => {
    let state = createInitialOperationsState();
    state = run(state, "confirmSalesOrder");
    state = run(state, "allocateSalesSources");
    state = run(state, "confirmDirectDelivery");

    expect(state.inventoryMovements.some((movement) => movement.sourceDocument === "PO-2026-0002")).toBe(false);
    expect(state.customerLedgerEntries.some((entry) => entry.sourceDocument.includes("GIAO-THANG"))).toBe(true);
    expect(state.supplierLedgerEntries.some((entry) => entry.sourceDocument === "PO-2026-0002")).toBe(true);
  });

  it("reverses the latest direct delivery with linked receivable and payable entries", () => {
    let state = createInitialOperationsState();
    state = run(state, "confirmSalesOrder", "direct-reverse-confirm");
    state = run(state, "allocateSalesSources", "direct-reverse-allocate");
    state = run(state, "confirmDirectDelivery", "direct-reverse-post", "po-002-line-sand");
    state = run(state, "reverseDirectDelivery", "direct-reverse", "po-002-line-sand");

    expect(state.purchaseOrders[1]?.lines[0]?.receivedQuantity).toBe(0);
    expect(state.salesOrders[0]?.lines[1]?.deliveredQuantity).toBe(0);
    expect(customerBalance(state.customerLedgerEntries, "cus-minh-anh")).toBe(0);
    expect(supplierBalance(state.supplierLedgerEntries, "sup-cat-da-hai-an")).toBe(0);
    expect(state.inventoryMovements.some((movement) => movement.sourceDocument === "PO-2026-0002")).toBe(false);
    expect(state.auditLogs[0]?.reason).toContain("Điều chỉnh chứng từ");
  });

  it("blocks direct delivery reversal after its receivable has been allocated", () => {
    let state = createInitialOperationsState();
    state = run(state, "confirmSalesOrder", "direct-paid-confirm");
    state = run(state, "allocateSalesSources", "direct-paid-allocate");
    state = run(state, "confirmDirectDelivery", "direct-paid-post", "po-002-line-sand");
    state = run(state, "confirmCustomerPayment", "direct-paid-receipt", "cp-001");
    state = run(state, "allocateCustomerPayment", "direct-paid-allocation", "cp-001");

    expect(() => run(state, "reverseDirectDelivery", "direct-paid-reverse", "po-002-line-sand")).toThrow("phiếu thu");
  });

  it("requires loading and dispatch before completing a delivery and writes role-aware audit", () => {
    let state = createInitialOperationsState();
    state = run(state, "confirmSalesOrder", "delivery-state-confirm");
    state = run(state, "allocateSalesSources", "delivery-state-allocate");
    state = run(state, "postGoodsReceipt", "delivery-state-receipt");

    expect(() =>
      runOperation({
        state,
        operation: "completeDelivery",
        actor: createOwnerActor(),
        now,
        idempotencyKey: "delivery-too-early-12345",
        targetId: "dj-001"
      })
    ).toThrow("xuất bến");

    state = runOperation({
      state,
      operation: "startDeliveryLoading",
      actor: createRoleActor("dispatcher"),
      now,
      idempotencyKey: "delivery-loading-12345",
      targetId: "dj-001"
    }).state;

    expect(state.deliveryJobs[0]?.status).toBe("loading");
    expect(state.auditLogs[0]).toMatchObject({
      action: "startDeliveryLoading",
      actorRole: "dispatcher",
      permission: "delivery.start_loading",
      targetId: "dj-001"
    });

    state = runOperation({
      state,
      operation: "dispatchDelivery",
      actor: createRoleActor("driver"),
      now,
      idempotencyKey: "delivery-dispatch-12345",
      targetId: "dj-001"
    }).state;
    state = run(state, "completeDelivery", "delivery-state-complete", "dj-001");

    expect(state.deliveryJobs[0]?.status).toBe("delivered");
    expect(state.inventoryMovements.some((movement) => movement.postingKey === "issue-SO-2026-0001-so-001-line-cement")).toBe(true);
  });

  it("marks failed deliveries without inventory or receivable postings", () => {
    let state = createInitialOperationsState();
    state = run(state, "confirmSalesOrder", "failed-delivery-confirm");
    state = run(state, "allocateSalesSources", "failed-delivery-allocate");

    state = run(state, "failDelivery", "failed-delivery", "dj-001");

    expect(state.deliveryJobs[0]?.status).toBe("failed");
    expect(state.inventoryMovements.filter((movement) => movement.movementType === "issue")).toHaveLength(0);
    expect(state.customerLedgerEntries).toHaveLength(0);
  });

  it("lets users ignore warning import issues but not error import issues", () => {
    let state = createInitialOperationsState();

    state = run(state, "ignoreImportIssue", "ignore-warning", "imp-002");

    expect(state.importIssues.find((issue) => issue.id === "imp-002")?.status).toBe("ignored");
    expect(state.importIssues.find((issue) => issue.id === "imp-001")?.status).toBe("open");

    expect(() =>
      runOperation({
        state,
        operation: "ignoreImportIssue",
        actor: createOwnerActor(),
        now,
        idempotencyKey: "ignore-error-import-12345",
        targetId: "imp-001"
      })
    ).toThrow("Lỗi import");
  });

  it("enforces role permissions before mutating business state", () => {
    const state = createInitialOperationsState();

    expect(() =>
      runOperation({
        state,
        operation: "confirmSalesOrder",
        actor: createRoleActor("warehouse"),
        now,
        idempotencyKey: "warehouse-cannot-confirm-sales-12345"
      })
    ).toThrow("quyền");

    expect(state.salesOrders[0]?.status).toBe("draft");
    expect(createRoleActor("accountant").permissions).toContain("cash.confirm_receipt");
    expect(createRoleActor("accountant").permissions).not.toContain("sales.confirm");
    expect(createRoleActor("administrator").permissions).not.toContain("delivery.waive_customer_receipt");
    expect(createOwnerActor().permissions).toContain("delivery.waive_customer_receipt");
    expect(createRoleActor("administrator").permissions.length).toBeLessThan(createOwnerActor().permissions.length);
    expect(createRoleActor("viewer").permissions).toEqual([]);
    expect(() => runOperation({
      state,
      operation: "postInventoryTransfer",
      actor: createRoleActor("warehouse"),
      now,
      idempotencyKey: "warehouse-scope-transfer-12345",
      options: {
        sourceWarehouseId: "wh-main",
        destinationWarehouseId: "wh-yard",
        productUnitId: "pu-brick-vien",
        quantity: 10,
        reason: "Kiểm tra phạm vi kho"
      }
    })).toThrow("ngoài phạm vi");
  });

  it("allows one purchase order to split warehouse receipt and direct delivery lines", () => {
    let state = createInitialOperationsState();
    state.purchaseOrders = [
      {
        id: "po-split",
        documentNo: "PO-SPLIT",
        supplierId: "sup-hoang-thach",
        orderDate: "2026-07-16",
        status: "ordered",
        lines: [
          {
            id: "po-split-line-cement",
            productUnitId: "pu-cement-bag",
            orderedQuantity: 120,
            receivedQuantity: 0,
            unitCost: 76000,
            taxRate: 0.08,
            destinationType: "warehouse",
            warehouseId: "wh-main"
          },
          {
            id: "po-split-line-sand",
            productUnitId: "pu-sand-m3",
            orderedQuantity: 18,
            receivedQuantity: 0,
            unitCost: 190000,
            taxRate: 0.08,
            destinationType: "customer_direct",
            customerId: "cus-minh-anh",
            salesOrderLineId: "so-001-line-sand"
          }
        ]
      }
    ];

    state = run(state, "confirmSalesOrder", "split-confirm");
    state = run(state, "allocateSalesSources", "split-allocate");
    state = run(state, "postGoodsReceipt", "split-receipt", "po-split-line-cement");
    state = run(state, "confirmDirectDelivery", "split-direct", "po-split-line-sand");

    const splitOrder = state.purchaseOrders[0];

    expect(splitOrder?.status).toBe("fully_received");
    expect(splitOrder?.lines[0]?.receivedQuantity).toBe(120);
    expect(splitOrder?.lines[1]?.receivedQuantity).toBe(18);
    expect(state.inventoryMovements.some((movement) => movement.postingKey === "receipt-po-split-line-cement")).toBe(true);
    expect(state.inventoryMovements.some((movement) => movement.postingKey === "receipt-po-split-line-sand")).toBe(false);
    expect(state.customerLedgerEntries.some((entry) => entry.sourceDocument.includes("GIAO-THANG"))).toBe(true);
  });

  it("does not duplicate inventory movements when retried with the same idempotency key", () => {
    let state = createInitialOperationsState();
    state = run(state, "confirmSalesOrder");
    state = run(state, "allocateSalesSources");

    const first = runOperation({
      state,
      operation: "postGoodsReceipt",
      actor: createOwnerActor(),
      now,
      idempotencyKey: "same-receipt-key-12345"
    });
    const second = runOperation({
      state: first.state,
      operation: "postGoodsReceipt",
      actor: createOwnerActor(),
      now,
      idempotencyKey: "same-receipt-key-12345"
    });

    expect(second.state.inventoryMovements.filter((movement) => movement.postingKey === "receipt-po-001-line-cement")).toHaveLength(1);
    expect(second.severity).toBe("warning");
  });

  it("reverses a warehouse receipt with an opposite movement and payable entry", () => {
    let state = createInitialOperationsState();

    state = run(state, "postGoodsReceipt", "receipt-before-reversal");
    const receipt = state.inventoryMovements.find((movement) => movement.postingKey === "receipt-po-001-line-cement");

    expect(receipt).toBeDefined();
    expect(stockBalance(state, "wh-main", "pu-cement-bag")).toBe(120);
    expect(supplierBalance(state.supplierLedgerEntries, "sup-hoang-thach")).toBe(9849600);

    state = run(state, "reverseInventoryMovement", "reverse-receipt", receipt?.id);

    expect(stockBalance(state, "wh-main", "pu-cement-bag")).toBe(0);
    expect(supplierBalance(state.supplierLedgerEntries, "sup-hoang-thach")).toBe(0);
    expect(state.purchaseOrders[0]?.status).toBe("ordered");
    expect(state.purchaseOrders[0]?.lines[0]?.receivedQuantity).toBe(0);
    expect(state.inventoryMovements.find((movement) => movement.id === receipt?.id)?.reversedById).toBeDefined();
    expect(state.inventoryMovements.at(-1)).toMatchObject({
      movementType: "reverse",
      postingKey: `reverse-${receipt?.id}`,
      quantity: -120
    });
    expect(state.supplierLedgerEntries.at(-1)).toMatchObject({
      direction: "debit",
      amount: 9849600
    });
  });

  it("blocks reversing the exact receipt obligation after a supplier payment was allocated to it", () => {
    let state = createInitialOperationsState();
    state = run(state, "postGoodsReceipt", "exact-receipt-post");
    const receipt = state.inventoryMovements.find((movement) => movement.postingKey === "receipt-po-001-line-cement");
    const payable = state.supplierLedgerEntries.find((entry) => entry.postingGroupId === receipt?.postingKey);
    state.supplierLedgerEntries.push({
      id: "sl-other-obligation",
      supplierId: "sup-hoang-thach",
      sourceDocument: "PO-OTHER",
      direction: "credit",
      amount: 1000000,
      postingDate: now
    });
    state.supplierPayments = [{
      id: "sp-exact-receipt",
      documentNo: "PC-EXACT",
      supplierId: "sup-hoang-thach",
      amount: 1000000,
      status: "draft",
      allocations: []
    }];
    state.cashTransactions.push({
      id: "cash-exact-receipt",
      accountName: "Tiền mặt cửa hàng",
      sourceDocument: "OPEN-EXACT",
      direction: "in",
      amount: 1000000,
      postedAt: now
    });
    state = run(state, "confirmSupplierPayment", "exact-receipt-payment-confirm", "sp-exact-receipt");
    state = runOperation({
      state,
      operation: "allocateSupplierPayment",
      actor: createOwnerActor(),
      now,
      idempotencyKey: "test-exact-receipt-payment-allocate-12345",
      targetId: "sp-exact-receipt",
      options: { allocations: [{ ledgerEntryId: payable?.id ?? "", amount: 1000000 }] }
    }).state;

    expect(supplierBalance(state.supplierLedgerEntries, "sup-hoang-thach")).toBe(9849600);
    expect(() => run(state, "reverseInventoryMovement", "exact-receipt-reverse-blocked", receipt?.id)).toThrow("phiếu chi nhà cung cấp");

    state = run(state, "reverseSupplierPayment", "exact-receipt-payment-reverse", "sp-exact-receipt");
    state = run(state, "reverseInventoryMovement", "exact-receipt-reverse", receipt?.id);
    expect(getOpenSupplierDebtObligations(state).map((item) => item.ledgerEntryId)).toEqual(["sl-other-obligation"]);
  });

  it("reverses a warehouse issue with an opposite movement and receivable entry", () => {
    let state = createInitialOperationsState();
    state = run(state, "confirmSalesOrder", "issue-reversal-confirm");
    state = run(state, "allocateSalesSources", "issue-reversal-allocate");
    state = run(state, "postGoodsReceipt", "issue-reversal-receipt");
    state = run(state, "startDeliveryLoading", "issue-reversal-loading");
    state = run(state, "dispatchDelivery", "issue-reversal-dispatch");
    state = run(state, "completeDelivery", "issue-reversal-delivery");

    const issue = state.inventoryMovements.find((movement) => movement.postingKey === "issue-SO-2026-0001-so-001-line-cement");

    expect(issue).toBeDefined();
    expect(stockBalance(state, "wh-main", "pu-cement-bag")).toBe(0);
    expect(customerBalance(state.customerLedgerEntries, "cus-minh-anh")).toBe(11534400);

    state = run(state, "reverseInventoryMovement", "reverse-issue", issue?.id);

    expect(stockBalance(state, "wh-main", "pu-cement-bag")).toBe(120);
    expect(customerBalance(state.customerLedgerEntries, "cus-minh-anh")).toBe(0);
    expect(state.salesOrders[0]?.status).toBe("allocated");
    expect(state.salesOrders[0]?.lines[0]?.deliveredQuantity).toBe(0);
    expect(state.customerLedgerEntries.at(-1)).toMatchObject({
      direction: "credit",
      amount: 11534400
    });
    expect(getOpenCustomerDebtObligations(state)).toEqual([]);
  });

  it("blocks inventory reversals that would create negative stock or reverse allocated receivables", () => {
    let state = createInitialOperationsState();
    state = run(state, "confirmSalesOrder", "blocked-inventory-confirm");
    state = run(state, "allocateSalesSources", "blocked-inventory-allocate");
    state = run(state, "postGoodsReceipt", "blocked-inventory-receipt");
    state = run(state, "startDeliveryLoading", "blocked-inventory-loading");
    state = run(state, "dispatchDelivery", "blocked-inventory-dispatch");
    state = run(state, "completeDelivery", "blocked-inventory-delivery");

    const receipt = state.inventoryMovements.find((movement) => movement.postingKey === "receipt-po-001-line-cement");
    const issue = state.inventoryMovements.find((movement) => movement.postingKey === "issue-SO-2026-0001-so-001-line-cement");

    expect(() =>
      runOperation({
        state,
        operation: "reverseInventoryMovement",
        actor: createOwnerActor(),
        now,
        idempotencyKey: "blocked-receipt-reversal-12345",
        targetId: receipt?.id,
        options: { reason: "Kiểm tra chặn đảo nhập kho" }
      })
    ).toThrow("âm tồn");

    state = run(state, "confirmDirectDelivery", "blocked-inventory-direct");
    state = run(state, "confirmCustomerPayment", "blocked-inventory-payment");
    state = run(state, "allocateCustomerPayment", "blocked-inventory-allocation");

    expect(() =>
      runOperation({
        state,
        operation: "reverseInventoryMovement",
        actor: createOwnerActor(),
        now,
        idempotencyKey: "blocked-issue-reversal-12345",
        targetId: issue?.id,
        options: { reason: "Kiểm tra chặn đảo xuất kho" }
      })
    ).toThrow("phiếu thu");
  });

  it("keeps customer payment allocation within the confirmed payment amount", () => {
    let state = createInitialOperationsState();
    for (const operation of [
      "confirmSalesOrder",
      "allocateSalesSources",
      "postGoodsReceipt",
      "confirmDirectDelivery",
      "startDeliveryLoading",
      "dispatchDelivery",
      "completeDelivery",
      "confirmCustomerPayment",
      "allocateCustomerPayment"
    ] satisfies OperationName[]) {
      state = run(state, operation);
    }

    const payment = state.customerPayments[0];
    const allocated = payment?.allocations.reduce((sum, allocation) => sum + allocation.amount, 0) ?? 0;

    expect(payment?.status).toBe("allocated");
    expect(allocated).toBeLessThanOrEqual(payment?.amount ?? 0);
    expect(allocated).toBe(10000000);
  });

  it("reverses an allocated customer receipt and frees the receivable for a replacement receipt", () => {
    let state = createInitialOperationsState();
    for (const operation of [
      "confirmSalesOrder",
      "allocateSalesSources",
      "postGoodsReceipt",
      "confirmDirectDelivery",
      "startDeliveryLoading",
      "dispatchDelivery",
      "completeDelivery",
      "confirmCustomerPayment",
      "allocateCustomerPayment"
    ] satisfies OperationName[]) {
      state = run(state, operation, `customer-reversal-${operation}`);
    }

    expect(customerBalance(state.customerLedgerEntries, "cus-minh-anh")).toBe(6297200);

    state = run(state, "reverseCustomerPayment", "reverse-customer-receipt", "cp-001");

    expect(state.customerPayments[0]?.status).toBe("reversed");
    expect(customerBalance(state.customerLedgerEntries, "cus-minh-anh")).toBe(16297200);
    expect(cashBalance(state)).toBe(0);
    expect(state.customerLedgerEntries.at(-1)).toMatchObject({
      sourceDocument: "REV-PT-2026-0001",
      direction: "debit",
      amount: 10000000
    });

    state = create(
      state,
      {
        type: "createCustomerPaymentDraft",
        customerId: "cus-minh-anh",
        amount: 10000000
      },
      "replacement-customer-receipt"
    );
    const replacementId = state.customerPayments.at(-1)?.id;

    state = run(state, "confirmCustomerPayment", "confirm-replacement-receipt", replacementId);
    state = run(state, "allocateCustomerPayment", "allocate-replacement-receipt", replacementId);

    const replacement = state.customerPayments.find((payment) => payment.id === replacementId);

    expect(replacement?.status).toBe("allocated");
    expect(replacement?.allocations.reduce((sum, allocation) => sum + allocation.amount, 0)).toBe(10000000);
    expect(customerBalance(state.customerLedgerEntries, "cus-minh-anh")).toBe(6297200);
  });

  it("reverses supplier payments with an opposite cash and payable entry", () => {
    let state = createInitialOperationsState();
    state.cashTransactions.push({
      id: "cash-supplier-opening",
      accountName: "Tiền mặt cửa hàng",
      sourceDocument: "OPEN-CASH-SUPPLIER-TEST",
      direction: "in",
      amount: 8000000,
      postedAt: now
    });

    state = run(state, "postGoodsReceipt", "supplier-reversal-receipt");
    state = run(state, "confirmSupplierPayment", "supplier-reversal-confirm", "sp-001");

    expect(state.supplierPayments[0]?.status).toBe("confirmed");
    expect(supplierBalance(state.supplierLedgerEntries, "sup-hoang-thach")).toBe(1849600);
    expect(cashBalance(state)).toBe(0);

    state = run(state, "reverseSupplierPayment", "supplier-reversal", "sp-001");

    expect(state.supplierPayments[0]?.status).toBe("reversed");
    expect(supplierBalance(state.supplierLedgerEntries, "sup-hoang-thach")).toBe(9849600);
    expect(cashBalance(state)).toBe(8000000);
    expect(state.supplierLedgerEntries.at(-1)).toMatchObject({
      sourceDocument: "REV-PC-NCC-2026-0001",
      direction: "credit",
      amount: 8000000
    });
  });

  it("blocks supplier payment when the cash account cannot cover it", () => {
    let state = createInitialOperationsState();
    state = run(state, "postGoodsReceipt", "supplier-insufficient-cash-receipt");

    expect(() => run(state, "confirmSupplierPayment", "supplier-insufficient-cash", "sp-001")).toThrow("Quỹ tiền mặt không đủ");
    expect(state.supplierPayments[0]?.status).toBe("draft");
    expect(cashBalance(state)).toBe(0);
  });

  it("reverses employee payments without changing posted compensation", () => {
    let state = createInitialOperationsState();
    state.cashTransactions.push({
      id: "cash-test-opening",
      accountName: "Tiền mặt cửa hàng",
      sourceDocument: "OPEN-CASH-TEST",
      direction: "in",
      amount: 200000,
      postedAt: now
    });

    state = run(state, "approveWorkOutput", "employee-reversal-approve");
    state = run(state, "postCompensation", "employee-reversal-compensation");
    state = run(state, "payEmployee", "employee-reversal-pay", "ep-001");

    expect(state.employeePayments[0]?.status).toBe("confirmed");
    expect(employeeBalance(state, "emp-worker-nam")).toBe(30000);
    expect(cashBalance(state)).toBe(50000);

    state = run(state, "reverseEmployeePayment", "employee-reversal", "ep-001");

    expect(state.employeePayments[0]?.status).toBe("reversed");
    expect(state.compensationBatches[0]?.status).toBe("posted");
    expect(employeeBalance(state, "emp-worker-nam")).toBe(180000);
    expect(cashBalance(state)).toBe(200000);
    expect(state.employeeLedgerEntries.at(-1)).toMatchObject({
      sourceDocument: "REV-PC-NV-2026-0001",
      direction: "credit",
      amount: 150000
    });
  });

  it("confirms and reverses employee advances through cash and employee ledgers", () => {
    let state = createInitialOperationsState();
    state.cashTransactions.push({
      id: "cash-advance-opening",
      accountName: "Tiền mặt cửa hàng",
      sourceDocument: "OPEN-CASH-ADVANCE-TEST",
      direction: "in",
      amount: 500000,
      postedAt: now
    });
    state = create(state, {
      type: "createEmployeeAdvanceDraft",
      employeeId: "emp-worker-nam",
      purpose: "Mua dụng cụ công trình",
      amount: 200000
    }, "employee-advance");
    const advanceId = state.employeeAdvances.at(-1)?.id;

    state = run(state, "confirmEmployeeAdvance", "employee-advance-confirm", advanceId);
    expect(state.employeeAdvances.at(-1)?.status).toBe("confirmed");
    expect(cashBalance(state)).toBe(300000);
    expect(employeeBalance(state, "emp-worker-nam")).toBe(-200000);

    state = run(state, "reverseEmployeeAdvance", "employee-advance-reverse", advanceId);
    expect(state.employeeAdvances.at(-1)?.status).toBe("reversed");
    expect(cashBalance(state)).toBe(500000);
    expect(employeeBalance(state, "emp-worker-nam")).toBe(0);
  });

  it("blocks employee advances when cash is insufficient", () => {
    let state = createInitialOperationsState();
    state = create(state, {
      type: "createEmployeeAdvanceDraft",
      employeeId: "emp-worker-nam",
      purpose: "Tạm ứng đi công trình",
      amount: 200000
    }, "employee-advance-no-cash");

    expect(() => run(state, "confirmEmployeeAdvance", "employee-advance-no-cash-confirm", state.employeeAdvances.at(-1)?.id)).toThrow("không đủ");
  });

  it("requires approved output and splits compensation exactly across participants", () => {
    let state = createInitialOperationsState();

    expect(() =>
      runOperation({
        state,
        operation: "postCompensation",
        actor: createOwnerActor(),
        now,
        idempotencyKey: "post-comp-too-early"
      })
    ).toThrow("sản lượng được duyệt");

    state = run(state, "approveWorkOutput");
    state = run(state, "postCompensation");

    const batch = state.compensationBatches[0];
    const totalShare = batch?.lines.reduce((sum, line) => sum + line.amount, 0);

    expect(batch?.status).toBe("posted");
    expect(totalShare).toBe(batch?.totalAmount);
    expect(batch?.lines).toHaveLength(2);
  });

  it("continues the workflow for newly created documents after the seeded demo order", () => {
    let state = createInitialOperationsState();

    for (const operation of [
      "confirmSalesOrder",
      "allocateSalesSources",
      "postGoodsReceipt",
      "confirmDirectDelivery",
      "startDeliveryLoading",
      "dispatchDelivery",
      "completeDelivery"
    ] satisfies OperationName[]) {
      state = run(state, operation, `seed-${operation}`);
    }

    state = create(
      state,
      {
        type: "createSalesOrderDraft",
        customerId: "cus-tuan-lai",
        productUnitId: "pu-brick-vien",
        quantity: 100,
        unitPrice: 1600,
        taxRate: 0.08
      },
      "second-sales-order"
    );
    state = run(state, "confirmSalesOrder", "second-confirm");
    state = run(state, "allocateSalesSources", "second-allocate");
    state = create(
      state,
      {
        type: "createDeliveryJob",
        salesOrderId: state.salesOrders.at(-1)?.id ?? "",
        driverId: "emp-driver-dung",
        vehicleId: "vehicle-truck-01",
        plannedDate: "2026-07-16"
      },
      "second-delivery"
    );
    state = run(state, "startDeliveryLoading", "second-loading");
    state = run(state, "dispatchDelivery", "second-dispatch");
    state = run(state, "completeDelivery", "second-complete");

    const secondOrder = state.salesOrders.at(-1);

    expect(secondOrder?.status).toBe("delivered");
    expect(secondOrder?.lines[0]?.sourceType).toBe("warehouse");
    expect(stockBalance(state, "wh-main", "pu-brick-vien")).toBe(9900);
    expect(state.customerLedgerEntries.some((entry) => entry.customerId === "cus-tuan-lai" && entry.sourceDocument.includes("GIAO-KHO"))).toBe(true);
  });

  it("runs row-targeted sales operations on the selected sales order", () => {
    let state = createInitialOperationsState();
    const seededOrderId = state.salesOrders[0]?.id;

    state = create(
      state,
      {
        type: "createSalesOrderDraft",
        customerId: "cus-tuan-lai",
        productUnitId: "pu-brick-vien",
        quantity: 100,
        unitPrice: 1600,
        taxRate: 0.08
      },
      "targeted-sales-order"
    );

    const targetedOrderId = state.salesOrders.at(-1)?.id;
    state = run(state, "confirmSalesOrder", "targeted-confirm", targetedOrderId);

    expect(state.salesOrders.find((order) => order.id === targetedOrderId)?.status).toBe("confirmed");
    expect(state.salesOrders.find((order) => order.id === seededOrderId)?.status).toBe("draft");

    state = run(state, "allocateSalesSources", "targeted-allocate", targetedOrderId);

    expect(state.salesOrders.find((order) => order.id === targetedOrderId)?.status).toBe("allocated");
    expect(state.salesOrders.find((order) => order.id === targetedOrderId)?.lines[0]?.sourceType).toBe("warehouse");
    expect(state.salesOrders.find((order) => order.id === seededOrderId)?.status).toBe("draft");
  });

  it("runs row-targeted purchase receipt on the selected purchase line", () => {
    let state = createInitialOperationsState();
    state.purchaseOrders = [
      {
        id: "po-target-a",
        documentNo: "PO-TARGET-A",
        supplierId: "sup-hoang-thach",
        orderDate: "2026-07-16",
        status: "ordered",
        lines: [
          {
            id: "po-target-a-line",
            productUnitId: "pu-cement-bag",
            orderedQuantity: 5,
            receivedQuantity: 0,
            unitCost: 76000,
            taxRate: 0.08,
            destinationType: "warehouse",
            warehouseId: "wh-main"
          }
        ]
      },
      {
        id: "po-target-b",
        documentNo: "PO-TARGET-B",
        supplierId: "sup-hoang-thach",
        orderDate: "2026-07-16",
        status: "ordered",
        lines: [
          {
            id: "po-target-b-line",
            productUnitId: "pu-brick-vien",
            orderedQuantity: 9,
            receivedQuantity: 0,
            unitCost: 1100,
            taxRate: 0.08,
            destinationType: "warehouse",
            warehouseId: "wh-main"
          }
        ]
      }
    ];

    state = run(state, "postGoodsReceipt", "targeted-purchase-receipt", "po-target-b-line");

    expect(state.purchaseOrders[0]?.lines[0]?.receivedQuantity).toBe(0);
    expect(state.purchaseOrders[1]?.lines[0]?.receivedQuantity).toBe(9);
    expect(state.inventoryMovements.some((movement) => movement.postingKey === "receipt-po-target-b-line")).toBe(true);
  });

  it("runs row-targeted customer payment confirmation and allocation", () => {
    let state = createInitialOperationsState();
    state.customerLedgerEntries = [
      {
        id: "cle-target-a",
        customerId: "cus-minh-anh",
        sourceDocument: "SO-A:GIAO-KHO",
        direction: "debit",
        amount: 1000,
        postingDate: now
      },
      {
        id: "cle-target-b",
        customerId: "cus-tuan-lai",
        sourceDocument: "SO-B:GIAO-KHO",
        direction: "debit",
        amount: 2000,
        postingDate: now
      }
    ];
    state.customerPayments = [
      {
        id: "cp-target-a",
        documentNo: "PT-TARGET-A",
        customerId: "cus-minh-anh",
        amount: 600,
        status: "draft",
        allocations: []
      },
      {
        id: "cp-target-b",
        documentNo: "PT-TARGET-B",
        customerId: "cus-tuan-lai",
        amount: 800,
        status: "draft",
        allocations: []
      }
    ];

    state = run(state, "confirmCustomerPayment", "targeted-customer-payment-confirm", "cp-target-b");

    expect(state.customerPayments[0]?.status).toBe("draft");
    expect(state.customerPayments[1]?.status).toBe("confirmed");

    state = run(state, "allocateCustomerPayment", "targeted-customer-payment-allocate", "cp-target-b");

    expect(state.customerPayments[0]?.allocations).toEqual([]);
    expect(state.customerPayments[1]?.status).toBe("allocated");
    expect(state.customerPayments[1]?.allocations).toEqual([{ ledgerEntryId: "cle-target-b", amount: 800 }]);
  });

  it("runs row-targeted supplier payment, work approval, and import resolution", () => {
    let state = createInitialOperationsState();
    state.cashTransactions.push({
      id: "cash-targeted-opening",
      accountName: "Tiền mặt cửa hàng",
      sourceDocument: "OPEN-CASH-TARGETED-TEST",
      direction: "in",
      amount: 1000,
      postedAt: now
    });
    state.supplierLedgerEntries = [
      {
        id: "sle-target-a",
        supplierId: "sup-hoang-thach",
        sourceDocument: "PO-A",
        direction: "credit",
        amount: 1000,
        postingDate: now
      },
      {
        id: "sle-target-b",
        supplierId: "sup-cat-da-hai-an",
        sourceDocument: "PO-B",
        direction: "credit",
        amount: 2000,
        postingDate: now
      }
    ];
    state.supplierPayments = [
      {
        id: "sp-target-a",
        documentNo: "PC-TARGET-A",
        supplierId: "sup-hoang-thach",
        amount: 500,
        status: "draft",
        allocations: []
      },
      {
        id: "sp-target-b",
        documentNo: "PC-TARGET-B",
        supplierId: "sup-cat-da-hai-an",
        amount: 700,
        status: "draft",
        allocations: []
      }
    ];
    state.workOrders = [
      {
        id: "wo-target-a",
        documentNo: "CV-TARGET-A",
        sourceDocument: "GH-A",
        workType: "Boc xep",
        workDate: "2026-07-16",
        status: "submitted",
        outputs: [
          {
            id: "wo-target-a-output",
            productUnitId: "pu-brick-vien",
            actualQuantity: 100,
            approvedQuantity: 0,
            status: "submitted"
          }
        ],
        participants: [{ employeeId: "emp-worker-nam", shareFactor: 1 }]
      },
      {
        id: "wo-target-b",
        documentNo: "CV-TARGET-B",
        sourceDocument: "GH-B",
        workType: "Boc xep",
        workDate: "2026-07-16",
        status: "submitted",
        outputs: [
          {
            id: "wo-target-b-output",
            productUnitId: "pu-brick-vien",
            actualQuantity: 200,
            approvedQuantity: 0,
            status: "submitted"
          }
        ],
        participants: [{ employeeId: "emp-worker-hai", shareFactor: 1 }]
      }
    ];
    state.importIssues = [
      {
        id: "imp-target-a",
        sourceSheet: "7.26",
        rowNumber: 1,
        severity: "warning",
        message: "A",
        status: "open"
      },
      {
        id: "imp-target-b",
        sourceSheet: "7.26",
        rowNumber: 2,
        severity: "error",
        message: "B",
        status: "open"
      }
    ];

    state = run(state, "confirmSupplierPayment", "targeted-supplier-payment", "sp-target-b");
    state = run(state, "approveWorkOutput", "targeted-work-approval", "wo-target-b");
    state = run(state, "resolveImportIssue", "targeted-import-issue", "imp-target-b");

    expect(state.supplierPayments[0]?.status).toBe("draft");
    expect(state.supplierPayments[1]?.status).toBe("confirmed");
    expect(state.workOrders[0]?.status).toBe("submitted");
    expect(state.workOrders[1]?.status).toBe("approved");
    expect(state.importIssues[0]?.status).toBe("open");
    expect(state.importIssues[1]?.status).toBe("resolved");
  });

  it("posts goods receipts in multiple append-only installments", () => {
    let state = createInitialOperationsState();
    state = runOperation({
      state,
      operation: "postGoodsReceipt",
      actor: createOwnerActor(),
      now,
      idempotencyKey: "partial-receipt-first-12345",
      targetId: "po-001-line-cement",
      options: { quantity: 40 }
    }).state;

    expect(state.purchaseOrders[0]?.status).toBe("partially_received");
    expect(state.purchaseOrders[0]?.lines[0]?.receivedQuantity).toBe(40);
    expect(stockBalance(state, "wh-main", "pu-cement-bag")).toBe(40);

    state = runOperation({
      state,
      operation: "postGoodsReceipt",
      actor: createOwnerActor(),
      now,
      idempotencyKey: "partial-receipt-second-12345",
      targetId: "po-001-line-cement",
      options: { quantity: 80 }
    }).state;

    expect(state.purchaseOrders[0]?.status).toBe("fully_received");
    expect(state.inventoryMovements.filter((movement) => movement.sourceLineId === "po-001-line-cement")).toHaveLength(2);
    expect(state.inventoryMovements.map((movement) => movement.postingKey)).toContain("receipt-po-001-line-cement-2");
    expect(supplierBalance(state.supplierLedgerEntries, "sup-hoang-thach")).toBe(9849600);
  });

  it("blocks posting a draft purchase order until it is confirmed", () => {
  const setupState = configurePurchaseUnit(createInitialOperationsState(), {
    name: "Xe",
    productUnitId: "pu-brick-vien",
    conversionMode: "fixed",
    factorToBase: 1
  }, "draft-purchase-state");
  let state = create(setupState, {
    type: "createPurchaseOrderDraft",
    supplierId: "sup-hoang-thach",
    lines: [{
      productUnitId: "pu-brick-vien",
      orderedQuantity: 100,
      unitCost: 1000,
      taxRate: 0.08,
      unitName: "Xe",
      destinationType: "warehouse"
    }]
  }, "draft-purchase-order");
    const order = state.purchaseOrders.at(-1);
    const line = order?.lines[0];

    expect(() => runOperation({
      state,
      operation: "postGoodsReceipt",
      actor: createOwnerActor(),
      now,
      idempotencyKey: "draft-purchase-post-blocked-12345",
      targetId: line?.id
    })).toThrow("xác nhận đơn mua");

    state = run(state, "confirmPurchaseOrder", "confirm-new-purchase", order?.id);
    state = run(state, "postGoodsReceipt", "post-new-purchase", line?.id);
    expect(state.purchaseOrders.at(-1)?.status).toBe("fully_received");
  });

  it("records partial delivery quantities and real recipient evidence per trip", () => {
    let state = createInitialOperationsState();
    state = run(state, "confirmSalesOrder", "partial-delivery-confirm");
    state = run(state, "allocateSalesSources", "partial-delivery-allocate");
    state = run(state, "postGoodsReceipt", "partial-delivery-receipt");
    state = run(state, "startDeliveryLoading", "partial-delivery-loading", "dj-001");
    state = run(state, "dispatchDelivery", "partial-delivery-dispatch", "dj-001");
    state = runOperation({
      state,
      operation: "completeDelivery",
      actor: createOwnerActor(),
      now,
      idempotencyKey: "partial-delivery-complete-12345",
      targetId: "dj-001",
      options: {
        recipientName: "Anh Minh",
        evidence: "Ảnh phiếu giao GH-0001",
        lineQuantities: { "so-001-line-cement": 40 }
      }
    }).state;

    expect(state.salesOrders[0]?.lines[0]?.deliveredQuantity).toBe(40);
    expect(state.salesOrders[0]?.status).toBe("partially_delivered");
    expect(state.deliveryJobs[0]).toMatchObject({ status: "delivered", recipientName: "Anh Minh", evidence: "Ảnh phiếu giao GH-0001" });
    expect(state.inventoryMovements.find((movement) => movement.sourceLineId === "so-001-line-cement")?.quantity).toBe(-40);
  });

  it("posts and reverses linked two-sided warehouse transfers", () => {
    let state = createInitialOperationsState();
    state = runOperation({
      state,
      operation: "postInventoryTransfer",
      actor: createOwnerActor(),
      now,
      idempotencyKey: "inventory-transfer-post-12345",
      options: {
        sourceWarehouseId: "wh-main",
        destinationWarehouseId: "wh-yard",
        productUnitId: "pu-brick-vien",
        quantity: 100,
        reason: "Điều chuyển sang bãi ngoài"
      }
    }).state;

    expect(stockBalance(state, "wh-main", "pu-brick-vien")).toBe(9900);
    expect(stockBalance(state, "wh-yard", "pu-brick-vien")).toBe(100);
    const transferOut = state.inventoryMovements.find((movement) => movement.movementType === "transfer_out");
    expect(transferOut?.relatedMovementId).toBeDefined();

    state = runOperation({
      state,
      operation: "reverseInventoryMovement",
      actor: createOwnerActor(),
      now,
      idempotencyKey: "inventory-transfer-reverse-12345",
      targetId: transferOut?.id,
      options: { reason: "Hủy điều chuyển do sai kho" }
    }).state;

    expect(stockBalance(state, "wh-main", "pu-brick-vien")).toBe(10000);
    expect(stockBalance(state, "wh-yard", "pu-brick-vien")).toBe(0);
    expect(state.inventoryMovements.filter((movement) => movement.movementType === "reverse")).toHaveLength(2);
  });

  it("keeps the legacy count-adjustment command in safe compatibility mode and runs cash voucher confirm/reversal", () => {
    let state = createInitialOperationsState();
    state = runOperation({
      state,
      operation: "postInventoryCountAdjustment",
      actor: createOwnerActor(),
      now,
      idempotencyKey: "inventory-count-adjustment-12345",
      options: {
        warehouseId: "wh-main",
        productUnitId: "pu-brick-vien",
        countedQuantity: 9990,
        reason: "Biên bản kiểm kê cuối ngày"
      }
    }).state;
    expect(stockBalance(state, "wh-main", "pu-brick-vien")).toBe(10000);
    expect(state.inventoryCountSessions).toHaveLength(1);
    expect(state.inventoryCountSessions?.[0].status).toBe("draft");

    state = create(state, {
      type: "createCashVoucherDraft",
      direction: "in",
      category: "Thu khác",
      description: "Thu hoàn ứng",
      amount: 500000
    }, "cash-voucher");
    const voucherId = state.cashVouchers.at(-1)?.id;
    state = run(state, "confirmCashVoucher", "cash-voucher-confirm", voucherId);
    expect(cashBalance(state)).toBe(500000);
    state = run(state, "reverseCashVoucher", "cash-voucher-reverse", voucherId);
    expect(cashBalance(state)).toBe(0);
    expect(state.cashVouchers.at(-1)?.status).toBe("reversed");
  });
});
