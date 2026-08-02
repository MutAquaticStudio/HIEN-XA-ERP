import type { OperationsState } from "./types";

export function createInitialOperationsState(): OperationsState {
  return {
    customers: [
      {
        id: "cus-minh-anh",
        code: "KH0001",
        displayName: "Công trình Minh Anh",
        phone: "0988 123 456",
        creditLimit: 250000000,
        status: "active"
      },
      {
        id: "cus-tuan-lai",
        code: "KH0002",
        displayName: "Tuấn Lại",
        phone: "0977 555 222",
        creditLimit: 120000000,
        status: "active"
      }
    ],
    suppliers: [
      {
        id: "sup-hoang-thach",
        code: "NCC001",
        displayName: "Xi măng Hoàng Thạch",
        phone: "0225 888 112",
        status: "active"
      },
      {
        id: "sup-cat-da-hai-an",
        code: "NCC002",
        displayName: "Bãi cát đá Hải An",
        phone: "0904 222 118",
        status: "active"
      }
    ],
    employees: [
      {
        id: "emp-driver-dung",
        code: "NV001",
        displayName: "Lê Văn Dũng",
        roleType: "driver",
        status: "active"
      },
      {
        id: "emp-worker-nam",
        code: "NV002",
        displayName: "Nguyễn Văn Nam",
        roleType: "worker",
        status: "active"
      },
      {
        id: "emp-worker-hai",
        code: "NV003",
        displayName: "Phạm Văn Hải",
        roleType: "worker",
        status: "active"
      }
    ],
    productUnits: [
      {
        id: "pu-cement-bag",
        productCode: "XM-HOLCIM-BAO",
        productName: "Xi măng Holcim",
        unitName: "bao",
        salePrice: 89000,
        saleTaxRate: 0.08,
        status: "active"
      },
      {
        id: "pu-sand-m3",
        productCode: "CAT-DEN-M3",
        productName: "Cát đen",
        unitName: "m3",
        salePrice: 245000,
        saleTaxRate: 0.08,
        status: "active"
      },
      {
        id: "pu-brick-vien",
        productCode: "GACH-8X18-VIEN",
        productName: "Gạch đặc 8x18",
        unitName: "viên",
        salePrice: 1400,
        saleTaxRate: 0.08,
        status: "active"
      }
    ],
    unitDefinitions: [
      { id: "unit-bao", name: "bao", status: "active" },
      { id: "unit-m3", name: "m3", status: "active" },
      { id: "unit-vien", name: "viên", status: "active" }
    ],
    purchaseUnitConversions: [],
    warehouses: [
      {
        id: "wh-main",
        code: "KHO-CHINH",
        name: "Kho chính",
        status: "active"
      },
      {
        id: "wh-yard",
        code: "BAI-NGOAI",
        name: "Bãi ngoài",
        status: "active"
      }
    ],
    vehicles: [
      {
        id: "vehicle-truck-01",
        code: "XE-01",
        plateNumber: "29C-123.45",
        capacityTons: 5,
        status: "active"
      },
      {
        id: "vehicle-truck-02",
        code: "XE-02",
        plateNumber: "29H-678.90",
        capacityTons: 8,
        status: "active"
      }
    ],
    salesOrders: [
      {
        id: "so-001",
        documentNo: "SO-2026-0001",
        customerId: "cus-minh-anh",
        orderDate: "2026-07-16",
        status: "draft",
        version: 1,
        currency: "VND",
        lines: [
          {
            id: "so-001-line-cement",
            productUnitId: "pu-cement-bag",
            quantity: 120,
            deliveredQuantity: 0,
            unitPrice: 89000,
            taxRate: 0.08
          },
          {
            id: "so-001-line-sand",
            productUnitId: "pu-sand-m3",
            quantity: 18,
            deliveredQuantity: 0,
            unitPrice: 245000,
            taxRate: 0.08
          }
        ]
      }
    ],
    purchaseOrders: [
      {
        id: "po-001",
        documentNo: "PO-2026-0001",
        supplierId: "sup-hoang-thach",
        orderDate: "2026-07-16",
        status: "ordered",
        lines: [
          {
            id: "po-001-line-cement",
            productUnitId: "pu-cement-bag",
            orderedQuantity: 120,
            receivedQuantity: 0,
            unitCost: 76000,
            taxRate: 0.08,
            destinationType: "warehouse",
            warehouseId: "wh-main"
          }
        ]
      },
      {
        id: "po-002",
        documentNo: "PO-2026-0002",
        supplierId: "sup-cat-da-hai-an",
        orderDate: "2026-07-16",
        status: "ordered",
        lines: [
          {
            id: "po-002-line-sand",
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
    ],
    inventoryMovements: [
      {
        id: "im-opening-brick",
        movementType: "opening",
        sourceDocument: "OPENING-2026-07-16",
        postingKey: "opening-brick-2026-07-16",
        warehouseId: "wh-main",
        productUnitId: "pu-brick-vien",
        quantity: 10000,
        unitCost: 950,
        postedAt: "2026-07-16T07:00:00.000+07:00"
      }
    ],
    deliveryJobs: [
      {
        id: "dj-001",
        documentNo: "GH-2026-0001",
        salesOrderId: "so-001",
        driverId: "emp-driver-dung",
        vehicleId: "vehicle-truck-01",
        helperIds: ["emp-worker-nam", "emp-worker-hai"],
        plannedDate: "2026-07-16",
        status: "assigned"
      }
    ],
    approvalRequests: [],
    customerLedgerEntries: [],
    supplierLedgerEntries: [],
    employeeLedgerEntries: [],
    customerPayments: [
      {
        id: "cp-001",
        documentNo: "PT-2026-0001",
        customerId: "cus-minh-anh",
        amount: 10000000,
        status: "draft",
        allocations: []
      }
    ],
    supplierPayments: [
      {
        id: "sp-001",
        documentNo: "PC-NCC-2026-0001",
        supplierId: "sup-hoang-thach",
        amount: 8000000,
        status: "draft",
        allocations: []
      }
    ],
    employeePayments: [
      {
        id: "ep-001",
        documentNo: "PC-NV-2026-0001",
        employeeId: "emp-worker-nam",
        amount: 150000,
        status: "draft"
      }
    ],
    employeeAdvances: [],
    cashTransactions: [],
    cashVouchers: [],
    bankTransferProofs: [],
    workOrders: [
      {
        id: "wo-001",
        documentNo: "CV-2026-0001",
        sourceDocument: "GH-2026-0001",
        workType: "Bốc xếp xi măng",
        workDate: "2026-07-16",
        status: "submitted",
        outputs: [
          {
            id: "wo-001-output-cement",
            productUnitId: "pu-cement-bag",
            actualQuantity: 120,
            approvedQuantity: 0,
            status: "submitted"
          }
        ],
        participants: [
          {
            employeeId: "emp-worker-nam",
            shareFactor: 1
          },
          {
            employeeId: "emp-worker-hai",
            shareFactor: 1
          }
        ]
      }
    ],
    compensationBatches: [
      {
        id: "cb-001",
        documentNo: "LC-2026-0001",
        workOrderId: "wo-001",
        status: "draft",
        totalAmount: 360000,
        lines: []
      }
    ],
    importIssues: [
      {
        id: "imp-001",
        sourceSheet: "7.26",
        rowNumber: 145,
        severity: "error",
        message: "Ngày 14/07/2026 đang là text, cần chuẩn hóa trước import.",
        status: "open"
      },
      {
        id: "imp-002",
        sourceSheet: "6.26",
        rowNumber: 38,
        severity: "warning",
        message: "Sheet tháng 6 có bộ lọc khách hàng TUẤN LẠI.",
        status: "open"
      }
    ],
    importJobs: [],
    auditLogs: [
      {
        id: "audit-initial",
        actorId: "system",
        actorName: "Hệ thống",
        action: "OperationsStateCreated",
        entityType: "workspace",
        entityId: "full-erp",
        occurredAt: "2026-07-16T07:00:00.000+07:00",
        summary: "Khởi tạo dữ liệu vận hành cho Full ERP scope"
      }
    ],
    processedOperations: []
  };
}
