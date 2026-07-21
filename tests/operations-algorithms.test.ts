import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { createOwnerActor, runOperation } from "../src/modules/operations/service";
import type { OperationName, OperationsState, SalesOrder } from "../src/modules/operations/types";

const now = "2026-07-16T11:00:00.000+07:00";

function run(state: OperationsState, operation: OperationName, key: string = operation) {
  return runOperation({
    state,
    operation,
    actor: createOwnerActor(),
    now,
    idempotencyKey: `algorithm-${key}`,
    options: operation === "completeDelivery"
      ? { recipientName: "Nguyễn Văn Nhận", evidence: "Biên bản giao nhận TEST-ALGORITHM" }
      : undefined
  }).state;
}

function emptyOperatingState() {
  const state = createInitialOperationsState();
  state.salesOrders = [];
  state.purchaseOrders = [];
  state.inventoryMovements = [];
  state.deliveryJobs = [];
  state.customerLedgerEntries = [];
  state.supplierLedgerEntries = [];
  state.employeeLedgerEntries = [];
  state.customerPayments = [];
  state.supplierPayments = [];
  state.employeePayments = [];
  state.cashTransactions = [];
  state.workOrders = [];
  state.compensationBatches = [];
  state.importIssues = [];
  state.auditLogs = [];
  state.processedOperations = [];
  return state;
}

function confirmedSalesOrder(id: string, productUnitId: string, quantity: number): SalesOrder {
  return {
    id,
    documentNo: id.toUpperCase(),
    customerId: "cus-minh-anh",
    orderDate: "2026-07-16",
    status: "confirmed",
    version: 1,
    currency: "VND",
    lines: [
      {
        id: `${id}-line-1`,
        productUnitId,
        quantity,
        deliveredQuantity: 0,
        unitPrice: 2000,
        taxRate: 0.08
      }
    ]
  };
}

describe("operations business algorithms", () => {
  it("does not allocate the same warehouse stock to two open sales orders", () => {
    let state = emptyOperatingState();
    state.inventoryMovements.push({
      id: "im-opening-brick-small",
      movementType: "opening",
      sourceDocument: "OPENING-TEST",
      postingKey: "opening-brick-small",
      warehouseId: "wh-main",
      productUnitId: "pu-brick-vien",
      quantity: 100,
      unitCost: 1000,
      postedAt: now
    });
    state.salesOrders.push(
      confirmedSalesOrder("so-reserve-a", "pu-brick-vien", 70),
      confirmedSalesOrder("so-reserve-b", "pu-brick-vien", 70)
    );

    state = run(state, "allocateSalesSources", "reserve-a");

    expect(state.salesOrders[0]?.lines[0]?.sourceType).toBe("warehouse");
    expect(() => run(state, "allocateSalesSources", "reserve-b")).toThrow();
  });

  it("does not reserve the same open warehouse purchase line beyond its remaining quantity", () => {
    let state = emptyOperatingState();
    state.purchaseOrders.push({
      id: "po-reserve",
      documentNo: "PO-RESERVE",
      supplierId: "sup-hoang-thach",
      orderDate: "2026-07-16",
      status: "ordered",
      lines: [
        {
          id: "po-reserve-line-1",
          productUnitId: "pu-cement-bag",
          orderedQuantity: 100,
          receivedQuantity: 0,
          unitCost: 76000,
          taxRate: 0.08,
          destinationType: "warehouse",
          warehouseId: "wh-main"
        }
      ]
    });
    state.salesOrders.push(
      confirmedSalesOrder("so-po-a", "pu-cement-bag", 70),
      confirmedSalesOrder("so-po-b", "pu-cement-bag", 70)
    );

    state = run(state, "allocateSalesSources", "po-a");

    expect(state.salesOrders[0]?.lines[0]?.purchaseOrderLineId).toBe("po-reserve-line-1");
    expect(() => run(state, "allocateSalesSources", "po-b")).toThrow();
  });

  it("does not reuse a direct supplier purchase line for another sales order", () => {
    let state = createInitialOperationsState();
    state = run(state, "confirmSalesOrder", "seed-confirm");
    state = run(state, "allocateSalesSources", "seed-allocate");
    state.salesOrders.push(confirmedSalesOrder("so-direct-b", "pu-sand-m3", 18));

    expect(state.purchaseOrders[1]?.lines[0]?.salesOrderLineId).toBe("so-001-line-sand");
    expect(() => run(state, "allocateSalesSources", "direct-b")).toThrow();
  });

  it("uses moving weighted average cost when issuing warehouse stock", () => {
    let state = emptyOperatingState();
    state.inventoryMovements.push(
      {
        id: "im-opening-brick-1000",
        movementType: "opening",
        sourceDocument: "OPENING-TEST",
        postingKey: "opening-brick-1000",
        warehouseId: "wh-main",
        productUnitId: "pu-brick-vien",
        quantity: 100,
        unitCost: 1000,
        postedAt: now
      },
      {
        id: "im-receipt-brick-2000",
        movementType: "receipt",
        sourceDocument: "PO-TEST",
        postingKey: "receipt-brick-2000",
        warehouseId: "wh-main",
        productUnitId: "pu-brick-vien",
        quantity: 100,
        unitCost: 2000,
        postedAt: now
      }
    );
    const order = confirmedSalesOrder("so-cost", "pu-brick-vien", 50);
    order.status = "allocated";
    order.lines[0].sourceType = "warehouse";
    order.lines[0].warehouseId = "wh-main";
    state.salesOrders.push(order);
    state.deliveryJobs.push({
      id: "dj-cost",
      documentNo: "GH-COST",
      salesOrderId: order.id,
      driverId: "emp-driver-dung",
      vehicleId: "vehicle-truck-01",
      helperIds: [],
      plannedDate: "2026-07-16",
      status: "assigned"
    });

    state = run(state, "startDeliveryLoading", "moving-average-loading");
    state = run(state, "dispatchDelivery", "moving-average-dispatch");
    state = run(state, "completeDelivery", "moving-average");

    const issue = state.inventoryMovements.find((movement) => movement.postingKey === "issue-SO-COST-so-cost-line-1");
    expect(issue?.unitCost).toBe(1500);
  });

  it("keeps moving average cost correct after an issue and a later receipt", () => {
    let state = emptyOperatingState();
    state.inventoryMovements.push(
      {
        id: "im-opening-cost-chain",
        movementType: "opening",
        sourceDocument: "OPENING-COST-CHAIN",
        postingKey: "opening-cost-chain",
        warehouseId: "wh-main",
        productUnitId: "pu-brick-vien",
        quantity: 100,
        unitCost: 1000,
        postedAt: now
      },
      {
        id: "im-receipt-cost-chain-a",
        movementType: "receipt",
        sourceDocument: "PO-COST-A",
        postingKey: "receipt-cost-chain-a",
        warehouseId: "wh-main",
        productUnitId: "pu-brick-vien",
        quantity: 100,
        unitCost: 2000,
        postedAt: now
      },
      {
        id: "im-issue-cost-chain",
        movementType: "issue",
        sourceDocument: "SO-COST-A",
        postingKey: "issue-cost-chain",
        warehouseId: "wh-main",
        productUnitId: "pu-brick-vien",
        quantity: -150,
        unitCost: 1500,
        postedAt: now
      },
      {
        id: "im-receipt-cost-chain-b",
        movementType: "receipt",
        sourceDocument: "PO-COST-B",
        postingKey: "receipt-cost-chain-b",
        warehouseId: "wh-main",
        productUnitId: "pu-brick-vien",
        quantity: 100,
        unitCost: 3000,
        postedAt: now
      }
    );

    state = runOperation({
      state,
      operation: "postInventoryTransfer",
      actor: createOwnerActor(),
      now,
      idempotencyKey: "moving-average-after-issue-transfer",
      options: {
        sourceWarehouseId: "wh-main",
        destinationWarehouseId: "wh-yard",
        productUnitId: "pu-brick-vien",
        quantity: 10,
        reason: "Kiểm tra giá vốn chuyển kho"
      }
    }).state;

    const transferOut = state.inventoryMovements.find((movement) => movement.movementType === "transfer_out");
    const transferIn = state.inventoryMovements.find((movement) => movement.movementType === "transfer_in");
    expect(transferOut?.unitCost).toBe(2500);
    expect(transferIn?.unitCost).toBe(2500);
  });

  it("allocates a later customer payment only to the remaining open receivable amount", () => {
    let state = emptyOperatingState();
    state.customerLedgerEntries.push({
      id: "cle-001",
      customerId: "cus-minh-anh",
      sourceDocument: "SO-TEST:GIAO-KHO",
      direction: "debit",
      amount: 1000,
      postingDate: now
    });
    state.customerPayments.push(
      {
        id: "cp-001",
        documentNo: "PT-001",
        customerId: "cus-minh-anh",
        amount: 700,
        status: "allocated",
        allocations: [{ ledgerEntryId: "cle-001", amount: 700 }]
      },
      {
        id: "cp-002",
        documentNo: "PT-002",
        customerId: "cus-minh-anh",
        amount: 500,
        status: "confirmed",
        allocations: []
      }
    );

    state = run(state, "allocateCustomerPayment", "second-payment");

    expect(state.customerPayments[1]?.status).toBe("partially_allocated");
    expect(state.customerPayments[1]?.allocations).toEqual([{ ledgerEntryId: "cle-001", amount: 300 }]);
  });

  it("rounds compensation by participant share while preserving the batch total", () => {
    let state = emptyOperatingState();
    state.workOrders.push({
      id: "wo-rounding",
      documentNo: "CV-ROUND",
      sourceDocument: "GH-ROUND",
      workType: "Boc xep",
      workDate: "2026-07-16",
      status: "approved",
      outputs: [
        {
          id: "wo-rounding-output",
          productUnitId: "pu-brick-vien",
          actualQuantity: 100,
          approvedQuantity: 100,
          status: "approved"
        }
      ],
      participants: [
        { employeeId: "emp-driver-dung", shareFactor: 1 },
        { employeeId: "emp-worker-nam", shareFactor: 1 },
        { employeeId: "emp-worker-hai", shareFactor: 1 }
      ]
    });
    state.compensationBatches.push({
      id: "cb-rounding",
      documentNo: "LC-ROUND",
      workOrderId: "wo-rounding",
      status: "draft",
      totalAmount: 100000,
      lines: []
    });

    state = run(state, "postCompensation", "rounding");

    expect(state.compensationBatches[0]?.lines.map((line) => line.amount)).toEqual([33333, 33333, 33334]);
    expect(state.compensationBatches[0]?.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(100000);
  });
});
