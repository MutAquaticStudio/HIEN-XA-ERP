export type FullErpContext =
  | "identity"
  | "parties"
  | "catalog"
  | "sales"
  | "procurement"
  | "inventory"
  | "delivery"
  | "receivables"
  | "payables"
  | "cash"
  | "workforce"
  | "compensation"
  | "reporting"
  | "import"
  | "audit";

export type FullErpStatus = "core_ready" | "hardening_required" | "planned";

export type FullErpCapability = {
  id: string;
  module: string;
  ownerContext: FullErpContext;
  status: FullErpStatus;
  currentCoverage: string;
  productionGap: string;
  productionCritical: boolean;
};

export type FullErpCompletionSummary = {
  total: number;
  coreReady: number;
  hardeningRequired: number;
  planned: number;
  productionCriticalOpen: number;
  contextCoverage: number;
  requiredContexts: number;
};

export const requiredFullErpContexts: FullErpContext[] = [
  "identity",
  "parties",
  "catalog",
  "sales",
  "procurement",
  "inventory",
  "delivery",
  "receivables",
  "payables",
  "cash",
  "workforce",
  "compensation",
  "reporting",
  "import",
  "audit"
];

export const fullErpStatusLabels: Record<FullErpStatus, string> = {
  core_ready: "Hạt nhân đã chạy",
  hardening_required: "Cần gia cố trước triển khai",
  planned: "Cần triển khai"
};

export const fullErpCapabilities: FullErpCapability[] = [
  {
    id: "identity-rbac",
    module: "Định danh và phân quyền",
    ownerContext: "identity",
    status: "hardening_required",
    currentCoverage: "Sổ đăng ký có quyền cho từng lệnh, phạm vi kho, vai trò Administrator/Viewer và actor production fail-closed khi chưa có định danh server.",
    productionGap: "Kết nối Supabase Auth, ánh xạ app_users/nhân viên, phiên đăng nhập thật và kiểm thử RLS trên database đang chạy.",
    productionCritical: true
  },
  {
    id: "erp-framework",
    module: "Khung ERP nội bộ",
    ownerContext: "audit",
    status: "core_ready",
    currentCoverage: "Đã có sổ đăng ký, mô tả lệnh, mã chống chạy trùng phía máy chủ, nhật ký kiểm toán và ánh xạ kiểu Odoo.",
    productionGap: "Đóng gói thành giao ước cố định cho di trú dữ liệu, phân quyền và tiện ích mở rộng Odoo nếu tách sau.",
    productionCritical: false
  },
  {
    id: "master-parties",
    module: "Khách hàng và nhà cung cấp",
    ownerContext: "parties",
    status: "core_ready",
    currentCoverage: "Tạo nhanh, chống trùng cơ bản, tìm kiếm không dấu và dropdown dùng cùng master data.",
    productionGap: "Bổ sung merge trùng, lịch sử thay đổi, hạn mức nợ và import đối soát danh mục.",
    productionCritical: true
  },
  {
    id: "catalog-product-units",
    module: "Vật tư, đơn vị và kho",
    ownerContext: "catalog",
    status: "core_ready",
    currentCoverage: "Mã vật tư, tên vật tư, đơn vị tồn kho và đơn vị giao dịch có snapshot quy đổi được dùng xuyên suốt form bán/mua, nhận/giao và sổ kho.",
    productionGap: "Bổ sung bảng giá nhiều mức, mã vạch và chính sách giá theo khách.",
    productionCritical: true
  },
  {
    id: "sales-flow",
    module: "Bán hàng",
    ownerContext: "sales",
    status: "core_ready",
    currentCoverage: "Đơn bán nhiều dòng, nháp/xác nhận, ảnh chụp giá, phân bổ nguồn hàng và lưu file bền vững qua command transaction.",
    productionGap: "Cần adapter PostgreSQL/Supabase, in phiếu, sửa dòng nháp có optimistic locking và lịch sử thay đổi chi tiết.",
    productionCritical: true
  },
  {
    id: "procurement-flow",
    module: "Mua hàng",
    ownerContext: "procurement",
    status: "core_ready",
    currentCoverage: "Đơn mua nhập kho hoặc giao thẳng, danh sách chọn nhà cung cấp và ghi nhập theo từng dòng.",
    productionGap: "Bổ sung duyệt mua, hóa đơn nhà cung cấp, chi phí mua hàng và đối soát công nợ nhà cung cấp.",
    productionCritical: true
  },
  {
    id: "inventory-ledger",
    module: "Kho và giá vốn",
    ownerContext: "inventory",
    status: "hardening_required",
    currentCoverage: "Tồn kho append-only, moving average theo giá trị tồn có dấu, nhập nhiều đợt, chuyển kho hai chiều, kiểm kê và reversal có lý do.",
    productionGap: "Áp dụng adapter PostgreSQL, khóa kỳ, landed cost và kiểm thử transaction song song trên database thật.",
    productionCritical: true
  },
  {
    id: "delivery-operations",
    module: "Giao hàng",
    ownerContext: "delivery",
    status: "core_ready",
    currentCoverage: "Chuyến giao có tài xế/xe, chặn trùng lịch, loading/in-transit, giao từng phần, người nhận/evidence, thất bại có lý do và đảo giao thẳng.",
    productionGap: "Adapter hiện tại đã lưu ảnh thật private ở local; production cần Supabase Storage/signed access, nhiều điểm giao, chi phí xe và định vị GPS tùy chọn.",
    productionCritical: true
  },
  {
    id: "receivables-ledger",
    module: "Công nợ khách hàng",
    ownerContext: "receivables",
    status: "core_ready",
    currentCoverage: "Phải thu phát sinh từ sổ công nợ; kiểm tra quy tắc chặn phân bổ vượt phiếu thu hoặc vượt dòng công nợ.",
    productionGap: "Bổ sung sao kê khách hàng, tuổi nợ, nhắc nợ, ghi đảo và điều chỉnh có duyệt.",
    productionCritical: true
  },
  {
    id: "payables-ledger",
    module: "Công nợ nhà cung cấp",
    ownerContext: "payables",
    status: "core_ready",
    currentCoverage: "Phải trả phát sinh từ nhập/giao thẳng, phiếu chi nhà cung cấp xác nhận qua luồng xử lý.",
    productionGap: "Bổ sung hóa đơn NCC, lịch thanh toán, đối soát công nợ và điều chỉnh có nhật ký.",
    productionCritical: true
  },
  {
    id: "cashbook",
    module: "Quỹ tiền mặt và ngân hàng",
    ownerContext: "cash",
    status: "hardening_required",
    currentCoverage: "Phiếu thu/chi nội bộ, khách hàng, nhà cung cấp, nhân viên và tạm ứng đều đối chiếu cặp cash/sub-ledger; cash out không làm âm quỹ.",
    productionGap: "Cần nhiều tài khoản quỹ/ngân hàng, khóa sổ, đối soát ngân hàng và chứng từ đính kèm qua Storage.",
    productionCritical: true
  },
  {
    id: "workforce-output",
    module: "Công việc và sản lượng",
    ownerContext: "workforce",
    status: "core_ready",
    currentCoverage: "Phiếu công việc, sản lượng, duyệt sản lượng và chống ghi nhận lặp trong luồng xử lý.",
    productionGap: "Bổ sung đội nhóm, định mức nhiều loại công, ảnh nghiệm thu và phân quyền tổ trưởng.",
    productionCritical: true
  },
  {
    id: "compensation-payments",
    module: "Tiền công và tạm ứng",
    ownerContext: "compensation",
    status: "core_ready",
    currentCoverage: "Tiền công từ sản lượng duyệt, chia theo hệ số, thanh toán/tạm ứng/reversal và báo cáo tách compensation/payment/advance.",
    productionGap: "Bổ sung kỳ lương, đội nhóm nâng cao, điều chỉnh có duyệt và sao kê nhân viên.",
    productionCritical: true
  },
  {
    id: "excel-import",
    module: "Import và đối soát Excel",
    ownerContext: "import",
    status: "hardening_required",
    currentCoverage: "Đọc workbook .xlsx thật, fingerprint SHA-256, profiling sheet tháng, phát hiện ngày/text/VAT/trùng/serial và batch chỉ reviewed khi hết issue mở.",
    productionGap: "Cần nối import_rows PostgreSQL, màn ánh xạ master data, approval và post dữ liệu đã đối soát vào sổ.",
    productionCritical: true
  },
  {
    id: "management-reporting",
    module: "Báo cáo quản trị",
    ownerContext: "reporting",
    status: "hardening_required",
    currentCoverage: "Dashboard polling theo revision; báo cáo tháng ghi nhận doanh thu khi giao, COGS kho/direct, lãi gộp, CSV + dashboard HTML + manifest trong ZIP và audit section.",
    productionGap: "Cần Supabase Realtime, tuổi nợ, lãi theo đơn, PDF và Postgres views/materialized views cho dữ liệu lớn.",
    productionCritical: true
  },
  {
    id: "audit-trail",
    module: "Nhật ký và bất biến chứng từ",
    ownerContext: "audit",
    status: "core_ready",
    currentCoverage: "Audit bền vững trong file state có actor role, permission, target, correlation id, before/after và lý do bắt buộc cho reversal/failure.",
    productionGap: "Cần ghi vào audit_logs PostgreSQL bằng actor Supabase thật, retention policy và xuất kiểm toán theo quyền.",
    productionCritical: true
  },
  {
    id: "attachments-storage",
    module: "Chứng từ đính kèm",
    ownerContext: "audit",
    status: "hardening_required",
    currentCoverage: "Ảnh phiếu nhập JPG/PNG/WEBP được kiểm tra magic bytes, giới hạn 8 MB, lưu private file, có SHA-256, MIME, kích thước, metadata và route xem theo quyền.",
    productionGap: "Đổi local attachment adapter sang Supabase Storage, signed URL ngắn hạn, tải PDF, quét bằng điện thoại và retention/virus scanning.",
    productionCritical: true
  },
  {
    id: "offline-pwa",
    module: "PWA và nháp ngoại tuyến",
    ownerContext: "delivery",
    status: "hardening_required",
    currentCoverage: "Có manifest và service worker lưu khung ứng dụng/các lệnh đọc GET; không xếp hàng hoặc phát lại POST chứng từ.",
    productionGap: "Cần dữ liệu đọc đã lưu tạm, bản nháp cục bộ, ảnh chờ tải lên và chặn ghi chứng từ tài chính khi ngoại tuyến.",
    productionCritical: false
  }
];

export function summarizeFullErpCompletion(
  capabilities: FullErpCapability[] = fullErpCapabilities
): FullErpCompletionSummary {
  const contexts = new Set(capabilities.map((capability) => capability.ownerContext));
  const summary: FullErpCompletionSummary = {
    total: capabilities.length,
    coreReady: 0,
    hardeningRequired: 0,
    planned: 0,
    productionCriticalOpen: 0,
    contextCoverage: contexts.size,
    requiredContexts: requiredFullErpContexts.length
  };

  for (const capability of capabilities) {
    if (capability.status === "core_ready") {
      summary.coreReady += 1;
    }

    if (capability.status === "hardening_required") {
      summary.hardeningRequired += 1;
    }

    if (capability.status === "planned") {
      summary.planned += 1;
    }

    if (capability.productionCritical && capability.status !== "core_ready") {
      summary.productionCriticalOpen += 1;
    }
  }

  return summary;
}

export function missingFullErpContexts(capabilities: FullErpCapability[] = fullErpCapabilities): FullErpContext[] {
  const coveredContexts = new Set(capabilities.map((capability) => capability.ownerContext));

  return requiredFullErpContexts.filter((context) => !coveredContexts.has(context));
}
