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
    label: "Tổng quan",
    title: "Tổng quan vận hành",
    subtitle: "Theo dõi luồng bán, mua, kho, công nợ, dòng tiền và nhân công từ cùng một nguồn dữ liệu.",
    iconKey: "home",
    menuOrder: 10,
    ownerContext: "reporting",
    ownedEntities: [],
    readModels: ["daily_operations_dashboard_view"],
    commands: [],
    workflows: [],
    invariants: ["Tổng quan chỉ đọc từ mô hình tổng hợp, không ghi giao dịch."]
  },
  {
    id: "masterData",
    technicalName: "vlxd.master_data",
    label: "Danh mục",
    title: "Danh mục nền",
    subtitle: "Khách hàng, nhà cung cấp, vật tư, kho, xe và nhân sự dùng chung cho luồng nghiệp vụ.",
    iconKey: "database",
    menuOrder: 20,
    ownerContext: "parties_catalog",
    ownedEntities: ["Customer", "Supplier", "ProductUnit", "UnitDefinition", "PurchaseUnitConversion", "Warehouse", "Vehicle", "Employee"],
    readModels: [],
    commands: [
      command({
        name: "createCustomer",
        label: "Tạo khách hàng",
        description: "Tạo customer master data sau khi kiểm tra trùng tên.",
        kind: "create",
        criticality: "normal",
        permission: "parties.create_customer",
        idempotent: true,
        auditEvent: "CustomerCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createSupplier",
        label: "Tạo nhà cung cấp",
        description: "Tạo supplier master data sau khi kiểm tra trùng tên.",
        kind: "create",
        criticality: "normal",
        permission: "parties.create_supplier",
        idempotent: true,
        auditEvent: "SupplierCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createProductUnit",
        label: "Tạo vật tư",
        description: "Tạo product-unit dùng làm khóa giao dịch, không tra theo tên vật tư tự do.",
        kind: "create",
        criticality: "normal",
        permission: "catalog.create_product_unit",
        idempotent: true,
        auditEvent: "ProductUnitCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "updateProductCommercialPolicy",
        label: "Lưu chính sách giá",
        description: "Lưu lịch sử giá bán, VAT, biên lợi nhuận, thời gian giao và ngưỡng tồn; chứng từ cũ giữ nguyên snapshot.",
        kind: "workflow",
        criticality: "financial",
        permission: "catalog.update_commercial_policy",
        idempotent: true,
        auditEvent: "ProductCommercialPolicyUpdated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "assignCustomerCollectionOwner",
        label: "Giao phụ trách thu hồi",
        description: "Gán một nhân sự chịu trách nhiệm theo dõi công nợ của khách hàng.",
        kind: "workflow",
        criticality: "financial",
        permission: "receivables.assign_collection_owner",
        idempotent: true,
        auditEvent: "CustomerCollectionOwnerAssigned",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "recordCustomerCollectionFollowUp",
        label: "Ghi nhận thu hồi công nợ",
        description: "Lưu nhật ký liên hệ thu hồi mà không sửa số dư công nợ.",
        kind: "workflow",
        criticality: "financial",
        permission: "receivables.record_collection_follow_up",
        idempotent: true,
        auditEvent: "CustomerCollectionFollowUpRecorded",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "requestDeliveryQuantityChange",
        label: "Báo chênh lệch giao hàng",
        description: "Người giao chỉ báo chênh lệch, không tự sửa số lượng đã giao.",
        kind: "workflow",
        criticality: "inventory",
        permission: "delivery.request_quantity_change",
        idempotent: true,
        auditEvent: "DeliveryQuantityChangeRequested",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "approveDeliveryQuantityChange",
        label: "Duyệt chênh lệch giao hàng",
        description: "Chủ cửa hàng hoặc kế toán duyệt số giao một phần trước posting.",
        kind: "workflow",
        criticality: "inventory",
        permission: "delivery.approve_quantity_change",
        idempotent: true,
        auditEvent: "DeliveryQuantityChangeApproved",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "rejectDeliveryQuantityChange",
        label: "Từ chối chênh lệch giao hàng",
        description: "Từ chối yêu cầu chênh lệch với lý do bắt buộc.",
        kind: "workflow",
        criticality: "inventory",
        permission: "delivery.reject_quantity_change",
        idempotent: true,
        auditEvent: "DeliveryQuantityChangeRejected",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "confirmCustomerDeliveryReceipt",
        label: "Khách xác nhận nhận hàng",
        description: "Khách gửi ảnh nhận hàng thuộc đúng chuyến giao của mình.",
        kind: "workflow",
        criticality: "normal",
        permission: "portal.customer.confirm_delivery_receipt",
        idempotent: true,
        auditEvent: "CustomerDeliveryReceiptConfirmed",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "waiveCustomerDeliveryReceipt",
        label: "Miễn ảnh khách nhận hàng",
        description: "Chỉ Chủ cửa hàng được miễn ảnh xác nhận, phải nêu lý do và có audit.",
        kind: "workflow",
        criticality: "financial",
        permission: "delivery.waive_customer_receipt",
        idempotent: true,
        auditEvent: "CustomerDeliveryReceiptWaived",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createUnitDefinition",
        label: "Thêm đơn vị",
        description: "Thêm đơn vị dùng chung do cửa hàng tự quản lý.",
        kind: "create",
        criticality: "normal",
        permission: "catalog.manage_purchase_units",
        idempotent: true,
        auditEvent: "UnitDefinitionCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "deleteUnitDefinition",
        label: "Xóa đơn vị",
        description: "Xóa đơn vị không phải đơn vị tồn kho gốc và dọn quy đổi hiện tại liên quan.",
        kind: "workflow",
        criticality: "normal",
        permission: "catalog.manage_purchase_units",
        idempotent: true,
        auditEvent: "UnitDefinitionDeleted",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "resetPurchaseUnitSettings",
        label: "Xóa cài đặt đơn vị mua",
        description: "Xóa đơn vị mua và cách tính hiện tại, giữ nguyên đơn vị tồn kho và snapshot chứng từ lịch sử.",
        kind: "workflow",
        criticality: "inventory",
        permission: "catalog.manage_purchase_units",
        idempotent: true,
        auditEvent: "PurchaseUnitSettingsReset",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "upsertPurchaseUnitConversion",
        label: "Lưu cách tính đơn vị mua",
        description: "Cấu hình quy đổi cố định hoặc nhập số lượng tồn kho thực tế theo từng lần mua.",
        kind: "workflow",
        criticality: "inventory",
        permission: "catalog.manage_purchase_units",
        idempotent: true,
        auditEvent: "PurchaseUnitConversionSaved",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "deletePurchaseUnitConversion",
        label: "Xóa quy đổi đơn vị mua",
        description: "Xóa quy đổi hiện tại nhưng giữ nguyên snapshot trên chứng từ lịch sử.",
        kind: "workflow",
        criticality: "inventory",
        permission: "catalog.manage_purchase_units",
        idempotent: true,
        auditEvent: "PurchaseUnitConversionDeleted",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createWarehouse",
        label: "Tạo kho",
        description: "Tạo kho hoặc bãi làm điểm sở hữu tồn kho độc lập.",
        kind: "create",
        criticality: "normal",
        permission: "catalog.create_warehouse",
        idempotent: true,
        auditEvent: "WarehouseCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createVehicle",
        label: "Tạo xe",
        description: "Tạo phương tiện giao hàng với biển số và tải trọng dùng cho điều phối.",
        kind: "create",
        criticality: "normal",
        permission: "catalog.create_vehicle",
        idempotent: true,
        auditEvent: "VehicleCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createEmployee",
        label: "Tạo nhân sự",
        description: "Tạo nhân viên vận hành để phân công giao hàng, kho, kế toán hoặc công việc.",
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
      "Tên/mã danh mục phải được chuẩn hóa để tìm kiếm không dấu và tránh trùng.",
      "Quy đổi đơn vị mua phải duy nhất theo vật tư/đơn vị và có hệ số dương.",
      "Không xóa đơn vị đang là đơn vị tồn kho gốc của vật tư."
    ]
  },
  {
    id: "sales",
    technicalName: "vlxd.sales",
    label: "Bán hàng",
    title: "Bán hàng",
    subtitle: "Xác nhận đơn, khóa giá và phân bổ nguồn hàng trước khi giao.",
    iconKey: "shopping-cart",
    menuOrder: 30,
    ownerContext: "sales",
    ownedEntities: ["SalesOrder", "SalesOrderLine"],
    readModels: ["order_fulfillment_view"],
    commands: [
      command({
        name: "createSalesOrderDraft",
        label: "Tạo đơn bán",
        description: "Tạo đơn bán nháp với ảnh chụp giá theo từng dòng hàng.",
        kind: "create",
        criticality: "normal",
        permission: "sales.create",
        idempotent: true,
        auditEvent: "SalesOrderDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createCustomerPortalSalesOrder",
        label: "Khách gửi đơn đặt hàng",
        description: "Khách gửi đơn nháp; giá và VAT được lấy từ bảng giá hiện hành trên máy chủ.",
        kind: "create",
        criticality: "normal",
        permission: "portal.customer.create_order",
        idempotent: true,
        auditEvent: "CustomerPortalOrderCreated",
        transactionBoundary: "single_aggregate"
      }),      command({
        name: "confirmSalesOrder",
        label: "Xác nhận đơn bán",
        description: "Khóa ảnh chụp giá, tăng phiên bản, chưa ghi công nợ.",
        kind: "workflow",
        criticality: "normal",
        permission: "sales.confirm",
        idempotent: true,
        auditEvent: "SalesOrderConfirmed",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "allocateSalesSources",
        label: "Phân bổ nguồn hàng",
        description: "Chia dòng bán: hàng qua kho và hàng giao thẳng.",
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
    invariants: ["Đơn bán đã xác nhận phải giữ ảnh chụp giá.", "Công nợ chỉ phát sinh khi giao hàng được xác nhận."]
  },
  {
    id: "procurement",
    technicalName: "vlxd.procurement",
    label: "Mua hàng",
    title: "Mua hàng",
    subtitle: "Nhập kho hoặc giao thẳng khách, ghi phải trả theo chứng từ nguồn.",
    iconKey: "boxes",
    menuOrder: 40,
    ownerContext: "procurement",
    ownedEntities: ["PurchaseOrder", "PurchaseOrderLine"],
    readModels: [],
    commands: [
      command({
        name: "createPurchaseOrderDraft",
        label: "Tạo đơn mua",
        description: "Tạo đơn mua nháp với điểm nhận là kho hoặc giao thẳng khách.",
        kind: "create",
        criticality: "normal",
        permission: "procurement.create",
        idempotent: true,
        auditEvent: "PurchaseOrderDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "submitSupplierPurchaseOrderResponse",
        label: "NCC phản hồi phiếu mua",
        description: "Nhà cung cấp phản hồi khả năng cung ứng và ngày giao dự kiến; chưa làm thay đổi phiếu nhận.",
        kind: "workflow",
        criticality: "normal",
        permission: "portal.supplier.respond_purchase_order",
        idempotent: true,
        auditEvent: "SupplierPurchaseOrderResponded",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "submitSupplierDeliveryNotice",
        label: "NCC báo giao hàng",
        description: "Nhà cung cấp gửi số lượng/chứng từ đã giao; cửa hàng vẫn phải duyệt phiếu nhận.",
        kind: "workflow",
        criticality: "normal",
        permission: "portal.supplier.submit_delivery_notice",
        idempotent: true,
        auditEvent: "SupplierDeliveryNoticeSubmitted",
        transactionBoundary: "single_aggregate"
      }),      command({
        name: "confirmPurchaseOrder",
        label: "Xác nhận đơn mua",
        description: "Khóa giá mua và điểm nhận trước khi nhập kho hoặc giao thẳng.",
        kind: "workflow",
        criticality: "normal",
        permission: "procurement.confirm",
        idempotent: true,
        auditEvent: "PurchaseOrderConfirmed",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "submitGoodsReceipt",
        label: "Gửi phiếu nhập chờ duyệt",
        description: "Thợ gửi số lượng thực nhận để Chủ cửa hàng hoặc Kế toán duyệt trước khi ghi kho và công nợ.",
        kind: "workflow",
        criticality: "inventory",
        permission: "inventory.submit_receipt",
        idempotent: true,
        auditEvent: "GoodsReceiptSubmittedForApproval",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "approveGoodsReceipt",
        label: "Duyệt phiếu nhập",
        description: "Duyệt phiếu nhập đã gửi và post inventory movement cùng phải trả trong một transaction.",
        kind: "posting",
        criticality: "inventory",
        permission: "inventory.approve_receipt",
        idempotent: true,
        auditEvent: "GoodsReceiptApproved",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "rejectGoodsReceipt",
        label: "Từ chối phiếu nhập",
        description: "Từ chối phiếu nhập chờ duyệt, bắt buộc ghi lý do và không tạo phát sinh kho.",
        kind: "workflow",
        criticality: "inventory",
        permission: "inventory.reject_receipt",
        idempotent: true,
        auditEvent: "GoodsReceiptRejected",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "postGoodsReceipt",
        label: "Post nhập kho",
        description: "Tạo phiếu nhập kho và ghi tăng phải trả nhà cung cấp.",
        kind: "posting",
        criticality: "inventory",
        permission: "inventory.post_receipt",
        idempotent: true,
        auditEvent: "GoodsReceiptPosted",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "confirmDirectDelivery",
        label: "Xác nhận giao thẳng",
        description: "Ghi phải thu/phải trả, không tạo phát sinh kho.",
        kind: "posting",
        criticality: "financial",
        permission: "delivery.confirm_direct",
        idempotent: true,
        auditEvent: "DirectDeliveryConfirmed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "reverseDirectDelivery",
        label: "Đảo giao thẳng",
        description: "Đảo lần giao thẳng gần nhất bằng bút toán phải thu/phải trả ngược, không tạo phát sinh kho.",
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
    invariants: ["Giao thẳng không tạo phát sinh kho tại kho cửa hàng.", "Số lượng đã nhận không vượt số lượng đặt mua."]
  },
  {
    id: "delivery",
    technicalName: "vlxd.delivery",
    label: "Giao hàng",
    title: "Giao hàng",
    subtitle: "Điều phối chuyến, xác nhận giao, tạo hậu quả kho và công nợ.",
    iconKey: "truck",
    menuOrder: 50,
    ownerContext: "delivery",
    ownedEntities: ["DeliveryJob"],
    readModels: [],
    commands: [
      command({
        name: "createDeliveryJob",
        label: "Tạo chuyến giao",
        description: "Tạo chuyến giao được phân công tài xế và xe, có kiểm tra trùng lịch, chưa ghi xuất kho.",
        kind: "create",
        criticality: "normal",
        permission: "delivery.create",
        idempotent: true,
        auditEvent: "DeliveryJobCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "startDeliveryLoading",
        label: "Bắt đầu bốc hàng",
        description: "Chuyển chuyến giao từ đã phân công sang đang bốc hàng, chưa ghi xuất kho.",
        kind: "workflow",
        criticality: "inventory",
        permission: "delivery.start_loading",
        idempotent: true,
        auditEvent: "DeliveryLoadingStarted",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "dispatchDelivery",
        label: "Xuất bến",
        description: "Xác nhận chuyến giao đã xuất bến, chờ kết quả giao thực tế.",
        kind: "workflow",
        criticality: "inventory",
        permission: "delivery.dispatch",
        idempotent: true,
        auditEvent: "DeliveryDispatched",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "submitDeliveryCompletion",
        label: "Gửi xác nhận giao chờ duyệt",
        description: "Thợ gửi người nhận, bằng chứng và số lượng thực giao; chưa xuất kho hoặc ghi công nợ.",
        kind: "workflow",
        criticality: "financial",
        permission: "delivery.submit_completion",
        idempotent: true,
        auditEvent: "DeliveryCompletionSubmittedForApproval",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "approveDeliveryCompletion",
        label: "Duyệt xác nhận giao",
        description: "Duyệt xác nhận giao của thợ và post xuất kho cùng phải thu trong một transaction.",
        kind: "posting",
        criticality: "financial",
        permission: "delivery.approve_completion",
        idempotent: true,
        auditEvent: "DeliveryCompletionApproved",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "rejectDeliveryCompletion",
        label: "Từ chối xác nhận giao",
        description: "Từ chối xác nhận giao chờ duyệt, bắt buộc ghi lý do và giữ chuyến ở trạng thái đang giao.",
        kind: "workflow",
        criticality: "financial",
        permission: "delivery.reject_completion",
        idempotent: true,
        auditEvent: "DeliveryCompletionRejected",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "completeDelivery",
        label: "Hoàn tất giao từ kho",
        description: "Ghi xuất kho chỉ ghi thêm và ghi phải thu phần giao từ kho.",
        kind: "posting",
        criticality: "financial",
        permission: "delivery.complete",
        idempotent: true,
        auditEvent: "DeliveryCompleted",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "failDelivery",
        label: "Báo giao thất bại",
        description: "Khóa chuyến giao thất bại, không ghi xuất kho và không ghi công nợ.",
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
    invariants: ["Hoàn tất giao từ kho phải kiểm tra tồn khả dụng trước khi xuất.", "Chuyến giao thất bại không được ghi xuất kho hoặc công nợ.", "Một tài xế hoặc xe không có hai chuyến đang hoạt động trong cùng ngày."]
  },
  {
    id: "inventory",
    technicalName: "vlxd.inventory",
    label: "Kho",
    title: "Kho",
    subtitle: "Tồn kho được tính từ các phát sinh kho chỉ ghi thêm.",
    iconKey: "warehouse",
    menuOrder: 60,
    ownerContext: "inventory",
    ownedEntities: ["InventoryMovement"],
    readModels: ["stock_balance_view", "available_stock_view"],
    commands: [
      command({
        name: "postInventoryTransfer",
        label: "Chuyển kho",
        description: "Ghi đồng thời xuất kho nguồn và nhập kho đích bằng một chứng từ liên kết.",
        kind: "posting",
        criticality: "inventory",
        permission: "inventory.post_transfer",
        idempotent: true,
        auditEvent: "InventoryTransferPosted",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "postInventoryCountAdjustment",
        label: "Điều chỉnh kiểm kê",
        description: "So sánh tồn sổ với số đếm thực tế và ghi movement chênh lệch có lý do.",
        kind: "posting",
        criticality: "inventory",
        permission: "inventory.post_count_adjustment",
        idempotent: true,
        auditEvent: "InventoryCountAdjustmentPosted",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "reverseInventoryMovement",
        label: "Đảo phát sinh kho",
        description: "Ghi movement ngược chiều cho phát sinh kho đã post và đảo công nợ liên quan.",
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
    invariants: ["Giao diện không sửa trực tiếp số dư tồn kho.", "Phát sinh kho đã ghi nhận chỉ được ghi đảo."]
  },
  {
    id: "receivables",
    technicalName: "vlxd.receivables",
    label: "Công nợ KH",
    title: "Công nợ khách hàng",
    subtitle: "Số dư phải thu tính từ sổ công nợ và phân bổ thanh toán.",
    iconKey: "wallet-cards",
    menuOrder: 70,
    ownerContext: "receivables",
    ownedEntities: ["CustomerLedgerEntry", "CustomerPayment"],
    readModels: ["customer_balance_view"],
    commands: [
      command({
        name: "createCustomerPaymentDraft",
        label: "Tạo phiếu thu",
        description: "Tạo phiếu thu nháp, chưa ghi quỹ hoặc sổ công nợ khách hàng.",
        kind: "create",
        criticality: "financial",
        permission: "cash.create_receipt",
        idempotent: true,
        auditEvent: "CustomerPaymentDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "confirmCustomerPayment",
        label: "Xác nhận phiếu thu",
        description: "Ghi tăng quỹ và giảm công nợ phải thu.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.confirm_receipt",
        idempotent: true,
        auditEvent: "CustomerPaymentConfirmed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "allocateCustomerPayment",
        label: "Phân bổ phiếu thu",
        description: "Phân bổ thu tiền vào nhiều nghĩa vụ nếu có.",
        kind: "posting",
        criticality: "financial",
        permission: "receivables.allocate_payment",
        idempotent: true,
        auditEvent: "CustomerPaymentAllocated",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "reverseCustomerPayment",
        label: "Đảo phiếu thu",
        description: "Ghi bút toán đảo quỹ và công nợ, không sửa trực tiếp phiếu thu đã xác nhận.",
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
    invariants: ["Tổng phân bổ không vượt số tiền phiếu thu.", "Số dư phải thu không lưu bằng ô nhập tay."]
  },
  {
    id: "payables",
    technicalName: "vlxd.payables",
    label: "Công nợ NCC",
    title: "Công nợ nhà cung cấp",
    subtitle: "Ghi nhận phải trả khi nhận hàng hoặc xác nhận giao thẳng.",
    iconKey: "hand-coins",
    menuOrder: 80,
    ownerContext: "payables",
    ownedEntities: ["SupplierLedgerEntry", "SupplierPayment"],
    readModels: ["supplier_balance_view"],
    commands: [
      command({
        name: "createSupplierPaymentDraft",
        label: "Tạo phiếu chi NCC",
        description: "Tạo phiếu chi nhà cung cấp nháp, chưa ghi quỹ hoặc sổ công nợ nhà cung cấp.",
        kind: "create",
        criticality: "financial",
        permission: "cash.create_payment",
        idempotent: true,
        auditEvent: "SupplierPaymentDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "confirmSupplierPayment",
        label: "Chi nhà cung cấp",
        description: "Ghi giảm quỹ và giảm phải trả nhà cung cấp.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.confirm_payment",
        idempotent: true,
        auditEvent: "SupplierPaymentConfirmed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "allocateSupplierPayment",
        label: "Phân bổ phiếu chi NCC",
        description: "Khớp phiếu chi với một hoặc nhiều nghĩa vụ phải trả, không sửa bút toán quỹ đã xác nhận.",
        kind: "posting",
        criticality: "financial",
        permission: "payables.allocate_payment",
        idempotent: true,
        auditEvent: "SupplierPaymentAllocated",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "reverseSupplierPayment",
        label: "Đảo phiếu chi NCC",
        description: "Ghi bút toán đảo quỹ và phải trả, không sửa trực tiếp phiếu chi đã xác nhận.",
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
    invariants: ["Không chi vượt phải trả nhà cung cấp hiện tại.", "Tổng phân bổ không vượt số tiền phiếu chi hoặc nghĩa vụ phải trả."]
  },
  {
    id: "cash",
    technicalName: "vlxd.cash",
    label: "Sổ quỹ",
    title: "Sổ quỹ",
    subtitle: "Dòng tiền chỉ đọc từ phiếu thu/chi đã xác nhận và bút toán đảo.",
    iconKey: "wallet-cards",
    menuOrder: 85,
    ownerContext: "cash",
    ownedEntities: ["CashTransaction", "BankTransferProof"],
    readModels: ["cash_balance_view", "cash_transaction_view"],
    commands: [
      command({
        name: "createCashVoucherDraft",
        label: "Tạo phiếu quỹ",
        description: "Tạo phiếu thu/chi nội bộ nháp, chưa làm thay đổi số dư quỹ.",
        kind: "create",
        criticality: "financial",
        permission: "cash.create_voucher",
        idempotent: true,
        auditEvent: "CashVoucherDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createBankTransferProof",
        label: "Sao lưu chứng từ chuyển khoản",
        description: "Lưu bằng chứng chuyển khoản riêng tư để đối chiếu; không tự tạo giao dịch quỹ hoặc công nợ.",
        kind: "create",
        criticality: "financial",
        permission: "cash.archive_transfer_proof",
        idempotent: true,
        auditEvent: "BankTransferProofArchived",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "submitCustomerPaymentProof",
        label: "Khách gửi minh chứng chuyển khoản",
        description: "Lưu yêu cầu đối soát chuyển khoản, chưa tạo phiếu thu, quỹ hoặc công nợ.",
        kind: "create",
        criticality: "financial",
        permission: "portal.customer.submit_payment_proof",
        idempotent: true,
        auditEvent: "CustomerPaymentProofSubmitted",
        transactionBoundary: "single_aggregate"
      }),      command({
        name: "confirmCashVoucher",
        label: "Xác nhận phiếu quỹ",
        description: "Ghi giao dịch quỹ append-only từ phiếu thu/chi nội bộ.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.confirm_voucher",
        idempotent: true,
        auditEvent: "CashVoucherConfirmed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "reverseCashVoucher",
        label: "Đảo phiếu quỹ",
        description: "Ghi giao dịch quỹ ngược chiều với lý do bắt buộc.",
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
    invariants: ["Số dư quỹ không được nhập tay, phải tính từ giao dịch quỹ append-only."]
  },
  {
    id: "workforce",
    technicalName: "vlxd.workforce",
    label: "Nhân công",
    title: "Nhân công",
    subtitle: "Sản lượng duyệt là nguồn tạo tiền công, không tự cộng attendance.",
    iconKey: "users",
    menuOrder: 90,
    ownerContext: "workforce_compensation",
    ownedEntities: ["WorkOrder", "WorkOutput", "CompensationBatch", "EmployeeLedgerEntry", "EmployeePayment"],
    readModels: ["employee_balance_view"],
    commands: [
      command({
        name: "claimOpenSalesWorkOrder",
        label: "Nhận đơn mới",
        description: "Thợ nhận đơn giao hàng đang mở. Hệ thống chỉ khóa đơn cho người nhận hợp lệ đầu tiên.",
        kind: "workflow",
        criticality: "normal",
        permission: "workforce.claim_open_order",
        idempotent: true,
        auditEvent: "OpenSalesWorkOrderClaimed",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createWorkOrderDraft",
        label: "Tạo phiếu công",
        description: "Tạo phiếu công chọ duyệt và bảng công nháp, chưa ghi nhận tiền công.",
        kind: "create",
        criticality: "compensation",
        permission: "workforce.create",
        idempotent: true,
        auditEvent: "WorkOrderDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "recordWorkOrderLocation",
        label: "Ghi ví trí",
        description: "Lưu toả độ vì trí để theo dọi giao hàng của thợ nhận đơn.",
        kind: "workflow",
        criticality: "normal",
        permission: "workforce.record_location",
        idempotent: true,
        auditEvent: "WorkOrderLocationRecorded",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createEmployeePaymentDraft",
        label: "Tạo phiếu thanh toán nhân viên",
        description: "Tạo phiếu thanh toán công nháp cho nhân viên, chưa ghi giảm quỹ.",
        kind: "create",
        criticality: "financial",
        permission: "cash.create_employee_payment",
        idempotent: true,
        auditEvent: "EmployeePaymentDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "createEmployeeAdvanceDraft",
        label: "Tạo phiếu tạm ứng",
        description: "Tạo phiếu tạm ứng nhân viên ở trạng thái nháp, chưa làm thay đổi quỹ.",
        kind: "create",
        criticality: "financial",
        permission: "cash.create_employee_advance",
        idempotent: true,
        auditEvent: "EmployeeAdvanceDraftCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "approveWorkOutput",
        label: "Duyệt sản lượng",
        description: "Khóa sản lượng được duyệt trước khi tính công.",
        kind: "workflow",
        criticality: "compensation",
        permission: "workforce.approve_output",
        idempotent: true,
        auditEvent: "WorkOutputApproved",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "postCompensation",
        label: "Post bảng công",
        description: "Chia công theo hệ số và ghi sổ tiền công nhân viên.",
        kind: "posting",
        criticality: "compensation",
        permission: "compensation.post",
        idempotent: true,
        auditEvent: "CompensationPosted",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "payEmployee",
        label: "Thanh toán nhân viên",
        description: "Thanh toán một phần công đã chốt cho nhân viên.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.pay_employee",
        idempotent: true,
        auditEvent: "EmployeePaymentConfirmed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "reverseEmployeePayment",
        label: "Đảo thanh toán nhân viên",
        description: "Ghi bút toán đảo quỹ và công phải trả, không sửa trực tiếp phiếu thanh toán đã xác nhận.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.reverse_employee_payment",
        idempotent: true,
        auditEvent: "EmployeePaymentReversed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "confirmEmployeeAdvance",
        label: "Xác nhận tạm ứng",
        description: "Ghi giảm quỹ và ghi Nợ sổ nhân viên cho phiếu tạm ứng đã duyệt.",
        kind: "posting",
        criticality: "financial",
        permission: "cash.confirm_employee_advance",
        idempotent: true,
        auditEvent: "EmployeeAdvanceConfirmed",
        transactionBoundary: "cross_module"
      }),
      command({
        name: "reverseEmployeeAdvance",
        label: "Đảo tạm ứng",
        description: "Ghi bút toán quỹ và sổ nhân viên ngược chiều, bắt buộc có lý do.",
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
    invariants: ["Sản lượng đã tính công không được tính lại.", "Tổng tiền chia phải bằng tổng tiền công."]
  },
  {
    id: "import",
    technicalName: "vlxd.import",
    label: "Import Excel",
    title: "Import Excel",
    subtitle: "Kiểm tra vấn đề trước khi chạy thử import, không lấy báo cáo Excel làm nguồn sự thật.",
    iconKey: "file-spreadsheet",
    menuOrder: 100,
    ownerContext: "import",
    ownedEntities: ["ImportIssue"],
    readModels: [],
    commands: [
      command({
        name: "createImportDryRun",
        label: "Chạy thử workbook",
        description: "Đọc workbook thật, tạo fingerprint và issue; không post dòng giao dịch.",
        kind: "create",
        criticality: "import",
        permission: "import.create_dry_run",
        idempotent: true,
        auditEvent: "ImportDryRunCreated",
        transactionBoundary: "cross_module"
      }),
      
      command({
        name: "createImportIssue",
        label: "Tạo vấn đề import",
        description: "Tạo vấn đề cần kiểm tra cho dòng Excel nghi ngờ.",
        kind: "create",
        criticality: "import",
        permission: "import.create_issue",
        idempotent: true,
        auditEvent: "ImportIssueCreated",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "resolveImportIssue",
        label: "Xử lý vấn đề import",
        description: "Đánh dấu vấn đề import đã được xử lý.",
        kind: "workflow",
        criticality: "import",
        permission: "import.resolve_issue",
        idempotent: true,
        auditEvent: "ImportIssueResolved",
        transactionBoundary: "single_aggregate"
      }),
      command({
        name: "ignoreImportIssue",
        label: "Bỏ qua cảnh báo import",
        description: "Bỏ qua cảnh báo import không nghiêm trọng, lỗi import vẫn phải xử lý.",
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
        name: "Vấn đề import",
        entity: "ImportIssue",
        states: ["open", "resolved", "ignored"],
        transitions: [
          { from: "open", to: "resolved", command: "resolveImportIssue" },
          { from: "open", to: "ignored", command: "ignoreImportIssue" }
        ]
      }
    ],
    invariants: ["Không import cột tổng/còn lại như nguồn sự thật.", "Chỉ cảnh báo import mới được bỏ qua; lỗi import bắt buộc xử lý."]
  },
  {
    id: "audit",
    technicalName: "vlxd.audit",
    label: "Audit",
    title: "Nhật ký kiểm toán",
    subtitle: "Theo dõi người thao tác, vai trò, quyền sử dụng, chứng từ đích và thời điểm thay đổi.",
    iconKey: "clipboard-check",
    menuOrder: 105,
    ownerContext: "audit",
    ownedEntities: ["AuditLog"],
    readModels: ["audit_log_view"],
    commands: [],
    workflows: [],
    invariants: ["Mọi posting, approval, reversal và override phải có audit trail."]
  },
  {
    id: "reporting",
    technicalName: "vlxd.reporting",
    label: "Báo cáo",
    title: "Báo cáo",
    subtitle: "Báo cáo chỉ đọc từ sổ công nợ, phát sinh kho và giao dịch quỹ.",
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
    invariants: ["Báo cáo không lưu số tổng độc lập với sổ chi tiết và phát sinh kho."]
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
    operationsErpRegistry.commandByName.get(operation)?.description ?? "Thao tác nghiệp vụ."
  ])
) as Record<OperationName, string>;

