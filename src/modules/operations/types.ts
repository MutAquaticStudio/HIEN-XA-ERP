export type Currency = "VND";

export type UserRole =
  | "owner"
  | "administrator"
  | "accountant"
  | "sales"
  | "warehouse"
  | "dispatcher"
  | "driver"
  | "worker"
  | "supervisor"
  | "viewer";

export type OperationsActor = {
  id: string;
  displayName: string;
  role: UserRole;
  permissions: string[];
  warehouseIds?: string[];
};

export type Customer = {
  id: string;
  code: string;
  displayName: string;
  phone: string;
  creditLimit: number;
  status: "active" | "inactive";
};

export type Supplier = {
  id: string;
  code: string;
  displayName: string;
  phone: string;
  status: "active" | "inactive";
};

export type Employee = {
  id: string;
  code: string;
  displayName: string;
  roleType: "driver" | "worker" | "warehouse" | "sales" | "accountant" | "supervisor";
  status: "active" | "inactive";
};

export type ProductUnit = {
  id: string;
  productCode: string;
  productName: string;
  unitName: string;
  status: "active" | "inactive";
};

export type UnitDefinition = {
  id: string;
  name: string;
  status: "active" | "inactive";
};

export type PurchaseUnitConversionMode = "fixed" | "variable";

export type PurchaseUnitConversion = {
  id: string;
  productUnitId: string;
  unitId: string;
  conversionMode: PurchaseUnitConversionMode;
  factorToBase: number | null;
  version: number;
  updatedAt: string;
};

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
};

export type Vehicle = {
  id: string;
  code: string;
  plateNumber: string;
  capacityTons: number;
  status: "active" | "inactive";
};

export type MoneyTotals = {
  net: number;
  tax: number;
  gross: number;
};

export type DocumentUnitSnapshot = {
  unitName: string;
  baseUnitName: string;
  factorToBase: number;
  quantity: number;
  unitAmount: number;
  conversionMode?: PurchaseUnitConversionMode;
};

export type SalesSourceType = "warehouse" | "direct_supplier";

export type SalesOrderLine = {
  id: string;
  productUnitId: string;
  quantity: number;
  deliveredQuantity: number;
  unitPrice: number;
  taxRate: number;
  documentUnit?: DocumentUnitSnapshot;
  sourceType?: SalesSourceType;
  warehouseId?: string;
  purchaseOrderLineId?: string;
};

export type SalesOrderStatus = "draft" | "confirmed" | "allocated" | "partially_delivered" | "delivered";

export type SalesOrder = {
  id: string;
  documentNo: string;
  customerId: string;
  orderDate: string;
  status: SalesOrderStatus;
  version: number;
  currency: Currency;
  attachments?: OperationsAttachment[];
  lines: SalesOrderLine[];
};

export type PurchaseDestinationType = "warehouse" | "customer_direct";

export type PurchaseOrderLine = {
  id: string;
  productUnitId: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  taxRate: number;
  documentUnit?: DocumentUnitSnapshot;
  destinationType: PurchaseDestinationType;
  warehouseId?: string;
  customerId?: string;
  salesOrderLineId?: string;
};

export type PurchaseOrderStatus = "draft" | "ordered" | "partially_received" | "fully_received";

export type PurchaseOrder = {
  id: string;
  documentNo: string;
  supplierId: string;
  orderDate: string;
  status: PurchaseOrderStatus;
  attachments?: OperationsAttachment[];
  lines: PurchaseOrderLine[];
};

export type InventoryMovementType = "opening" | "receipt" | "issue" | "transfer_out" | "transfer_in" | "adjustment" | "reverse";

export type InventoryMovement = {
  id: string;
  movementType: InventoryMovementType;
  sourceDocument: string;
  postingKey: string;
  warehouseId: string;
  productUnitId: string;
  quantity: number;
  unitCost: number;
  postedAt: string;
  reversedById?: string;
  sourceLineId?: string;
  reason?: string;
  relatedMovementId?: string;
};

export type DeliveryJobStatus = "assigned" | "loading" | "in_transit" | "delivered" | "failed";

export type DeliveryJob = {
  id: string;
  documentNo: string;
  salesOrderId: string;
  driverId: string;
  vehicleId: string;
  helperIds: string[];
  plannedDate: string;
  status: DeliveryJobStatus;
  evidence?: string;
  recipientName?: string;
  completionAttachments?: OperationsAttachment[];
  failureReason?: string;
  confirmedAt?: string;
};

export type ApprovalRequestType = "goods_receipt" | "delivery_completion";
export type ApprovalRequestStatus = "pending" | "approved" | "rejected";

export type OperationsAttachment = {
  id: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  sha256: string;
  uploadedBy: string;
  uploadedAt: string;
};

export type OperationsApprovalRequest = {
  id: string;
  documentNo: string;
  type: ApprovalRequestType;
  targetId: string;
  status: ApprovalRequestStatus;
  quantity?: number;
  lineQuantities?: Record<string, number>;
  recipientName?: string;
  evidence?: string;
  attachments?: OperationsAttachment[];
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectionReason?: string;
};

export type LedgerEntryDirection = "debit" | "credit";

export type CustomerLedgerEntry = {
  id: string;
  customerId: string;
  sourceDocument: string;
  direction: LedgerEntryDirection;
  amount: number;
  netAmount?: number;
  taxAmount?: number;
  quantity?: number;
  sourceLineId?: string;
  postingGroupId?: string;
  entryType?: "sale_delivery" | "customer_payment" | "reversal";
  postingDate: string;
  reversedById?: string;
};

export type SupplierLedgerEntry = {
  id: string;
  supplierId: string;
  sourceDocument: string;
  direction: LedgerEntryDirection;
  amount: number;
  netAmount?: number;
  taxAmount?: number;
  quantity?: number;
  sourceLineId?: string;
  postingGroupId?: string;
  entryType?: "inventory_receipt" | "direct_delivery" | "supplier_payment" | "reversal";
  postingDate: string;
  reversedById?: string;
};

export type EmployeeLedgerEntry = {
  id: string;
  employeeId: string;
  sourceDocument: string;
  direction: LedgerEntryDirection;
  amount: number;
  entryType?: "compensation" | "advance" | "payment" | "reversal";
  postingDate: string;
  reversedById?: string;
};

export type CustomerPayment = {
  id: string;
  documentNo: string;
  customerId: string;
  amount: number;
  status: "draft" | "confirmed" | "partially_allocated" | "allocated" | "reversed";
  allocations: PaymentAllocation[];
};

export type SupplierPayment = {
  id: string;
  documentNo: string;
  supplierId: string;
  amount: number;
  status: "draft" | "confirmed" | "partially_allocated" | "allocated" | "reversed";
  allocations: PaymentAllocation[];
};

export type EmployeePayment = {
  id: string;
  documentNo: string;
  employeeId: string;
  amount: number;
  status: "draft" | "confirmed" | "reversed";
};

export type EmployeeAdvance = {
  id: string;
  documentNo: string;
  employeeId: string;
  purpose: string;
  amount: number;
  status: "draft" | "confirmed" | "reversed";
};

export type PaymentAllocation = {
  ledgerEntryId: string;
  amount: number;
};

export type CashTransaction = {
  id: string;
  accountName: string;
  sourceDocument: string;
  direction: "in" | "out";
  amount: number;
  postedAt: string;
};

export type CashVoucher = {
  id: string;
  documentNo: string;
  accountName: string;
  direction: "in" | "out";
  category: string;
  description: string;
  amount: number;
  status: "draft" | "confirmed" | "reversed";
};

export type WorkOrderStatus = "open" | "assigned" | "submitted" | "approved" | "compensated" | "paid";

export type WorkOutput = {
  id: string;
  productUnitId: string;
  actualQuantity: number;
  approvedQuantity: number;
  status: "submitted" | "approved" | "compensated";
};

export type WorkOrderLocationPoint = {
  employeeId: string;
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  source?: "gps" | "manual";
};

export type WorkParticipant = {
  employeeId: string;
  shareFactor: number;
};

export type WorkOrder = {
  id: string;
  documentNo: string;
  sourceDocument: string;
  salesOrderId?: string;
  workType: string;
  workDate: string;
  status: WorkOrderStatus;
  version?: number;
  claimedByEmployeeId?: string;
  claimedAt?: string;
  locationHistory?: WorkOrderLocationPoint[];
  outputs: WorkOutput[];
  participants: WorkParticipant[];
};

export type CompensationLine = {
  workOutputId: string;
  employeeId: string;
  amount: number;
};

export type CompensationBatch = {
  id: string;
  documentNo: string;
  workOrderId: string;
  status: "draft" | "posted";
  totalAmount: number;
  lines: CompensationLine[];
};

export type ImportIssue = {
  id: string;
  importJobId?: string;
  sourceSheet: string;
  rowNumber: number;
  severity: "warning" | "error";
  message: string;
  status: "open" | "resolved" | "ignored";
};

export type ImportJob = {
  id: string;
  fileName: string;
  fileHash: string;
  sheetNames: string[];
  rowCount: number;
  issueCount: number;
  status: "dry_run" | "reviewed";
  createdAt: string;
};

export type AuditLog = {
  id: string;
  actorId: string;
  actorName: string;
  actorRole?: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  permission?: string;
  targetId?: string;
  occurredAt: string;
  summary: string;
  reason?: string;
  correlationId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export type ProcessedOperation = {
  idempotencyKey: string;
  operation: DomainCommandName;
  summary: string;
};

export type CreateCommandName =
  | "createCustomer"
  | "createSupplier"
  | "createProductUnit"
  | "createUnitDefinition"
  | "deleteUnitDefinition"
  | "resetPurchaseUnitSettings"
  | "upsertPurchaseUnitConversion"
  | "deletePurchaseUnitConversion"
  | "createWarehouse"
  | "createVehicle"
  | "createEmployee"
  | "createSalesOrderDraft"
  | "createPurchaseOrderDraft"
  | "createDeliveryJob"
  | "createCustomerPaymentDraft"
  | "createSupplierPaymentDraft"
  | "createCashVoucherDraft"
  | "createEmployeePaymentDraft"
  | "createEmployeeAdvanceDraft"
  | "createWorkOrderDraft"
  | "createImportDryRun"
  | "createImportIssue";

export type DomainCommandName = OperationName | CreateCommandName;

export type OperationName =
  | "confirmSalesOrder"
  | "recordWorkOrderLocation"
  | "claimOpenSalesWorkOrder"
  | "allocateSalesSources"
  | "confirmPurchaseOrder"
  | "submitGoodsReceipt"
  | "approveGoodsReceipt"
  | "rejectGoodsReceipt"
  | "postGoodsReceipt"
  | "reverseInventoryMovement"
  | "postInventoryTransfer"
  | "postInventoryCountAdjustment"
  | "confirmDirectDelivery"
  | "reverseDirectDelivery"
  | "startDeliveryLoading"
  | "dispatchDelivery"
  | "submitDeliveryCompletion"
  | "approveDeliveryCompletion"
  | "rejectDeliveryCompletion"
  | "completeDelivery"
  | "failDelivery"
  | "confirmCustomerPayment"
  | "allocateCustomerPayment"
  | "reverseCustomerPayment"
  | "confirmSupplierPayment"
  | "allocateSupplierPayment"
  | "reverseSupplierPayment"
  | "confirmCashVoucher"
  | "reverseCashVoucher"
  | "approveWorkOutput"
  | "postCompensation"
  | "payEmployee"
  | "reverseEmployeePayment"
  | "confirmEmployeeAdvance"
  | "reverseEmployeeAdvance"
  | "resolveImportIssue"
  | "ignoreImportIssue";

export type OperationsState = {
  customers: Customer[];
  suppliers: Supplier[];
  employees: Employee[];
  productUnits: ProductUnit[];
  unitDefinitions: UnitDefinition[];
  purchaseUnitConversions: PurchaseUnitConversion[];
  warehouses: Warehouse[];
  vehicles: Vehicle[];
  salesOrders: SalesOrder[];
  purchaseOrders: PurchaseOrder[];
  inventoryMovements: InventoryMovement[];
  deliveryJobs: DeliveryJob[];
  approvalRequests: OperationsApprovalRequest[];
  customerLedgerEntries: CustomerLedgerEntry[];
  supplierLedgerEntries: SupplierLedgerEntry[];
  employeeLedgerEntries: EmployeeLedgerEntry[];
  customerPayments: CustomerPayment[];
  supplierPayments: SupplierPayment[];
  employeePayments: EmployeePayment[];
  employeeAdvances: EmployeeAdvance[];
  cashTransactions: CashTransaction[];
  cashVouchers: CashVoucher[];
  workOrders: WorkOrder[];
  compensationBatches: CompensationBatch[];
  importIssues: ImportIssue[];
  importJobs: ImportJob[];
  auditLogs: AuditLog[];
  processedOperations: ProcessedOperation[];
};

export type OperationResult = {
  state: OperationsState;
  summary: string;
  severity: "success" | "warning";
};

export type OperationOptions = {
  expectedVersion?: number;
  location?: {
    latitude: number;
    longitude: number;
    recordedAt?: string;
    accuracyMeters?: number;
    source?: "gps" | "manual";
  };
  quantity?: number;
  lineQuantities?: Record<string, number>;
  recipientName?: string;
  evidence?: string;
  attachments?: OperationsAttachment[];
  reason?: string;
  sourceWarehouseId?: string;
  destinationWarehouseId?: string;
  warehouseId?: string;
  productUnitId?: string;
  countedQuantity?: number;
  allocations?: PaymentAllocation[];
};

export type OperationsSnapshot = {
  state: OperationsState;
  revision: number;
  syncedAt: string;
  source: "memory" | "file" | "postgres";
};

export type SalesOrderDraftLineInput = {
  productUnitId: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  unitName?: string;
  unitFactor?: number;
};

export type PurchaseOrderDraftLineInput = {
  productUnitId: string;
  orderedQuantity: number;
  unitCost: number;
  taxRate: number;
  unitName?: string;
  unitFactor?: number;
  actualBaseQuantity?: number;
  destinationType: PurchaseDestinationType;
  customerId?: string;
};

export type CreateCommand =
  | {
      type: "createCustomer";
      displayName: string;
      phone: string;
      creditLimit: number;
    }
  | {
      type: "createSupplier";
      displayName: string;
      phone: string;
    }
  | {
      type: "createProductUnit";
      productCode: string;
      productName: string;
      unitName: string;
    }
  | {
      type: "createUnitDefinition";
      name: string;
    }
  | {
      type: "deleteUnitDefinition";
      unitId: string;
    }
  | {
      type: "resetPurchaseUnitSettings";
      expectedCustomUnitCount: number;
      expectedConversionCount: number;
    }
  | {
      type: "upsertPurchaseUnitConversion";
      productUnitId: string;
      unitId: string;
      conversionMode: PurchaseUnitConversionMode;
      factorToBase?: number;
      expectedVersion?: number;
    }
  | {
      type: "deletePurchaseUnitConversion";
      conversionId: string;
      expectedVersion: number;
    }
  | {
      type: "createWarehouse";
      code: string;
      name: string;
    }
  | {
      type: "createVehicle";
      code: string;
      plateNumber: string;
      capacityTons: number;
    }
  | {
      type: "createEmployee";
      displayName: string;
      roleType: Employee["roleType"];
    }
  | {
      type: "createSalesOrderDraft";
      customerId: string;
      attachments?: OperationsAttachment[];
      lines?: SalesOrderDraftLineInput[];
      productUnitId?: string;
      quantity?: number;
      unitPrice?: number;
      taxRate?: number;
    }
  | {
      type: "createPurchaseOrderDraft";
      supplierId: string;
      attachments?: OperationsAttachment[];
      lines?: PurchaseOrderDraftLineInput[];
      productUnitId?: string;
      orderedQuantity?: number;
      unitCost?: number;
      taxRate?: number;
      destinationType?: PurchaseDestinationType;
      customerId?: string;
    }
  | {
      type: "createDeliveryJob";
      salesOrderId: string;
      driverId: string;
      vehicleId: string;
      plannedDate: string;
    }
  | {
      type: "createCustomerPaymentDraft";
      customerId: string;
      amount: number;
    }
  | {
      type: "createSupplierPaymentDraft";
      supplierId: string;
      amount: number;
    }
  | {
      type: "createCashVoucherDraft";
      direction: "in" | "out";
      category: string;
      description: string;
      amount: number;
    }
  | {
      type: "createEmployeePaymentDraft";
      employeeId: string;
      amount: number;
    }
  | {
      type: "createEmployeeAdvanceDraft";
      employeeId: string;
      purpose: string;
      amount: number;
    }
  | {
      type: "createWorkOrderDraft";
      employeeId: string;
      productUnitId: string;
      actualQuantity: number;
      totalAmount: number;
    }
  | {
      type: "createImportIssue";
      sourceSheet: string;
      rowNumber: number;
      severity: ImportIssue["severity"];
      message: string;
    }
  | {
      type: "createImportDryRun";
      fileName: string;
      fileHash: string;
      sheetNames: string[];
      rowCount: number;
      issues: Array<{
        sourceSheet: string;
        rowNumber: number;
        severity: ImportIssue["severity"];
        message: string;
      }>;
    };
