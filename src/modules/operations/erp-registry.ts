import { createOdooMetadata } from "@/erp/framework/odoo";
import { createErpRegistry } from "@/erp/framework/registry";
import type { ErpCommandDefinition, ErpModuleDefinition } from "@/erp/framework/types";
import type { DomainCommandName, OperationName } from "./types";

export type OperationsModuleId =
  | "overview"
  | "masterData"
  | "sales"
  | "procurement"
  | "delivery"
  | "inventory"
  | "receivables"
  | "payables"
  | "cash"
  | "workforce"
  | "import"
  | "audit"
  | "reporting";

const workflowOperationSequence: OperationName[] = [
  "confirmSalesOrder",
  "allocateSalesSources",
  "confirmPurchaseOrder",
  "submitGoodsReceipt",
  "approveGoodsReceipt",
  "rejectGoodsReceipt",
  "postGoodsReceipt",
  "reverseInventoryMovement",
  "postInventoryTransfer",
  "postInventoryCountAdjustment",
  "confirmDirectDelivery",
  "reverseDirectDelivery",
  "startDeliveryLoading",
  "dispatchDelivery",
  "submitDeliveryCompletion",
  "approveDeliveryCompletion",
  "rejectDeliveryCompletion",
  "completeDelivery",
  "failDelivery",
  "confirmCustomerPayment",
  "allocateCustomerPayment",
  "reverseCustomerPayment",
  "confirmSupplierPayment",
  "allocateSupplierPayment",
  "reverseSupplierPayment",
  "confirmCashVoucher",
  "reverseCashVoucher",
  "approveWorkOutput",
  "postCompensation",
  "payEmployee",
  "reverseEmployeePayment",
  "confirmEmployeeAdvance",
  "reverseEmployeeAdvance",
  "resolveImportIssue",
  "ignoreImportIssue"
];

const operationDisplaySequence: OperationName[] = [
  ...workflowOperationSequence,
  "recordWorkOrderLocation",
  "claimOpenSalesWorkOrder"
];

function command(
  definition: ErpCommandDefinition<DomainCommandName>
): ErpCommandDefinition<DomainCommandName> {
  return definition;
}

export const operationsErpModules = [
  {
    id: "overview",
    technicalName: "vlxd.overview",
    label: "Tá»•ng quan",
    title: "Tá»•ng quan váº­n hÃ nh",
    subtitle: "Theo dÃµi luá»“ng bÃ¡n, mua, kho, cÃ´ng ná»£, dÃ²ng tiá»n vÃ  nhÃ¢n cÃ´ng tá»« cÃ¹ng má»™t nguá»“n dá»¯ liá»‡u.",
    iconKey: "home",
    menuOrder: 10,
    ownerContext: "reporting",
    ownedEntities: [],
    readModels: ["daily_operations_dashboard_view"],
    commands: [],
    workflows: [],
    invariants: ["Tá»•ng quan chá»‰ Ä‘á»c tá»« mÃ´ hÃ¬nh tá»•ng há»£p, khÃ´ng ghi giao dá»‹ch."]
  },
  {
    id: "masterData",
    technicalName: "vlxd.master_data",
    label: "Danh má»¥c",
    title: "Danh má»¥c ná»n",
    subtitle: "KhÃ¡ch hÃ ng, nhÃ  cung cáº¥p, váº­t tÆ°, kho, xe vÃ  nhÃ¢n sá»± dÃ¹ng chung cho luá»“ng nghiá»‡p vá»¥.",
    iconKey: "database",
    menuOrder: 20,
    ownerContext: "parties_catalog",
    ownedEntities: ["Customer", "Supplier", "ProductUnit", "UnitDefinition", "PurchaseUnitConversion", "Warehouse", "Vehicle", "Employee"],
    readModels: [],
    commands: [
      command({
        name: "createCustomer",
        label: "Táº¡o khÃ¡ch hÃ ng",
        description: "Táº¡o customer master data sau khi kiá»ƒm tra trÃ¹ng tÃªn.",
        kind: "create",
        criticality: "normal",
        permission: "parties.create_customer",
        idempotent: true,
        auditEvent: "CustomerCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createSupplier",
        label: "Táº¡o nhÃ  cung cáº¥p",
        description: "Táº¡o supplier master data sau khi kiá»ƒm tra trÃ¹ng tÃªn.",
        kind: "create",
        criticality: "normal",
        permission: "parties.create_supplier",
        idempotent: true,
        auditEvent: "SupplierCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createProductUnit",
        label: "Táº¡o váº­t tÆ°",
        description: "Táº¡o product-unit dÃ¹ng lÃ m khÃ³a giao dá»‹ch, khÃ´ng tra theo tÃªn váº­t tÆ° tá»± do.",
        kind: "create",
        criticality: "normal",
        permission: "catalog.create_product_unit",
        idempotent: true,
        auditEvent: "ProductUnitCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createUnitDefinition",
        label: "ThÃªm Ä‘Æ¡n vá»‹",
        description: "ThÃªm Ä‘Æ¡n vá»‹ dÃ¹ng chung do cá»­a hÃ ng tá»± quáº£n lÃ½.",
        kind: "create",
        criticality: "normal",
        permission: "catalog.manage_purchase_units",
        idempotent: true,
        auditEvent: "UnitDefinitionCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "deleteUnitDefinition",
        label: "XÃ³a Ä‘Æ¡n vá»‹",
        description: "XÃ³a Ä‘Æ¡n vá»‹ khÃ´ng pháº£i Ä‘Æ¡n vá»‹ tá»“n kho gá»‘c vÃ  dá»n quy Ä‘á»•i hiá»‡n táº¡i liÃªn quan.",
        kind: "workflow",
        criticality: "normal",
        permission: "catalog.manage_purchase_units",
        idempotent: true,
        auditEvent: "UnitDefinitionDeleted",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "resetPurchaseUnitSettings",
        label: "XÃ³a cÃ i Ä‘áº·t Ä‘Æ¡n vá»‹ mua",
        description: "XÃ³a Ä‘Æ¡n vá»‹ mua vÃ  cÃ¡ch tÃ­nh hiá»‡n táº¡i, giá»¯ nguyÃªn Ä‘Æ¡n vá»‹ tá»“n kho vÃ  snapshot chá»©ng tá»« lá»‹ch sá»­.",
        kind: "workflow",
        criticality: "inventory",
        permission: "catalog.manage_purchase_units",
        idempotent: true,
        auditEvent: "PurchaseUnitSettingsReset",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "upsertPurchaseUnitConversion",
        label: "LÆ°u cÃ¡ch tÃ­nh Ä‘Æ¡n vá»‹ mua",
        description: "Cáº¥u hÃ¬nh quy Ä‘á»•i cá»‘ Ä‘á»‹nh hoáº·c nháº­p sá»‘ lÆ°á»£ng tá»“n kho thá»±c táº¿ theo tá»«ng láº§n mua.",
        kind: "workflow",
        criticality: "inventory",
        permission: "catalog.manage_purchase_units",
        idempotent: true,
        auditEvent: "PurchaseUnitConversionSaved",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "deletePurchaseUnitConversion",
        label: "XÃ³a quy Ä‘á»•i Ä‘Æ¡n vá»‹ mua",
        description: "XÃ³a quy Ä‘á»•i hiá»‡n táº¡i nhÆ°ng giá»¯ nguyÃªn snapshot trÃªn chá»©ng tá»« lá»‹ch sá»­.",
        kind: "workflow",
        criticality: "inventory",
        permission: "catalog.manage_purchase_units",
        idempotent: true,
        auditEvent: "PurchaseUnitConversionDeleted",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createWarehouse",
        label: "Táº¡o kho",
        description: "Táº¡o kho hoáº·c bÃ£i lÃ m Ä‘iá»ƒm sá»Ÿ há»¯u tá»“n kho Ä‘á»™c láº­p.",
        kind: "create",
        criticality: "normal",
        permission: "catalog.create_warehouse",
        idempotent: true,
        auditEvent: "WarehouseCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createVehicle",
        label: "Táº¡o xe",
        description: "Táº¡o phÆ°Æ¡ng tiá»‡n giao hÃ ng vá»›i biá»ƒn sá»‘ vÃ  táº£i trá»ng dÃ¹ng cho Ä‘iá»u phá»‘i.",
        kind: "create",
        criticality: "normal",
        permission: "catalog.create_vehicle",
        idempotent: true,
        auditEvent: "VehicleCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createEmployee",
        label: "Táº¡o nhÃ¢n sá»±",
        description: "Táº¡o nhÃ¢n viÃªn váº­n hÃ nh Ä‘á»ƒ phÃ¢n cÃ´ng giao hÃ ng, kho, káº¿ toÃ¡n hoáº·c cÃ´ng viá»‡c.",
        kind: "create",
        criticality: "normal",
        permission: "parties.create_employee",
        idempotent: true,
        auditEvent: "EmployeeCreated",
        transactionBoundary: "single_aggregate"
      })
    ],
    workflows: [],
    invariants: [
      "TÃªn/mÃ£ danh má»¥c pháº£i Ä‘Æ°á»£c chuáº©n hÃ³a Ä‘á»ƒ tÃ¬m kiáº¿m khÃ´ng dáº¥u vÃ  trÃ¡nh trÃ¹ng.",
      "Quy Ä‘á»•i Ä‘Æ¡n vá»‹ mua pháº£i duy nháº¥t theo váº­t tÆ°/Ä‘Æ¡n vá»‹ vÃ  cÃ³ há»‡ sá»‘ dÆ°Æ¡ng.",
      "KhÃ´ng xÃ³a Ä‘Æ¡n vá»‹ Ä‘ang lÃ  Ä‘Æ¡n vá»‹ tá»“n kho gá»‘c cá»§a váº­t tÆ°."
    ]
  },
  {
    id: "sales",
    technicalName: "vlxd.sales",
    label: "BÃ¡n hÃ ng",
    title: "BÃ¡n hÃ ng",
    subtitle: "XÃ¡c nháº­n Ä‘Æ¡n, khÃ³a giÃ¡ vÃ  phÃ¢n bá»• nguá»“n hÃ ng trÆ°á»›c khi giao.",
    iconKey: "shopping-cart",
    menuOrder: 30,
    ownerContext: "sales",
    ownedEntities: ["SalesOrder", "SalesOrderLine"],
    readModels: ["order_fulfillment_view"],
    commands: [
      command({
        name: "createSalesOrderDraft",
        label: "Táº¡o Ä‘Æ¡n bÃ¡n",
        description: "Táº¡o Ä‘Æ¡n bÃ¡n nhÃ¡p vá»›i áº£nh chá»¥p giÃ¡ theo tá»«ng dÃ²ng hÃ ng.",
        kind: "create",
        criticality: "normal",
        permission: "sales.create",
        idempotent: true,
        auditEvent: "SalesOrderDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "confirmSalesOrder",
        label: "XÃ¡c nháº­n Ä‘Æ¡n bÃ¡n",
        description: "KhÃ³a áº£nh chá»¥p giÃ¡, tÄƒng phiÃªn báº£n, chÆ°a ghi cÃ´ng ná»£.",
        kind: "workflow",
        criticality: "normal",
        permission: "sales.confirm",
        idempotent: true,
        auditEvent: "SalesOrderConfirmed",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "allocateSalesSources",
        label: "PhÃ¢n bá»• nguá»“n hÃ ng",
        description: "Chia dÃ²ng bÃ¡n: hÃ ng qua kho vÃ  hÃ ng giao tháº³ng.",
        kind: "workflow",
        criticality: "inventory",
        permission: "sales.allocate_source",
        idempotent: true,
        auditEvent: "SalesSourceAllocated",
        transactionBoundary: "cross_module"
      })
    ],
    workflows: [
      {
        name: "Sales order",
        entity: "SalesOrder",
        states: ["draft", "confirmed", "allocated", "partially_delivered", "delivered"],
        transitions: [
          { from: "draft", to: "confirmed", command: "confirmSalesOrder" },
          { from: "confirmed", to: "allocated", command: "allocateSalesSources" }
        ]
      }
    ],
    invariants: ["ÄÆ¡n bÃ¡n Ä‘Ã£ xÃ¡c nháº­n pháº£i giá»¯ áº£nh chá»¥p giÃ¡.", "CÃ´ng ná»£ chá»‰ phÃ¡t sinh khi giao hÃ ng Ä‘Æ°á»£c xÃ¡c nháº­n."]
  },
  {
    id: "procurement",
    technicalName: "vlxd.procurement",
    label: "Mua hÃ ng",
    title: "Mua hÃ ng",
    subtitle: "Nháº­p kho hoáº·c giao tháº³ng khÃ¡ch, ghi pháº£i tráº£ theo chá»©ng tá»« nguá»“n.",
    iconKey: "boxes",
    menuOrder: 40,
    ownerContext: "procurement",
    ownedEntities: ["PurchaseOrder", "PurchaseOrderLine"],
    readModels: [],
    commands: [
      command({
        name: "createPurchaseOrderDraft",
        label: "Táº¡o Ä‘Æ¡n mua",
        description: "Táº¡o Ä‘Æ¡n mua nhÃ¡p vá»›i Ä‘iá»ƒm nháº­n lÃ  kho hoáº·c giao tháº³ng khÃ¡ch.",
        kind: "create",
        criticality: "normal",
        permission: "procurement.create",
        idempotent: true,
        auditEvent: "PurchaseOrderDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "confirmPurchaseOrder",
        label: "XÃ¡c nháº­n Ä‘Æ¡n mua",
        description: "KhÃ³a giÃ¡ mua vÃ  Ä‘iá»ƒm nháº­n trÆ°á»›c khi nháº­p kho hoáº·c giao tháº³ng.",
        kind: "workflow",
        criticality: "normal",
        permission: "procurement.confirm",
        idempotent: true,
        auditEvent: "PurchaseOrderConfirmed",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "submitGoodsReceipt",
        label: "Gá»­i phiáº¿u nháº­p chá» duyá»‡t",
        description: "Thá»£ gá»­i sá»‘ lÆ°á»£ng thá»±c nháº­n Ä‘á»ƒ Chá»§ cá»­a hÃ ng hoáº·c Káº¿ toÃ¡n duyá»‡t trÆ°á»›c khi ghi kho vÃ  cÃ´ng ná»£.",
        kind: "workflow",
        criticality: "inventory",
        permission: "inventory.submit_receipt",
        idempotent: true,
        auditEvent: "GoodsReceiptSubmittedForApproval",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "approveGoodsReceipt",
        label: "Duyá»‡t phiáº¿u nháº­p",
        description: "Duyá»‡t phiáº¿u nháº­p Ä‘Ã£ gá»­i vÃ  post inventory movement cÃ¹ng pháº£i tráº£ trong má»™t transaction.",
        kind: "posting",
        criticality: "inventory",
        permission: "inventory.approve_receipt",
        idempotent: true,
        auditEvent: "GoodsReceiptApproved",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "rejectGoodsReceipt",
        label: "Tá»« chá»‘i phiáº¿u nháº­p",
        description: "Tá»« chá»‘i phiáº¿u nháº­p chá» duyá»‡t, báº¯t buá»™c ghi lÃ½ do vÃ  khÃ´ng táº¡o phÃ¡t sinh kho.",
        kind: "workflow",
        criticality: "inventory",
        permission: "inventory.reject_receipt",
        idempotent: true,
        auditEvent: "GoodsReceiptRejected",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "postGoodsReceipt",
        label: "Post nháº­p kho",
        description: "Táº¡o phiáº¿u nháº­p kho vÃ  ghi tÄƒng pháº£i tráº£ nhÃ  cung cáº¥p.",
        kind: "posting",
        criticality: "inventory",
        permission: "inventory.post_receipt",
        idempotent: true,
        auditEvent: "GoodsReceiptPosted",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "confirmDirectDelivery",
        label: "XÃ¡c nháº­n giao tháº³ng",
        description: "Ghi pháº£i thu/pháº£i tráº£, khÃ´ng táº¡o phÃ¡t sinh kho.",
        kind: "posting",
        criticality: "financial",
        permission: "delivery.confirm_direct",
        idempotent: true,
        auditEvent: "DirectDeliveryConfirmed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "reverseDirectDelivery",
        label: "Äáº£o giao tháº³ng",
        description: "Äáº£o láº§n giao tháº³ng gáº§n nháº¥t báº±ng bÃºt toÃ¡n pháº£i thu/pháº£i tráº£ ngÆ°á»£c, khÃ´ng táº¡o phÃ¡t sinh kho.",
        kind: "posting",
        criticality: "financial",
        permission: "delivery.reverse_direct",
        idempotent: true,
        auditEvent: "DirectDeliveryReversed",
        transactionBoundary: "cross_module"
      })
    ],
    workflows: [
      {
        name: "Purchase order",
        entity: "PurchaseOrder",
        states: ["draft", "ordered", "partially_received", "fully_received"],
        transitions: [
          { from: "draft", to: "ordered", command: "confirmPurchaseOrder" },
          { from: "ordered", to: "fully_received", command: "postGoodsReceipt" },
          { from: "ordered", to: "fully_received", command: "confirmDirectDelivery" },
          { from: "fully_received", to: "partially_received", command: "reverseDirectDelivery" }
        ]
      }
    ],
    invariants: ["Giao tháº³ng khÃ´ng táº¡o phÃ¡t sinh kho táº¡i kho cá»­a hÃ ng.", "Sá»‘ lÆ°á»£ng Ä‘Ã£ nháº­n khÃ´ng vÆ°á»£t sá»‘ lÆ°á»£ng Ä‘áº·t mua."]
  },
  {
    id: "delivery",
    technicalName: "vlxd.delivery",
    label: "Giao hÃ ng",
    title: "Giao hÃ ng",
    subtitle: "Äiá»u phá»‘i chuyáº¿n, xÃ¡c nháº­n giao, táº¡o háº­u quáº£ kho vÃ  cÃ´ng ná»£.",
    iconKey: "truck",
    menuOrder: 50,
    ownerContext: "delivery",
    ownedEntities: ["DeliveryJob"],
    readModels: [],
    commands: [
      command({
        name: "createDeliveryJob",
        label: "Táº¡o chuyáº¿n giao",
        description: "Táº¡o chuyáº¿n giao Ä‘Æ°á»£c phÃ¢n cÃ´ng tÃ i xáº¿ vÃ  xe, cÃ³ kiá»ƒm tra trÃ¹ng lá»‹ch, chÆ°a ghi xuáº¥t kho.",
        kind: "create",
        criticality: "normal",
        permission: "delivery.create",
        idempotent: true,
        auditEvent: "DeliveryJobCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "startDeliveryLoading",
        label: "Báº¯t Ä‘áº§u bá»‘c hÃ ng",
        description: "Chuyá»ƒn chuyáº¿n giao tá»« Ä‘Ã£ phÃ¢n cÃ´ng sang Ä‘ang bá»‘c hÃ ng, chÆ°a ghi xuáº¥t kho.",
        kind: "workflow",
        criticality: "inventory",
        permission: "delivery.start_loading",
        idempotent: true,
        auditEvent: "DeliveryLoadingStarted",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "dispatchDelivery",
        label: "Xuáº¥t báº¿n",
        description: "XÃ¡c nháº­n chuyáº¿n giao Ä‘Ã£ xuáº¥t báº¿n, chá» káº¿t quáº£ giao thá»±c táº¿.",
        kind: "workflow",
        criticality: "inventory",
        permission: "delivery.dispatch",
        idempotent: true,
        auditEvent: "DeliveryDispatched",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "submitDeliveryCompletion",
        label: "Gá»­i xÃ¡c nháº­n giao chá» duyá»‡t",
        description: "Thá»£ gá»­i ngÆ°á»i nháº­n, báº±ng chá»©ng vÃ  sá»‘ lÆ°á»£ng thá»±c giao; chÆ°a xuáº¥t kho hoáº·c ghi cÃ´ng ná»£.",
        kind: "workflow",
        criticality: "financial",
        permission: "delivery.submit_completion",
        idempotent: true,
        auditEvent: "DeliveryCompletionSubmittedForApproval",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "approveDeliveryCompletion",
        label: "Duyá»‡t xÃ¡c nháº­n giao",
        description: "Duyá»‡t xÃ¡c nháº­n giao cá»§a thá»£ vÃ  post xuáº¥t kho cÃ¹ng pháº£i thu trong má»™t transaction.",
        kind: "posting",
        criticality: "financial",
        permission: "delivery.approve_completion",
        idempotent: true,
        auditEvent: "DeliveryCompletionApproved",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "rejectDeliveryCompletion",
        label: "Tá»« chá»‘i xÃ¡c nháº­n giao",
        description: "Tá»« chá»‘i xÃ¡c nháº­n giao chá» duyá»‡t, báº¯t buá»™c ghi lÃ½ do vÃ  giá»¯ chuyáº¿n á»Ÿ tráº¡ng thÃ¡i Ä‘ang giao.",
        kind: "workflow",
        criticality: "financial",
        permission: "delivery.reject_completion",
        idempotent: true,
        auditEvent: "DeliveryCompletionRejected",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "completeDelivery",
        label: "HoÃ n táº¥t giao tá»« kho",
        description: "Ghi xuáº¥t kho chá»‰ ghi thÃªm vÃ  ghi pháº£i thu pháº§n giao tá»« kho.",
        kind: "posting",
        criticality: "financial",
        permission: "delivery.complete",
        idempotent: true,
        auditEvent: "DeliveryCompleted",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "failDelivery",
        label: "BÃ¡o giao tháº¥t báº¡i",
        description: "KhÃ³a chuyáº¿n giao tháº¥t báº¡i, khÃ´ng ghi xuáº¥t kho vÃ  khÃ´ng ghi cÃ´ng ná»£.",
        kind: "workflow",
        criticality: "normal",
        permission: "delivery.fail",
        idempotent: true,
        auditEvent: "DeliveryFailed",
        transactionBoundary: "single_aggregate"
      })
    ],
    workflows: [
      {
        name: "Delivery job",
        entity: "DeliveryJob",
        states: ["assigned", "loading", "in_transit", "delivered", "failed"],
        transitions: [
          { from: "assigned", to: "loading", command: "startDeliveryLoading" },
          { from: "loading", to: "in_transit", command: "dispatchDelivery" },
          { from: "in_transit", to: "delivered", command: "completeDelivery" },
          { from: "assigned", to: "failed", command: "failDelivery" },
          { from: "loading", to: "failed", command: "failDelivery" },
          { from: "in_transit", to: "failed", command: "failDelivery" }
        ]
      }
    ],
    invariants: ["HoÃ n táº¥t giao tá»« kho pháº£i kiá»ƒm tra tá»“n kháº£ dá»¥ng trÆ°á»›c khi xuáº¥t.", "Chuyáº¿n giao tháº¥t báº¡i khÃ´ng Ä‘Æ°á»£c ghi xuáº¥t kho hoáº·c cÃ´ng ná»£.", "Má»™t tÃ i xáº¿ hoáº·c xe khÃ´ng cÃ³ hai chuyáº¿n Ä‘ang hoáº¡t Ä‘á»™ng trong cÃ¹ng ngÃ y."]
  },
  {
    id: "inventory",
    technicalName: "vlxd.inventory",
    label: "Kho",
    title: "Kho",
    subtitle: "Tá»“n kho Ä‘Æ°á»£c tÃ­nh tá»« cÃ¡c phÃ¡t sinh kho chá»‰ ghi thÃªm.",
    iconKey: "warehouse",
    menuOrder: 60,
    ownerContext: "inventory",
    ownedEntities: ["InventoryMovement"],
    readModels: ["stock_balance_view", "available_stock_view"],
    commands: [
      command({
        name: "postInventoryTransfer",
        label: "Chuyá»ƒn kho",
        description: "Ghi Ä‘á»“ng thá»i xuáº¥t kho nguá»“n vÃ  nháº­p kho Ä‘Ã­ch báº±ng má»™t chá»©ng tá»« liÃªn káº¿t.",
        kind: "posting",
        criticality: "inventory",
        permission: "inventory.post_transfer",
        idempotent: true,
        auditEvent: "InventoryTransferPosted",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "postInventoryCountAdjustment",
        label: "Äiá»u chá»‰nh kiá»ƒm kÃª",
        description: "So sÃ¡nh tá»“n sá»• vá»›i sá»‘ Ä‘áº¿m thá»±c táº¿ vÃ  ghi movement chÃªnh lá»‡ch cÃ³ lÃ½ do.",
        kind: "posting",
        criticality: "inventory",
        permission: "inventory.post_count_adjustment",
        idempotent: true,
        auditEvent: "InventoryCountAdjustmentPosted",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "reverseInventoryMovement",
        label: "Äáº£o phÃ¡t sinh kho",
        description: "Ghi movement ngÆ°á»£c chiá»u cho phÃ¡t sinh kho Ä‘Ã£ post vÃ  Ä‘áº£o cÃ´ng ná»£ liÃªn quan.",
        kind: "posting",
        criticality: "inventory",
        permission: "inventory.reverse_movement",
        idempotent: true,
        auditEvent: "InventoryMovementReversed",
        transactionBoundary: "cross_module"
      })
    ],
    workflows: [
      {
        name: "Inventory movement",
        entity: "InventoryMovement",
        states: ["posted", "reversed"],
        transitions: [{ from: "posted", to: "reversed", command: "reverseInventoryMovement" }]
      }
    ],
    invariants: ["Giao diá»‡n khÃ´ng sá»­a trá»±c tiáº¿p sá»‘ dÆ° tá»“n kho.", "PhÃ¡t sinh kho Ä‘Ã£ ghi nháº­n chá»‰ Ä‘Æ°á»£c ghi Ä‘áº£o."]
  },
  {
    id: "receivables",
    technicalName: "vlxd.receivables",
    label: "CÃ´ng ná»£ KH",
    title: "CÃ´ng ná»£ khÃ¡ch hÃ ng",
    subtitle: "Sá»‘ dÆ° pháº£i thu tÃ­nh tá»« sá»• cÃ´ng ná»£ vÃ  phÃ¢n bá»• thanh toÃ¡n.",
    iconKey: "wallet-cards",
    menuOrder: 70,
    ownerContext: "receivables",
    ownedEntities: ["CustomerLedgerEntry", "CustomerPayment"],
    readModels: ["customer_balance_view"],
    commands: [
      command({
        name: "createCustomerPaymentDraft",
        label: "Táº¡o phiáº¿u thu",
        description: "Táº¡o phiáº¿u thu nhÃ¡p, chÆ°a ghi quá»¹ hoáº·c sá»• cÃ´ng ná»£ khÃ¡ch hÃ ng.",
        kind: "create",
        criticality: "financial",
        permission: "cash.create_receipt",
        idempotent: true,
        auditEvent: "CustomerPaymentDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "confirmCustomerPayment",
        label: "XÃ¡c nháº­n phiáº¿u thu",
        description: "Ghi tÄƒng quá»¹ vÃ  giáº£m cÃ´ng ná»£ pháº£i thu.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.confirm_receipt",
        idempotent: true,
        auditEvent: "CustomerPaymentConfirmed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "allocateCustomerPayment",
        label: "PhÃ¢n bá»• phiáº¿u thu",
        description: "PhÃ¢n bá»• thu tiá»n vÃ o nhiá»u nghÄ©a vá»¥ náº¿u cÃ³.",
        kind: "posting",
        criticality: "financial",
        permission: "receivables.allocate_payment",
        idempotent: true,
        auditEvent: "CustomerPaymentAllocated",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "reverseCustomerPayment",
        label: "Äáº£o phiáº¿u thu",
        description: "Ghi bÃºt toÃ¡n Ä‘áº£o quá»¹ vÃ  cÃ´ng ná»£, khÃ´ng sá»­a trá»±c tiáº¿p phiáº¿u thu Ä‘Ã£ xÃ¡c nháº­n.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.reverse_receipt",
        idempotent: true,
        auditEvent: "CustomerPaymentReversed",
        transactionBoundary: "cross_module"
      })
    ],
    workflows: [
      {
        name: "Customer payment",
        entity: "CustomerPayment",
        states: ["draft", "confirmed", "partially_allocated", "allocated", "reversed"],
        transitions: [
          { from: "draft", to: "confirmed", command: "confirmCustomerPayment" },
          { from: "confirmed", to: "partially_allocated", command: "allocateCustomerPayment" },
          { from: "confirmed", to: "allocated", command: "allocateCustomerPayment" },
          { from: "partially_allocated", to: "partially_allocated", command: "allocateCustomerPayment" },
          { from: "partially_allocated", to: "allocated", command: "allocateCustomerPayment" },
          { from: "confirmed", to: "reversed", command: "reverseCustomerPayment" },
          { from: "partially_allocated", to: "reversed", command: "reverseCustomerPayment" },
          { from: "allocated", to: "reversed", command: "reverseCustomerPayment" }
        ]
      }
    ],
    invariants: ["Tá»•ng phÃ¢n bá»• khÃ´ng vÆ°á»£t sá»‘ tiá»n phiáº¿u thu.", "Sá»‘ dÆ° pháº£i thu khÃ´ng lÆ°u báº±ng Ã´ nháº­p tay."]
  },
  {
    id: "payables",
    technicalName: "vlxd.payables",
    label: "CÃ´ng ná»£ NCC",
    title: "CÃ´ng ná»£ nhÃ  cung cáº¥p",
    subtitle: "Ghi nháº­n pháº£i tráº£ khi nháº­n hÃ ng hoáº·c xÃ¡c nháº­n giao tháº³ng.",
    iconKey: "hand-coins",
    menuOrder: 80,
    ownerContext: "payables",
    ownedEntities: ["SupplierLedgerEntry", "SupplierPayment"],
    readModels: ["supplier_balance_view"],
    commands: [
      command({
        name: "createSupplierPaymentDraft",
        label: "Táº¡o phiáº¿u chi NCC",
        description: "Táº¡o phiáº¿u chi nhÃ  cung cáº¥p nhÃ¡p, chÆ°a ghi quá»¹ hoáº·c sá»• cÃ´ng ná»£ nhÃ  cung cáº¥p.",
        kind: "create",
        criticality: "financial",
        permission: "cash.create_payment",
        idempotent: true,
        auditEvent: "SupplierPaymentDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "confirmSupplierPayment",
        label: "Chi nhÃ  cung cáº¥p",
        description: "Ghi giáº£m quá»¹ vÃ  giáº£m pháº£i tráº£ nhÃ  cung cáº¥p.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.confirm_payment",
        idempotent: true,
        auditEvent: "SupplierPaymentConfirmed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "allocateSupplierPayment",
        label: "PhÃ¢n bá»• phiáº¿u chi NCC",
        description: "Khá»›p phiáº¿u chi vá»›i má»™t hoáº·c nhiá»u nghÄ©a vá»¥ pháº£i tráº£, khÃ´ng sá»­a bÃºt toÃ¡n quá»¹ Ä‘Ã£ xÃ¡c nháº­n.",
        kind: "posting",
        criticality: "financial",
        permission: "payables.allocate_payment",
        idempotent: true,
        auditEvent: "SupplierPaymentAllocated",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "reverseSupplierPayment",
        label: "Äáº£o phiáº¿u chi NCC",
        description: "Ghi bÃºt toÃ¡n Ä‘áº£o quá»¹ vÃ  pháº£i tráº£, khÃ´ng sá»­a trá»±c tiáº¿p phiáº¿u chi Ä‘Ã£ xÃ¡c nháº­n.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.reverse_payment",
        idempotent: true,
        auditEvent: "SupplierPaymentReversed",
        transactionBoundary: "cross_module"
      })
    ],
    workflows: [
      {
        name: "Supplier payment",
        entity: "SupplierPayment",
        states: ["draft", "confirmed", "partially_allocated", "allocated", "reversed"],
        transitions: [
          { from: "draft", to: "confirmed", command: "confirmSupplierPayment" },
          { from: "confirmed", to: "partially_allocated", command: "allocateSupplierPayment" },
          { from: "confirmed", to: "allocated", command: "allocateSupplierPayment" },
          { from: "partially_allocated", to: "partially_allocated", command: "allocateSupplierPayment" },
          { from: "partially_allocated", to: "allocated", command: "allocateSupplierPayment" },
          { from: "confirmed", to: "reversed", command: "reverseSupplierPayment" },
          { from: "partially_allocated", to: "reversed", command: "reverseSupplierPayment" },
          { from: "allocated", to: "reversed", command: "reverseSupplierPayment" }
        ]
      }
    ],
    invariants: ["KhÃ´ng chi vÆ°á»£t pháº£i tráº£ nhÃ  cung cáº¥p hiá»‡n táº¡i.", "Tá»•ng phÃ¢n bá»• khÃ´ng vÆ°á»£t sá»‘ tiá»n phiáº¿u chi hoáº·c nghÄ©a vá»¥ pháº£i tráº£."]
  },
  {
    id: "cash",
    technicalName: "vlxd.cash",
    label: "Sá»• quá»¹",
    title: "Sá»• quá»¹",
    subtitle: "DÃ²ng tiá»n chá»‰ Ä‘á»c tá»« phiáº¿u thu/chi Ä‘Ã£ xÃ¡c nháº­n vÃ  bÃºt toÃ¡n Ä‘áº£o.",
    iconKey: "wallet-cards",
    menuOrder: 85,
    ownerContext: "cash",
    ownedEntities: ["CashTransaction"],
    readModels: ["cash_balance_view", "cash_transaction_view"],
    commands: [
      command({
        name: "createCashVoucherDraft",
        label: "Táº¡o phiáº¿u quá»¹",
        description: "Táº¡o phiáº¿u thu/chi ná»™i bá»™ nhÃ¡p, chÆ°a lÃ m thay Ä‘á»•i sá»‘ dÆ° quá»¹.",
        kind: "create",
        criticality: "financial",
        permission: "cash.create_voucher",
        idempotent: true,
        auditEvent: "CashVoucherDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "confirmCashVoucher",
        label: "XÃ¡c nháº­n phiáº¿u quá»¹",
        description: "Ghi giao dá»‹ch quá»¹ append-only tá»« phiáº¿u thu/chi ná»™i bá»™.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.confirm_voucher",
        idempotent: true,
        auditEvent: "CashVoucherConfirmed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "reverseCashVoucher",
        label: "Äáº£o phiáº¿u quá»¹",
        description: "Ghi giao dá»‹ch quá»¹ ngÆ°á»£c chiá»u vá»›i lÃ½ do báº¯t buá»™c.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.reverse_voucher",
        idempotent: true,
        auditEvent: "CashVoucherReversed",
        transactionBoundary: "cross_module"
      })
    ],
    workflows: [
      {
        name: "Cash voucher",
        entity: "CashVoucher",
        states: ["draft", "confirmed", "reversed"],
        transitions: [
          { from: "draft", to: "confirmed", command: "confirmCashVoucher" },
          { from: "confirmed", to: "reversed", command: "reverseCashVoucher" }
        ]
      }
    ],
    invariants: ["Sá»‘ dÆ° quá»¹ khÃ´ng Ä‘Æ°á»£c nháº­p tay, pháº£i tÃ­nh tá»« giao dá»‹ch quá»¹ append-only."]
  },
  {
    id: "workforce",
    technicalName: "vlxd.workforce",
    label: "NhÃ¢n cÃ´ng",
    title: "NhÃ¢n cÃ´ng",
    subtitle: "Sáº£n lÆ°á»£ng duyá»‡t lÃ  nguá»“n táº¡o tiá»n cÃ´ng, khÃ´ng tá»± cá»™ng attendance.",
    iconKey: "users",
    menuOrder: 90,
    ownerContext: "workforce_compensation",
    ownedEntities: ["WorkOrder", "WorkOutput", "CompensationBatch", "EmployeeLedgerEntry", "EmployeePayment"],
    readModels: ["employee_balance_view"],
    commands: [
      command({
        name: "claimOpenSalesWorkOrder",
        label: "Nháº­n Ä‘Æ¡n má»›i",
        description: "Thá»£ nháº­n Ä‘Æ¡n giao hÃ ng Ä‘ang má»Ÿ. Há»‡ thá»‘ng chá»‰ khÃ³a Ä‘Æ¡n cho ngÆ°á»i nháº­n há»£p lá»‡ Ä‘áº§u tiÃªn.",
        kind: "workflow",
        criticality: "normal",
        permission: "workforce.claim_open_order",
        idempotent: true,
        auditEvent: "OpenSalesWorkOrderClaimed",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createWorkOrderDraft",
        label: "Táº¡o phiáº¿u cÃ´ng",
        description: "Táº¡o phiáº¿u cÃ´ng chá» duyá»‡t vÃ  báº£ng cÃ´ng nhÃ¡p, chÆ°a ghi nháº­n tiá»n cÃ´ng.",
        kind: "create",
        criticality: "compensation",
        permission: "workforce.create",
        idempotent: true,
        auditEvent: "WorkOrderDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "recordWorkOrderLocation",
        label: "Ghi vÃ­ trí",
        description: "LÆ°u toáº£ Ä‘á»™ vÃ¬ trÃ­ Ä‘á»ƒ theo dá»i giao hÃ ng cá»§a thá»£ nháº­n Ä‘Æ¡n.",
        kind: "workflow",
        criticality: "normal",
        permission: "workforce.record_location",
        idempotent: true,
        auditEvent: "WorkOrderLocationRecorded",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createEmployeePaymentDraft",
        label: "Táº¡o phiáº¿u thanh toÃ¡n nhÃ¢n viÃªn",
        description: "Táº¡o phiáº¿u thanh toÃ¡n cÃ´ng nhÃ¡p cho nhÃ¢n viÃªn, chÆ°a ghi giáº£m quá»¹.",
        kind: "create",
        criticality: "financial",
        permission: "cash.create_employee_payment",
        idempotent: true,
        auditEvent: "EmployeePaymentDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createEmployeeAdvanceDraft",
        label: "Táº¡o phiáº¿u táº¡m á»©ng",
        description: "Táº¡o phiáº¿u táº¡m á»©ng nhÃ¢n viÃªn á»Ÿ tráº¡ng thÃ¡i nhÃ¡p, chÆ°a lÃ m thay Ä‘á»•i quá»¹.",
        kind: "create",
        criticality: "financial",
        permission: "cash.create_employee_advance",
        idempotent: true,
        auditEvent: "EmployeeAdvanceDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "approveWorkOutput",
        label: "Duyá»‡t sáº£n lÆ°á»£ng",
        description: "KhÃ³a sáº£n lÆ°á»£ng Ä‘Æ°á»£c duyá»‡t trÆ°á»›c khi tÃ­nh cÃ´ng.",
        kind: "workflow",
        criticality: "compensation",
        permission: "workforce.approve_output",
        idempotent: true,
        auditEvent: "WorkOutputApproved",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "postCompensation",
        label: "Post báº£ng cÃ´ng",
        description: "Chia cÃ´ng theo há»‡ sá»‘ vÃ  ghi sá»• tiá»n cÃ´ng nhÃ¢n viÃªn.",
        kind: "posting",
        criticality: "compensation",
        permission: "compensation.post",
        idempotent: true,
        auditEvent: "CompensationPosted",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "payEmployee",
        label: "Thanh toÃ¡n nhÃ¢n viÃªn",
        description: "Thanh toÃ¡n má»™t pháº§n cÃ´ng Ä‘Ã£ chá»‘t cho nhÃ¢n viÃªn.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.pay_employee",
        idempotent: true,
        auditEvent: "EmployeePaymentConfirmed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "reverseEmployeePayment",
        label: "Äáº£o thanh toÃ¡n nhÃ¢n viÃªn",
        description: "Ghi bÃºt toÃ¡n Ä‘áº£o quá»¹ vÃ  cÃ´ng pháº£i tráº£, khÃ´ng sá»­a trá»±c tiáº¿p phiáº¿u thanh toÃ¡n Ä‘Ã£ xÃ¡c nháº­n.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.reverse_employee_payment",
        idempotent: true,
        auditEvent: "EmployeePaymentReversed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "confirmEmployeeAdvance",
        label: "XÃ¡c nháº­n táº¡m á»©ng",
        description: "Ghi giáº£m quá»¹ vÃ  ghi Ná»£ sá»• nhÃ¢n viÃªn cho phiáº¿u táº¡m á»©ng Ä‘Ã£ duyá»‡t.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.confirm_employee_advance",
        idempotent: true,
        auditEvent: "EmployeeAdvanceConfirmed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "reverseEmployeeAdvance",
        label: "Äáº£o táº¡m á»©ng",
        description: "Ghi bÃºt toÃ¡n quá»¹ vÃ  sá»• nhÃ¢n viÃªn ngÆ°á»£c chiá»u, báº¯t buá»™c cÃ³ lÃ½ do.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.reverse_employee_advance",
        idempotent: true,
        auditEvent: "EmployeeAdvanceReversed",
        transactionBoundary: "cross_module"
      })
    ],
    workflows: [
      {
        name: "Work order",
        entity: "WorkOrder",
        states: ["open", "assigned", "submitted", "approved", "compensated", "paid"],
        transitions: [
          { from: "open", to: "assigned", command: "claimOpenSalesWorkOrder" },
          { from: "submitted", to: "approved", command: "approveWorkOutput" },
          { from: "approved", to: "compensated", command: "postCompensation" },
          { from: "compensated", to: "paid", command: "payEmployee" }
        ]
      },
      {
        name: "Employee payment",
        entity: "EmployeePayment",
        states: ["draft", "confirmed", "reversed"],
        transitions: [
          { from: "draft", to: "confirmed", command: "payEmployee" },
          { from: "confirmed", to: "reversed", command: "reverseEmployeePayment" }
        ]
      },
      {
        name: "Employee advance",
        entity: "EmployeeAdvance",
        states: ["draft", "confirmed", "reversed"],
        transitions: [
          { from: "draft", to: "confirmed", command: "confirmEmployeeAdvance" },
          { from: "confirmed", to: "reversed", command: "reverseEmployeeAdvance" }
        ]
      }
    ],
    invariants: ["Sáº£n lÆ°á»£ng Ä‘Ã£ tÃ­nh cÃ´ng khÃ´ng Ä‘Æ°á»£c tÃ­nh láº¡i.", "Tá»•ng tiá»n chia pháº£i báº±ng tá»•ng tiá»n cÃ´ng."]
  },
  {
    id: "import",
    technicalName: "vlxd.import",
    label: "Import Excel",
    title: "Import Excel",
    subtitle: "Kiá»ƒm tra váº¥n Ä‘á» trÆ°á»›c khi cháº¡y thá»­ import, khÃ´ng láº¥y bÃ¡o cÃ¡o Excel lÃ m nguá»“n sá»± tháº­t.",
    iconKey: "file-spreadsheet",
    menuOrder: 100,
    ownerContext: "import",
    ownedEntities: ["ImportIssue"],
    readModels: [],
    commands: [
      command({
        name: "createImportDryRun",
        label: "Cháº¡y thá»­ workbook",
        description: "Äá»c workbook tháº­t, táº¡o fingerprint vÃ  issue; khÃ´ng post dÃ²ng giao dá»‹ch.",
        kind: "create",
        criticality: "import",
        permission: "import.create_dry_run",
        idempotent: true,
        auditEvent: "ImportDryRunCreated",
        transactionBoundary: "cross_module"
      }),
      
      command({
        name: "createImportIssue",
        label: "Táº¡o váº¥n Ä‘á» import",
        description: "Táº¡o váº¥n Ä‘á» cáº§n kiá»ƒm tra cho dÃ²ng Excel nghi ngá».",
        kind: "create",
        criticality: "import",
        permission: "import.create_issue",
        idempotent: true,
        auditEvent: "ImportIssueCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "resolveImportIssue",
        label: "Xá»­ lÃ½ váº¥n Ä‘á» import",
        description: "ÄÃ¡nh dáº¥u váº¥n Ä‘á» import Ä‘Ã£ Ä‘Æ°á»£c xá»­ lÃ½.",
        kind: "workflow",
        criticality: "import",
        permission: "import.resolve_issue",
        idempotent: true,
        auditEvent: "ImportIssueResolved",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "ignoreImportIssue",
        label: "Bá» qua cáº£nh bÃ¡o import",
        description: "Bá» qua cáº£nh bÃ¡o import khÃ´ng nghiÃªm trá»ng, lá»—i import váº«n pháº£i xá»­ lÃ½.",
        kind: "workflow",
        criticality: "import",
        permission: "import.ignore_issue",
        idempotent: true,
        auditEvent: "ImportIssueIgnored",
        transactionBoundary: "single_aggregate"
      })
    ],
    workflows: [
      {
        name: "Váº¥n Ä‘á» import",
        entity: "ImportIssue",
        states: ["open", "resolved", "ignored"],
        transitions: [
          { from: "open", to: "resolved", command: "resolveImportIssue" },
          { from: "open", to: "ignored", command: "ignoreImportIssue" }
        ]
      }
    ],
    invariants: ["KhÃ´ng import cá»™t tá»•ng/cÃ²n láº¡i nhÆ° nguá»“n sá»± tháº­t.", "Chá»‰ cáº£nh bÃ¡o import má»›i Ä‘Æ°á»£c bá» qua; lá»—i import báº¯t buá»™c xá»­ lÃ½."]
  },
  {
    id: "audit",
    technicalName: "vlxd.audit",
    label: "Audit",
    title: "Nháº­t kÃ½ kiá»ƒm toÃ¡n",
    subtitle: "Theo dÃµi ngÆ°á»i thao tÃ¡c, vai trÃ², quyá»n sá»­ dá»¥ng, chá»©ng tá»« Ä‘Ã­ch vÃ  thá»i Ä‘iá»ƒm thay Ä‘á»•i.",
    iconKey: "clipboard-check",
    menuOrder: 105,
    ownerContext: "audit",
    ownedEntities: ["AuditLog"],
    readModels: ["audit_log_view"],
    commands: [],
    workflows: [],
    invariants: ["Má»i posting, approval, reversal vÃ  override pháº£i cÃ³ audit trail."]
  },
  {
    id: "reporting",
    technicalName: "vlxd.reporting",
    label: "BÃ¡o cÃ¡o",
    title: "BÃ¡o cÃ¡o",
    subtitle: "BÃ¡o cÃ¡o chá»‰ Ä‘á»c tá»« sá»• cÃ´ng ná»£, phÃ¡t sinh kho vÃ  giao dá»‹ch quá»¹.",
    iconKey: "clipboard-check",
    menuOrder: 110,
    ownerContext: "reporting",
    ownedEntities: [],
    readModels: [
      "customer_balance_view",
      "supplier_balance_view",
      "stock_balance_view",
      "employee_balance_view",
      "daily_operations_dashboard_view"
    ],
    commands: [],
    workflows: [],
    invariants: ["BÃ¡o cÃ¡o khÃ´ng lÆ°u sá»‘ tá»•ng Ä‘á»™c láº­p vá»›i sá»• chi tiáº¿t vÃ  phÃ¡t sinh kho."]
  }
] satisfies ErpModuleDefinition<OperationsModuleId, DomainCommandName>[];

export const operationsErpRegistry = createErpRegistry(operationsErpModules);

export const operationsOdooMetadata = createOdooMetadata(operationsErpModules);

export const operationSequence = workflowOperationSequence;

export const operationsByModule = Object.fromEntries(
  operationsErpRegistry.modules.map((module) => [
    module.id,
    module.commands
      .filter((commandDefinition) => workflowOperationSequence.includes(commandDefinition.name as OperationName))
      .map((commandDefinition) => commandDefinition.name as OperationName)
  ])
) as Partial<Record<OperationsModuleId, OperationName[]>>;

export const operationLabels = Object.fromEntries(
  operationDisplaySequence.map((operation) => [operation, operationsErpRegistry.commandByName.get(operation)?.label ?? operation])
) as Record<OperationName, string>;

export const operationDescriptions = Object.fromEntries(
  operationDisplaySequence.map((operation) => [
    operation,
    operationsErpRegistry.commandByName.get(operation)?.description ?? "Thao tÃ¡c nghiá»‡p vá»¥."
  ])
) as Record<OperationName, string>;

