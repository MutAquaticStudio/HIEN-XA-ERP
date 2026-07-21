import { describe, expect, it } from "vitest";
import { assertOperationsInvariants, validateOperationsInvariants } from "../src/modules/operations/invariants";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";

describe("operations invariants", () => {
  it("accepts the seeded operating state", () => {
    expect(validateOperationsInvariants(createInitialOperationsState())).toEqual([]);
  });

  it("catches customer payment allocations that exceed the payment amount", () => {
    const state = createInitialOperationsState();
    const payment = state.customerPayments[0];

    if (!payment) {
      throw new Error("Missing seeded payment.");
    }

    state.customerLedgerEntries.push({
      id: "cle-test-receivable",
      customerId: payment.customerId,
      sourceDocument: "SO-TEST:GIAO-KHO",
      direction: "debit",
      amount: payment.amount * 2,
      postingDate: "2026-07-16T12:00:00.000+07:00"
    });

    payment.status = "allocated";
    payment.allocations = [
      {
        ledgerEntryId: "cle-test-receivable",
        amount: payment.amount + 1
      }
    ];

    expect(validateOperationsInvariants(state).map((violation) => violation.code)).toContain("payment_over_allocated");
  });

  it("catches direct supplier delivery that incorrectly creates inventory movement", () => {
    const state = createInitialOperationsState();
    const directPurchase = state.purchaseOrders
      .flatMap((purchaseOrder) => purchaseOrder.lines.map((line) => ({ purchaseOrder, line })))
      .find(({ line }) => line.destinationType === "customer_direct");

    if (!directPurchase) {
      throw new Error("Missing seeded direct purchase line.");
    }

    directPurchase.line.customerId = "cus-minh-anh";
    directPurchase.line.salesOrderLineId = "so-001-line-sand";
    state.inventoryMovements.push({
      id: "im-bad-direct",
      movementType: "receipt",
      sourceDocument: directPurchase.purchaseOrder.documentNo,
      postingKey: `receipt-${directPurchase.line.id}`,
      warehouseId: "wh-main",
      productUnitId: directPurchase.line.productUnitId,
      quantity: directPurchase.line.orderedQuantity,
      unitCost: directPurchase.line.unitCost,
      postedAt: "2026-07-16T12:00:00.000+07:00"
    });

    expect(validateOperationsInvariants(state).map((violation) => violation.code)).toContain(
      "direct_delivery_created_inventory_movement"
    );
  });

  it("catches posted compensation batches whose participant split does not equal the batch total", () => {
    const state = createInitialOperationsState();
    const batch = state.compensationBatches[0];

    if (!batch) {
      throw new Error("Missing seeded compensation batch.");
    }

    batch.status = "posted";
    batch.totalAmount = 300000;
    batch.lines = [
      {
        workOutputId: "wo-001-output-brick",
        employeeId: "emp-worker-nam",
        amount: 100000
      }
    ];

    expect(() => assertOperationsInvariants(state)).toThrow("posted_batch_total_mismatch");
  });

  it("catches invalid import issues before they become accepted operating data", () => {
    const state = createInitialOperationsState();
    const issue = state.importIssues[0];

    if (!issue) {
      throw new Error("Missing seeded import issue.");
    }

    issue.rowNumber = 0;

    expect(validateOperationsInvariants(state).map((violation) => violation.code)).toContain("invalid_import_issue");
  });

  it("catches document-unit snapshots that do not reconcile to the stock quantity", () => {
    const state = createInitialOperationsState();
    const line = state.purchaseOrders[0]?.lines[0];

    if (!line) {
      throw new Error("Missing seeded purchase line.");
    }

    line.documentUnit = {
      unitName: "container",
      baseUnitName: "bao",
      factorToBase: 20,
      quantity: 2,
      unitAmount: 1520000
    };

    expect(validateOperationsInvariants(state).map((violation) => violation.code)).toContain("invalid_document_unit_conversion");
  });
});
