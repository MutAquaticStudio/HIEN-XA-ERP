import { describe, expect, it } from "vitest";
import { runCreateCommand } from "../src/modules/operations/create-commands";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { createOwnerActor, runOperation } from "../src/modules/operations/service";
import { OperationsCommandService } from "../src/server/application/operations-command-service";
import { MemoryOperationsBackend } from "../src/server/infrastructure/memory-operations-backend";
import type { CreateCommand, OperationsState } from "../src/modules/operations/types";

const actor = createOwnerActor();
const now = "2026-07-16T12:00:00.000+07:00";

function create(command: CreateCommand, key: string = command.type, state = createInitialOperationsState()) {
  return runCreateCommand({
    state,
    command,
    actor,
    now,
    idempotencyKey: `create-${key}-12345`
  });
}

function configurePurchaseUnit(
  state: OperationsState,
  input: { name: string; productUnitId: string; conversionMode: "fixed" | "variable"; factorToBase?: number },
  key: string
) {
  const unitResult = create({ type: "createUnitDefinition", name: input.name }, `${key}-unit`, state);
  const unit = unitResult.state.unitDefinitions.at(-1);
  if (!unit) throw new Error("Missing configured purchase unit.");
  return create({
    type: "upsertPurchaseUnitConversion",
    productUnitId: input.productUnitId,
    unitId: unit.id,
    conversionMode: input.conversionMode,
    factorToBase: input.factorToBase
  }, `${key}-conversion`, unitResult.state).state;
}

describe("create commands", () => {
  it("creates customer master data without touching ledgers", () => {
    const result = create({
      type: "createCustomer",
      displayName: "Công trình Hòa Bình",
      phone: "0912 345 678",
      creditLimit: 50000000
    });

    expect(result.state.customers).toHaveLength(3);
    expect(result.state.customers.at(-1)).toMatchObject({
      code: "KH0003",
      displayName: "Công trình Hòa Bình",
      creditLimit: 50000000,
      status: "active"
    });
    expect(result.state.customerLedgerEntries).toHaveLength(0);
    expect(result.state.auditLogs[0]?.action).toBe("createCustomer");
  });

  it("rejects duplicate names using Vietnamese-insensitive comparison", () => {
    expect(() =>
      create({
        type: "createCustomer",
        displayName: "tuan lai",
        phone: "",
        creditLimit: 0
      })
    ).toThrow("Khách hàng đã tồn tại");
  });

  it("creates vehicle master data and rejects a duplicate plate number", () => {
    const first = create({
      type: "createVehicle",
      code: "XE-03",
      plateNumber: "29C-999.88",
      capacityTons: 10
    }, "vehicle");

    expect(first.state.vehicles.at(-1)).toMatchObject({ code: "XE-03", plateNumber: "29C-999.88", capacityTons: 10 });
    expect(() => runCreateCommand({
      state: first.state,
      command: { type: "createVehicle", code: "XE-04", plateNumber: "29c-999.88", capacityTons: 5 },
      actor,
      now,
      idempotencyKey: "duplicate-vehicle-plate-12345"
    })).toThrow("Biển số xe đã tồn tại");
  });

  it("blocks delivery schedule overlap for either the driver or the vehicle", () => {
    const state = createInitialOperationsState();
    state.employees.push({
      id: "emp-driver-second",
      code: "NV-DRIVER-2",
      displayName: "Tài xế thứ hai",
      roleType: "driver",
      status: "active"
    });
    state.salesOrders.push({
      id: "so-overlap",
      documentNo: "SO-OVERLAP",
      customerId: "cus-minh-anh",
      orderDate: "2026-07-16",
      status: "allocated",
      version: 1,
      currency: "VND",
      lines: [{
        id: "so-overlap-line",
        productUnitId: "pu-brick-vien",
        quantity: 10,
        deliveredQuantity: 0,
        unitPrice: 1500,
        taxRate: 0.08,
        sourceType: "warehouse",
        warehouseId: "wh-main"
      }]
    });

    expect(() => runCreateCommand({
      state,
      command: {
        type: "createDeliveryJob",
        salesOrderId: "so-overlap",
        driverId: "emp-driver-dung",
        vehicleId: "vehicle-truck-02",
        plannedDate: "2026-07-16"
      },
      actor,
      now,
      idempotencyKey: "overlap-delivery-driver-12345"
    })).toThrow("Tài xế đã có chuyến");

    expect(() => runCreateCommand({
      state,
      command: {
        type: "createDeliveryJob",
        salesOrderId: "so-overlap",
        driverId: "emp-driver-second",
        vehicleId: "vehicle-truck-01",
        plannedDate: "2026-07-16"
      },
      actor,
      now,
      idempotencyKey: "overlap-delivery-vehicle-12345"
    })).toThrow("Xe đã được xếp");
  });

  it("rejects invalid sales quantity before creating a draft order", () => {
    expect(() =>
      create({
        type: "createSalesOrderDraft",
        customerId: "cus-minh-anh",
        productUnitId: "pu-cement-bag",
        quantity: 0,
        unitPrice: 89000,
        taxRate: 0.08
      })
    ).toThrow("Số lượng");
  });

  it("requires a customer when a purchase draft is marked for direct delivery", () => {
    const state = configurePurchaseUnit(createInitialOperationsState(), {
      name: "xe",
      productUnitId: "pu-sand-m3",
      conversionMode: "fixed",
      factorToBase: 1
    }, "require-direct-customer");
    expect(() =>
      create({
        type: "createPurchaseOrderDraft",
        supplierId: "sup-cat-da-hai-an",
        lines: [{
          productUnitId: "pu-sand-m3",
          orderedQuantity: 12,
          unitCost: 190000,
          taxRate: 0.08,
          unitName: "xe",
          destinationType: "customer_direct"
        }]
      }, "direct-customer", state)
    ).toThrow("giao thẳng cần chọn khách hàng nhận");
  });

  it("creates multi-line sales and purchase aggregates in one command", () => {
    const sales = create({
      type: "createSalesOrderDraft",
      customerId: "cus-minh-anh",
      lines: [
        { productUnitId: "pu-cement-bag", quantity: 10, unitPrice: 89000, taxRate: 0.08 },
        { productUnitId: "pu-brick-vien", quantity: 200, unitPrice: 1600, taxRate: 0.08 }
      ]
    }, "multi-line-sales");
    const multiLinePurchaseState = configurePurchaseUnit(configurePurchaseUnit(createInitialOperationsState(), {
      name: "Tấn",
      productUnitId: "pu-cement-bag",
      conversionMode: "fixed",
      factorToBase: 20
    }, "multi-line-purchase-cement"), {
      name: "Xe",
      productUnitId: "pu-sand-m3",
      conversionMode: "fixed",
      factorToBase: 1
    }, "multi-line-purchase-sand");
    const purchase = create({
      type: "createPurchaseOrderDraft",
      supplierId: "sup-cat-da-hai-an",
      lines: [
        { productUnitId: "pu-cement-bag", orderedQuantity: 10, unitCost: 76000, taxRate: 0.08, unitName: "Tấn", destinationType: "warehouse" },
        { productUnitId: "pu-sand-m3", orderedQuantity: 4, unitCost: 190000, taxRate: 0.08, unitName: "Xe", destinationType: "customer_direct", customerId: "cus-minh-anh" }
      ]
    }, "multi-line-purchase", multiLinePurchaseState);

    expect(sales.state.salesOrders.at(-1)?.lines).toHaveLength(2);
    expect(purchase.state.purchaseOrders.at(-1)?.lines).toHaveLength(2);
    expect(purchase.state.purchaseOrders.at(-1)?.lines.map((line) => line.destinationType)).toEqual(["warehouse", "customer_direct"]);
  });

  it("stores optional evidence images on sales and purchase drafts", () => {
    const attachment = {
      id: "11111111-1111-4111-8111-111111111111",
      fileName: "chung-tu.jpg",
      contentType: "image/jpeg" as const,
      size: 2048,
      sha256: "a".repeat(64),
      uploadedBy: actor.id,
      uploadedAt: now
    };
    const sales = create({
      type: "createSalesOrderDraft",
      customerId: "cus-minh-anh",
      attachments: [attachment],
      productUnitId: "pu-cement-bag",
      quantity: 5,
      unitPrice: 89000,
      taxRate: 0.08
    }, "sales-attachment");
    const attachmentPurchaseState = configurePurchaseUnit(createInitialOperationsState(), {
      name: "Tân",
      productUnitId: "pu-cement-bag",
      conversionMode: "fixed",
      factorToBase: 20
    }, "sales-purchase-attachment");
    const purchase = create({
      type: "createPurchaseOrderDraft",
      supplierId: "sup-cat-da-hai-an",
      attachments: [attachment],
      lines: [{
        productUnitId: "pu-cement-bag",
        orderedQuantity: 5,
        unitCost: 76000,
        taxRate: 0.08,
        unitName: "Tân",
        destinationType: "warehouse"
      }]
    }, "purchase-attachment", attachmentPurchaseState);

    expect(sales.state.salesOrders.at(-1)?.attachments).toEqual([attachment]);
    expect(purchase.state.purchaseOrders.at(-1)?.attachments).toEqual([attachment]);
  });

  it("rejects document evidence metadata uploaded by another actor", () => {
    expect(() => create({
      type: "createSalesOrderDraft",
      customerId: "cus-minh-anh",
      attachments: [{
        id: "22222222-2222-4222-8222-222222222222",
        fileName: "other.jpg",
        contentType: "image/jpeg",
        size: 2048,
        sha256: "b".repeat(64),
        uploadedBy: "user-other",
        uploadedAt: now
      }],
      productUnitId: "pu-cement-bag",
      quantity: 5,
      unitPrice: 89000,
      taxRate: 0.08
    }, "foreign-attachment")).toThrow("không hợp lệ");
  });

  it("stores document units while converting sales and purchase quantities to the stock unit", () => {
    const sales = create({
      type: "createSalesOrderDraft",
      customerId: "cus-minh-anh",
      lines: [{
        productUnitId: "pu-cement-bag",
        quantity: 3,
        unitPrice: 1520000,
        taxRate: 0.08,
        unitName: "tấn",
        unitFactor: 20
      }]
    }, "sales-unit-conversion");
    const variableSandState = configurePurchaseUnit(createInitialOperationsState(), {
      name: "Xe",
      productUnitId: "pu-sand-m3",
      conversionMode: "variable"
    }, "document-vehicle");
    const purchase = create({
      type: "createPurchaseOrderDraft",
      supplierId: "sup-cat-da-hai-an",
      lines: [{
        productUnitId: "pu-sand-m3",
        orderedQuantity: 2,
        unitCost: 1400000,
        taxRate: 0.08,
        unitName: "xe",
        actualBaseQuantity: 13.5,
        destinationType: "warehouse"
      }]
    }, "purchase-unit-conversion", variableSandState);

    expect(sales.state.salesOrders.at(-1)?.lines[0]).toMatchObject({
      quantity: 60,
      unitPrice: 76000,
      documentUnit: { unitName: "tấn", baseUnitName: "bao", factorToBase: 20, quantity: 3, unitAmount: 1520000 }
    });
    const purchaseLine = purchase.state.purchaseOrders.at(-1)?.lines[0];
    expect(purchaseLine).toMatchObject({
      orderedQuantity: 13.5,
      documentUnit: {
        unitName: "Xe",
        baseUnitName: "m3",
        conversionMode: "variable",
        quantity: 2,
        unitAmount: 1400000
      }
    });
    expect(purchaseLine?.unitCost).toBeCloseTo(2800000 / 13.5);
    expect(purchaseLine?.documentUnit?.factorToBase).toBeCloseTo(6.75);
  });

  it("requires an explicit positive conversion for a non-stock document unit", () => {
    expect(() => create({
      type: "createPurchaseOrderDraft",
      supplierId: "sup-cat-da-hai-an",
      lines: [{
        productUnitId: "pu-sand-m3",
        orderedQuantity: 1,
        unitCost: 1400000,
        taxRate: 0.08,
        unitName: "container",
        destinationType: "warehouse"
      }]
    }, "missing-unit-conversion")).toThrow("chưa được cấu hình");
  });

  it("posts a partial vehicle receipt in canonical stock units and payable amount", () => {
    const variableSandState = configurePurchaseUnit(createInitialOperationsState(), {
      name: "Xe",
      productUnitId: "pu-sand-m3",
      conversionMode: "variable"
    }, "receipt-vehicle");
    const draft = create({
      type: "createPurchaseOrderDraft",
      supplierId: "sup-cat-da-hai-an",
      lines: [{
        productUnitId: "pu-sand-m3",
        orderedQuantity: 1,
        unitCost: 1400000,
        taxRate: 0.1,
        unitName: "xe",
        actualBaseQuantity: 6.5,
        destinationType: "warehouse"
      }]
    }, "vehicle-partial-receipt", variableSandState);
    const order = draft.state.purchaseOrders.at(-1);
    const line = order?.lines[0];
    if (!order || !line) {
      throw new Error("Missing converted purchase order.");
    }

    const confirmed = runOperation({
      state: draft.state,
      operation: "confirmPurchaseOrder",
      actor,
      now,
      idempotencyKey: "confirm-vehicle-purchase-12345",
      targetId: order.id
    });
    const receipt = runOperation({
      state: confirmed.state,
      operation: "postGoodsReceipt",
      actor,
      now,
      idempotencyKey: "post-one-vehicle-receipt-12345",
      targetId: line.id,
      options: { quantity: 6.5 }
    });

    expect(receipt.state.purchaseOrders.at(-1)?.lines[0]).toMatchObject({
      receivedQuantity: 6.5,
      documentUnit: { unitName: "Xe", factorToBase: 6.5, quantity: 1, conversionMode: "variable" }
    });
    expect(receipt.state.inventoryMovements.at(-1)?.quantity).toBe(6.5);
    expect(receipt.state.inventoryMovements.at(-1)?.unitCost).toBeCloseTo(1400000 / 6.5);
    expect(receipt.state.supplierLedgerEntries.at(-1)?.amount).toBe(1540000);
  });

  it("links each compensation batch to its own work order and creates employee payment drafts", () => {
    const work = create({
      type: "createWorkOrderDraft",
      employeeId: "emp-worker-nam",
      productUnitId: "pu-brick-vien",
      actualQuantity: 50,
      totalAmount: 100000
    }, "linked-work");
    const payment = create({
      type: "createEmployeePaymentDraft",
      employeeId: "emp-worker-nam",
      amount: 50000
    }, "employee-payment");

    expect(work.state.compensationBatches.at(-1)?.workOrderId).toBe(work.state.workOrders.at(-1)?.id);
    expect(payment.state.employeePayments.at(-1)).toMatchObject({ employeeId: "emp-worker-nam", amount: 50000, status: "draft" });
  });

  it("creates one fingerprinted import dry-run batch and blocks duplicate workbook hashes", () => {
    const command: CreateCommand = {
      type: "createImportDryRun",
      fileName: "Demo.xlsx",
      fileHash: "a".repeat(64),
      sheetNames: ["7.26"],
      rowCount: 2,
      issues: [{ sourceSheet: "7.26", rowNumber: 8, severity: "warning", message: "Ngày đang là text." }]
    };
    const first = runCreateCommand({ state: createInitialOperationsState(), command, actor, now, idempotencyKey: "import-dry-run-first-12345" });

    expect(first.state.importJobs).toHaveLength(1);
    expect(first.state.importJobs[0]?.status).toBe("dry_run");
    expect(first.state.importIssues.some((issue) => issue.message === "Ngày đang là text.")).toBe(true);
    const reviewed = runOperation({
      state: first.state,
      operation: "resolveImportIssue",
      actor,
      now,
      idempotencyKey: "resolve-import-job-warning-12345",
      targetId: first.state.importIssues.find((issue) => issue.importJobId === first.state.importJobs[0]?.id)?.id
    });
    expect(reviewed.state.importJobs[0]?.status).toBe("reviewed");
    expect(() => runCreateCommand({ state: first.state, command, actor, now, idempotencyKey: "import-dry-run-second-12345" })).toThrow("batch trùng");
  });

  it("creates work output and draft compensation basis without posting employee ledger", () => {
    const result = create({
      type: "createWorkOrderDraft",
      employeeId: "emp-worker-nam",
      productUnitId: "pu-brick-vien",
      actualQuantity: 400,
      totalAmount: 240000
    });

    expect(result.state.workOrders).toHaveLength(2);
    expect(result.state.compensationBatches).toHaveLength(2);
    expect(result.state.workOrders.at(-1)?.status).toBe("submitted");
    expect(result.state.compensationBatches.at(-1)).toMatchObject({
      status: "draft",
      totalAmount: 240000,
      lines: []
    });
    expect(result.state.employeeLedgerEntries).toHaveLength(0);
  });

  it("replays idempotent create commands and rejects same key with different payload", async () => {
    const backend = new MemoryOperationsBackend();
    const service = new OperationsCommandService(backend);
    const command: CreateCommand = {
      type: "createSupplier",
      displayName: "Thép Việt Nhật",
      phone: "0909 111 222"
    };
    const replayInput = {
      command,
      actor,
      now,
      idempotencyKey: "same-create-supplier-12345"
    };
    const samePayloadDifferentOrder = {
      command: {
        phone: "0909 111 222",
        displayName: "Thép Việt Nhật",
        type: "createSupplier"
      } satisfies CreateCommand,
      actor,
      now,
      idempotencyKey: "same-create-supplier-12345"
    };

    const first = await service.execute(replayInput);
    const second = await service.execute(samePayloadDifferentOrder);

    expect(first.state.suppliers).toHaveLength(3);
    expect(second.severity).toBe("warning");
    expect(backend.getState().suppliers.filter((supplier) => supplier.displayName === "Thép Việt Nhật")).toHaveLength(1);

    await expect(
      service.execute({
        ...replayInput,
        command: {
          type: "createSupplier",
          displayName: "Xi măng mới",
          phone: ""
        }
      })
    ).rejects.toThrow("Idempotency key");
  });
});

