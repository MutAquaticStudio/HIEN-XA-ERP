import Link from "next/link";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { formatMoney, formatQuantity } from "@/lib/format";
import { canCreateCatalog, canEditCatalog, catalogDisplayName, catalogPath, getCatalogSummary, type CatalogKind } from "@/server/erp-v2/catalog-read-model";
import { notFound } from "next/navigation";
import type { Customer, Employee, OperationsState, ProductUnit, Supplier, Vehicle, Warehouse } from "@/modules/operations/types";
import type { CatalogAccess } from "@/server/erp-v2/catalog-read-model";

type CatalogRecord = Customer | Supplier | ProductUnit | Warehouse | Vehicle | Employee;

const statusLabel: Record<"active" | "inactive", string> = { active: "Đang hoạt động", inactive: "Tạm ngưng" };

export function CatalogListPage({ access, kind, query }: { access: CatalogAccess; kind: CatalogKind; query: { q?: string; status?: string } }) {
  const q = normalizeSearch(query.q ?? "");
  const status = query.status === "inactive" ? "inactive" : query.status === "active" ? "active" : "";
  const all = access.snapshot.state[collectionKey(kind)] as CatalogRecord[];
  const rows = all.filter((record) => {
    const text = normalizeSearch(JSON.stringify(record));
    return (!q || text.includes(q)) && (!status || record.status === status);
  });
  const title = catalogDisplayName(kind);
  return (
    <>
      <header className="erp-v2-page-header">
        <div><p className="erp-v2-eyebrow">Danh mục nền</p><h1>{title}</h1><p className="erp-v2-page-description">Dữ liệu dùng chung cho các luồng nghiệp vụ. Mỗi bản ghi giữ nguyên ID nguồn.</p></div>
        {canCreateCatalog(access.user, kind) ? <Link className="erp-v2-button primary" href={`${catalogPath(kind)}/new`}>Tạo {createActionLabel(kind)}</Link> : null}
        <span className="erp-v2-count">{rows.length} / {all.length} bản ghi</span>
      </header>
      <section className="erp-v2-toolbar" aria-label={`Tìm kiếm ${title}`}>
        <form className="erp-v2-search-form" method="get">
          <label htmlFor="catalog-search"><span className="sr-only">Tìm kiếm</span><Search aria-hidden="true" /><input id="catalog-search" name="q" defaultValue={query.q ?? ""} placeholder="Tìm theo mã hoặc tên, có thể bỏ dấu" /></label>
          <label htmlFor="catalog-status"><span className="sr-only">Trạng thái</span><select id="catalog-status" name="status" defaultValue={status}><option value="">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Tạm ngưng</option></select></label>
          <button className="erp-v2-button primary" type="submit">Lọc danh sách</button>
        </form>
      </section>
      <section className="erp-v2-panel" aria-labelledby="catalog-records-title">
        <div className="erp-v2-panel-header"><div><h2 id="catalog-records-title">Danh sách {title.toLocaleLowerCase("vi-VN")}</h2><p>Chọn một bản ghi để xem chi tiết và lịch sử liên quan.</p></div></div>
        {rows.length ? <CatalogTable kind={kind} rows={rows} /> : <div className="erp-v2-empty"><h2>Chưa có dữ liệu phù hợp</h2><p>Thử xoá bộ lọc hoặc kiểm tra phạm vi quyền hiện tại.</p></div>}
      </section>
    </>
  );
}

export function CatalogDetailPage({ access, kind, id, created }: { access: CatalogAccess; kind: CatalogKind; id: string; created?: boolean }) {
  const state = access.snapshot.state;
  const record = (state[collectionKey(kind)] as CatalogRecord[]).find((item) => item.id === id);
  if (!record) {
    notFound();
  }
  const title = catalogDisplayName(kind);
  const summary = detailSummary(kind, record, state);
  const tabs = detailTabs(kind);
  return (
    <>
      <div className="erp-v2-back-link"><Link href={catalogPath(kind)}><ArrowLeft aria-hidden="true" />Quay lại {title.toLocaleLowerCase("vi-VN")}</Link></div>
      {created ? <p className="form-success" role="status">Đã tạo bản ghi authoritative thành công. Bản ghi đã sẵn sàng cho các module downstream.</p> : null}
      <header className="erp-v2-detail-header"><div><p className="erp-v2-eyebrow">{title}</p><h1>{recordName(record)}</h1><p className="erp-v2-identity-line">{recordCode(record)} · ID {record.id}</p></div><div className="erp-v2-detail-actions"><span className={`erp-v2-status ${record.status === "active" ? "success" : "neutral"}`}>{statusLabel[record.status]}</span><Link className="erp-v2-button" href={catalogPath(kind)}>Mở danh sách</Link></div></header>
      <div className="erp-v2-detail-top"><section className="erp-v2-panel erp-v2-profile"><div className="erp-v2-panel-header"><div><h2>Thông tin chính</h2><p>Thông tin đọc từ bản ghi master hiện tại.</p></div></div><dl className="erp-v2-detail-fields">{detailFields(kind, record).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl></section><section className="erp-v2-panel erp-v2-summary"><div className="erp-v2-panel-header"><div><h2>Tóm tắt vận hành</h2><p>Số liệu dẫn xuất, không chỉnh sửa trực tiếp.</p></div></div><div className="erp-v2-summary-grid">{summary.map(([label, value, type]) => <div key={label}><span>{label}</span><strong>{type === "money" ? formatMoney(value) : type === "quantity" ? formatQuantity(value) : value}</strong></div>)}</div></section></div>
      {canEditCatalog(access.user) ? <div className="erp-v2-detail-actions"><Link className="erp-v2-button primary" href={`${catalogPath(kind, id)}/edit`}>Chỉnh sửa</Link></div> : null}
      <section className="erp-v2-detail-tabs" aria-label={`Nội dung ${title.toLocaleLowerCase("vi-VN")}`}>
        <nav className="erp-v2-tab-list" aria-label={`Các phần của ${title.toLocaleLowerCase("vi-VN")}`}>
          {tabs.map((tab, index) => <a className={index === 0 ? "is-active" : ""} href={`#${tab.id}`} key={tab.id}>{tab.label}</a>)}
        </nav>
        {tabs.map((tab, index) => <section className={index === 0 ? "erp-v2-tab-panel is-visible" : "erp-v2-tab-panel"} id={tab.id} key={tab.id}><h2>{tab.label}</h2><p>{tab.description}</p>{detailTabContent(kind, tab.id, record, state)}</section>)}
      </section>
    </>
  );
}

function CatalogTable({ kind, rows }: { kind: CatalogKind; rows: CatalogRecord[] }) {
  return <div className="erp-v2-record-list"><table aria-label={`Danh sách ${catalogDisplayName(kind).toLocaleLowerCase("vi-VN")}`}><thead><tr><th scope="col">Mã</th><th scope="col">Tên / mô tả</th><th scope="col">Thông tin chính</th><th scope="col">Trạng thái</th><th scope="col"><span className="sr-only">Mở</span></th></tr></thead><tbody>{rows.map((record) => <tr key={record.id}><td data-label="Mã"><strong>{recordCode(record)}</strong></td><td data-label="Tên / mô tả"><Link className="erp-v2-record-link" href={catalogPath(kind, record.id)}>{recordName(record)}</Link></td><td data-label="Thông tin chính">{recordMeta(kind, record)}</td><td data-label="Trạng thái"><span className={`erp-v2-status ${record.status === "active" ? "success" : "neutral"}`}>{statusLabel[record.status]}</span></td><td data-label="Mở"><Link className="erp-v2-icon-link" aria-label={`Mở ${recordName(record)}`} href={catalogPath(kind, record.id)}><ArrowRight aria-hidden="true" /></Link></td></tr>)}</tbody></table></div>;
}

function detailTabContent(kind: CatalogKind, tabId: string, record: CatalogRecord, state: OperationsState) {
  if (kind === "customers") {
    const orders = state.salesOrders.filter((order) => order.customerId === record.id);
    const payments = state.customerPayments.filter((payment) => payment.customerId === record.id);
    const entries = state.customerLedgerEntries.filter((entry) => entry.customerId === record.id);
    if (tabId === "orders") return <MiniRows rows={orders.slice(0, 12).map((order) => ({ title: order.documentNo, detail: `${order.orderDate} · ${order.status}`, value: formatMoney(order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)) }))} empty="Chưa có đơn bán liên quan." />;
    if (tabId === "debt") return <SummaryNote label="Đang nợ" value={formatMoney(getCatalogSummary(state, kind, record.id).items[2]?.[1] ?? 0)} note="Số dư chỉ đọc, dẫn xuất từ các phát sinh đã ghi nhận." />;
    if (tabId === "payments") return <MiniRows rows={payments.slice(0, 12).map((payment) => ({ title: payment.documentNo, detail: payment.status, value: formatMoney(payment.amount) }))} empty="Chưa có khoản thu liên quan." />;
    if (tabId === "entries") return <MiniRows rows={entries.slice(0, 12).map((entry) => ({ title: entry.sourceDocument, detail: `${entry.postingDate} · ${entry.direction === "debit" ? "Ghi tăng" : "Ghi giảm"}`, value: formatMoney(entry.amount) }))} empty="Chưa có bút toán liên quan." />;
    return <AuditRows state={state} recordId={record.id} />;
  }
  if (kind === "suppliers") {
    const orders = state.purchaseOrders.filter((order) => order.supplierId === record.id);
    const payments = state.supplierPayments.filter((payment) => payment.supplierId === record.id);
    const entries = state.supplierLedgerEntries.filter((entry) => entry.supplierId === record.id);
    if (tabId === "orders") return <MiniRows rows={orders.slice(0, 12).map((order) => ({ title: order.documentNo, detail: `${order.orderDate} · ${order.status}`, value: formatQuantity(order.lines.reduce((sum, line) => sum + line.orderedQuantity, 0)) }))} empty="Chưa có đơn mua liên quan." />;
    if (tabId === "debt") return <SummaryNote label="Còn phải trả" value={formatMoney(getCatalogSummary(state, kind, record.id).items[2]?.[1] ?? 0)} note="Số dư chỉ đọc, dẫn xuất từ các phát sinh đã ghi nhận." />;
    if (tabId === "payments") return <MiniRows rows={payments.slice(0, 12).map((payment) => ({ title: payment.documentNo, detail: payment.status, value: formatMoney(payment.amount) }))} empty="Chưa có khoản chi liên quan." />;
    if (tabId === "entries") return <MiniRows rows={entries.slice(0, 12).map((entry) => ({ title: entry.sourceDocument, detail: `${entry.postingDate} · ${entry.direction === "credit" ? "Ghi tăng" : "Ghi giảm"}`, value: formatMoney(entry.amount) }))} empty="Chưa có bút toán liên quan." />;
    return <AuditRows state={state} recordId={record.id} />;
  }
  if (kind === "products") {
    const product = record as ProductUnit;
    const conversions = state.purchaseUnitConversions.filter((item) => item.productUnitId === product.id);
    if (tabId === "overview") return <SummaryNote label="Trạng thái cổng khách hàng" value={product.visibleOnCustomerPortal === false ? "Đang ẩn" : "Đang hiển thị"} note={product.orderableOnline === false ? "Không cho đặt trực tuyến." : "Chính sách đặt hàng lấy từ Product master."} />;
    if (tabId === "conversions") return <MiniRows rows={conversions.map((conversion) => ({ title: state.unitDefinitions.find((unit) => unit.id === conversion.unitId)?.name ?? conversion.unitId, detail: conversion.conversionMode === "fixed" ? "Quy đổi cố định · không nhập lại khi lập chứng từ" : "Quy đổi biến đổi · cần số thực tế", value: conversion.factorToBase === null ? "—" : `${conversion.factorToBase} ×` }))} empty="Chưa có quy đổi đơn vị được cấu hình." />;
    if (tabId === "stock") return <MiniRows rows={productStockRows(state, product.id)} empty="Chưa có phát sinh tồn kho." />;
    if (tabId === "prices") return <MiniRows rows={(product.priceHistory ?? []).map((item) => ({ title: `Phiên bản ${item.version}`, detail: `${item.changedAt.slice(0, 10)} · ${item.reason}`, value: item.next.salePrice === undefined ? "Chưa có giá" : formatMoney(item.next.salePrice) }))} empty="Chưa có lịch sử giá." />;
    if (tabId === "trade") return <MiniRows rows={[
      ...state.salesOrders.filter((order) => order.lines.some((line) => line.productUnitId === product.id)).slice(0, 6).map((order) => ({ title: `Bán · ${order.documentNo}`, detail: `${order.orderDate} · ${order.status}`, value: formatQuantity(order.lines.filter((line) => line.productUnitId === product.id).reduce((sum, line) => sum + line.quantity, 0)) })),
      ...state.purchaseOrders.filter((order) => order.lines.some((line) => line.productUnitId === product.id)).slice(0, 6).map((order) => ({ title: `Mua · ${order.documentNo}`, detail: `${order.orderDate} · ${order.status}`, value: formatQuantity(order.lines.filter((line) => line.productUnitId === product.id).reduce((sum, line) => sum + line.orderedQuantity, 0)) }))
    ]} empty="Chưa có chứng từ mua / bán liên quan." />;
    return <AuditRows state={state} recordId={record.id} />;
  }
  if (kind === "warehouses") {
    const warehouse = record as Warehouse;
    if (tabId === "stock") return <MiniRows rows={warehouseStockRows(state, warehouse.id)} empty="Chưa có tồn kho dẫn xuất tại kho này." />;
    if (tabId === "movements") return <MiniRows rows={state.inventoryMovements.filter((movement) => movement.warehouseId === warehouse.id).slice(0, 12).map((movement) => ({ title: movement.sourceDocument, detail: `${movement.postedAt.slice(0, 10)} · ${movement.movementType}`, value: formatQuantity(movement.quantity) }))} empty="Chưa có phát sinh kho." />;
    if (tabId === "counts") return <MiniRows rows={(state.inventoryCountSessions ?? []).filter((session) => session.warehouseId === warehouse.id).map((session) => ({ title: session.documentNo, detail: `${session.createdAt.slice(0, 10)} · ${session.status}`, value: formatQuantity(session.lines.length) }))} empty="Chưa có phiên kiểm kê." />;
    if (tabId === "transfers") return <MiniRows rows={state.inventoryMovements.filter((movement) => movement.warehouseId === warehouse.id && ["transfer_in", "transfer_out"].includes(movement.movementType)).map((movement) => ({ title: movement.sourceDocument, detail: movement.movementType, value: formatQuantity(movement.quantity) }))} empty="Chưa có chuyển kho." />;
    return <AuditRows state={state} recordId={record.id} />;
  }
  if (kind === "employees") {
    const work = state.workOrders.filter((order) => order.participants.some((participant) => participant.employeeId === record.id) || order.claimedByEmployeeId === record.id);
    const entries = state.employeeLedgerEntries.filter((entry) => entry.employeeId === record.id);
    if (tabId === "work") return <MiniRows rows={work.slice(0, 12).map((order) => ({ title: order.documentNo, detail: `${order.workDate} · ${order.workType} · ${order.status}`, value: formatQuantity(order.outputs.length) }))} empty="Chưa có công việc liên quan." />;
    if (tabId === "compensation") return <MiniRows rows={entries.filter((entry) => entry.entryType === "compensation" || !entry.entryType).map((entry) => ({ title: entry.sourceDocument, detail: entry.postingDate, value: formatMoney(entry.amount) }))} empty="Chưa có tiền công được ghi nhận." />;
    if (tabId === "payments") return <MiniRows rows={[
      ...state.employeePayments.filter((payment) => payment.employeeId === record.id).map((payment) => ({ title: payment.documentNo, detail: `Thanh toán · ${payment.status}`, value: formatMoney(payment.amount) })),
      ...state.employeeAdvances.filter((advance) => advance.employeeId === record.id).map((advance) => ({ title: advance.documentNo, detail: `Tạm ứng · ${advance.purpose}`, value: formatMoney(advance.amount) }))
    ]} empty="Chưa có thanh toán hoặc tạm ứng." />;
    return <AuditRows state={state} recordId={record.id} />;
  }
  const vehicle = record as Vehicle;
  if (tabId === "info") return <SummaryNote label="Dữ liệu theo dõi" value="Chưa có telemetry" note="Trang này chỉ hiển thị thông tin phương tiện và chuyến giao đã ghi nhận." />;
  if (tabId === "deliveries") return <MiniRows rows={state.deliveryJobs.filter((job) => job.vehicleId === vehicle.id).slice(0, 12).map((job) => ({ title: job.documentNo, detail: `${job.plannedDate} · ${job.status}`, value: job.salesOrderId }))} empty="Chưa có chuyến giao liên quan." />;
  return <AuditRows state={state} recordId={record.id} />;
}

function MiniRows({ rows, empty }: { rows: Array<{ title: string; detail: string; value?: string }>; empty: string }) {
  return rows.length ? <div className="erp-v2-mini-list">{rows.map((row, index) => <div key={`${row.title}-${index}`}><strong>{row.title}</strong><span>{row.detail}{row.value ? ` · ${row.value}` : ""}</span></div>)}</div> : <div className="erp-v2-empty compact"><p>{empty}</p></div>;
}

function SummaryNote({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="erp-v2-detail-note"><strong>{label}: {value}</strong><p>{note}</p></div>;
}

function AuditRows({ state, recordId }: { state: OperationsState; recordId: string }) {
  return <MiniRows rows={state.auditLogs.filter((log) => log.entityId === recordId || log.targetId === recordId).slice(0, 12).map((log) => ({ title: log.action, detail: `${log.occurredAt.slice(0, 10)} · ${log.actorName}`, value: log.summary }))} empty="Chưa có lịch sử ghi nhận trong phạm vi hiện tại." />;
}

function productStockRows(state: OperationsState, productId: string) {
  const totals = new Map<string, number>();
  for (const movement of state.inventoryMovements.filter((item) => item.productUnitId === productId)) totals.set(movement.warehouseId, (totals.get(movement.warehouseId) ?? 0) + movement.quantity);
  return [...totals.entries()].map(([warehouseId, quantity]) => ({ title: state.warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? warehouseId, detail: "Tồn dẫn xuất từ phát sinh kho", value: formatQuantity(quantity) }));
}

function warehouseStockRows(state: OperationsState, warehouseId: string) {
  const totals = new Map<string, number>();
  for (const movement of state.inventoryMovements.filter((item) => item.warehouseId === warehouseId)) totals.set(movement.productUnitId, (totals.get(movement.productUnitId) ?? 0) + movement.quantity);
  return [...totals.entries()].map(([productId, quantity]) => ({ title: state.productUnits.find((product) => product.id === productId)?.productName ?? productId, detail: "Tồn dẫn xuất, không chỉnh sửa trực tiếp", value: formatQuantity(quantity) }));
}

function collectionKey(kind: CatalogKind) {
  return ({ customers: "customers", suppliers: "suppliers", products: "productUnits", warehouses: "warehouses", vehicles: "vehicles", employees: "employees" } as const)[kind];
}

function recordName(record: CatalogRecord) {
  if ("displayName" in record) return record.displayName;
  if ("productName" in record) return record.productName;
  if ("name" in record) return record.name;
  if ("plateNumber" in record) return record.plateNumber;
  return (record as { id: string }).id;
}
function recordCode(record: CatalogRecord) {
  if ("code" in record) return record.code;
  if ("productCode" in record) return record.productCode;
  return (record as { id: string }).id;
}
function recordMeta(kind: CatalogKind, record: CatalogRecord) {
  if (kind === "customers" || kind === "suppliers") return "phone" in record ? record.phone || "Chưa có số điện thoại" : "";
  if (kind === "products") return `${(record as ProductUnit).unitName} · ${formatMoney((record as ProductUnit).salePrice ?? 0)}`;
  if (kind === "warehouses") return (record as Warehouse).name;
  if (kind === "vehicles") return `${(record as Vehicle).plateNumber} · ${formatQuantity((record as Vehicle).capacityTons)} tấn`;
  return (record as Employee).roleType;
}
function detailFields(kind: CatalogKind, record: CatalogRecord): Array<[string, string]> {
  if (kind === "customers") { const item = record as Customer; return [["Mã khách hàng", item.code], ["Điện thoại", item.phone], ["Hạn mức", formatMoney(item.creditLimit)], ["Điều khoản", item.paymentTermsNote ?? (item.paymentTermDays ? `${item.paymentTermDays} ngày` : "Chưa cấu hình")]]; }
  if (kind === "suppliers") { const item = record as Supplier; return [["Mã nhà cung cấp", item.code], ["Điện thoại", item.phone], ["Điều khoản", item.paymentTermsNote ?? (item.paymentTermDays ? `${item.paymentTermDays} ngày` : "Chưa cấu hình")]]; }
  if (kind === "products") { const item = record as ProductUnit; return [["Mã vật tư", item.productCode], ["Đơn vị cơ sở", item.unitName], ["Giá bán", item.salePrice === undefined ? "Chưa cấu hình" : formatMoney(item.salePrice)], ["VAT", item.saleTaxRate === undefined ? "Chưa cấu hình" : `${item.saleTaxRate * 100}%`], ["Hiển thị cổng khách", item.visibleOnCustomerPortal === false ? "Không" : "Có"]]; }
  if (kind === "warehouses") { const item = record as Warehouse; return [["Mã kho", item.code], ["Tên kho", item.name]]; }
  if (kind === "vehicles") { const item = record as Vehicle; return [["Mã phương tiện", item.code], ["Biển số", item.plateNumber], ["Tải trọng", `${formatQuantity(item.capacityTons)} tấn`]]; }
  const item = record as Employee; return [["Mã nhân sự", item.code], ["Vai trò", item.roleType], ["Trạng thái", statusLabel[item.status]]];
}
function detailTabs(kind: CatalogKind) {
  const tabs = {
    customers: [["orders", "Đơn hàng", "Các đơn bán gắn với khách hàng."], ["debt", "Công nợ", "Số dư được tính từ sổ ghi nhận."], ["payments", "Thanh toán", "Các khoản thu đã ghi nhận."], ["entries", "Bút toán", "Lịch sử ghi nhận liên quan."], ["history", "Lịch sử ghi nhận", "Các thay đổi đã audit."]],
    suppliers: [["orders", "Đơn mua", "Các đơn mua gắn với nhà cung cấp."], ["debt", "Công nợ", "Số phải trả tính từ sổ ghi nhận."], ["payments", "Thanh toán", "Các khoản chi đã ghi nhận."], ["entries", "Bút toán", "Lịch sử ghi nhận liên quan."], ["history", "Lịch sử ghi nhận", "Các thay đổi đã audit."]],
    products: [["overview", "Tổng quan", "Thông tin vật tư và trạng thái công khai."], ["conversions", "Quy đổi đơn vị", "Các quy đổi do người dùng cấu hình."], ["stock", "Tồn kho", "Số lượng tính từ inventory movements."], ["prices", "Giá & lịch sử", "Giá hiện tại và lịch sử thay đổi."], ["trade", "Mua / bán", "Các chứng từ có dùng vật tư."], ["history", "Lịch sử ghi nhận", "Các thay đổi đã audit."]],
    warehouses: [["stock", "Tồn kho", "Số lượng theo phát sinh kho."], ["movements", "Phát sinh", "Inventory movements append-only."], ["counts", "Kiểm kê", "Các phiên kiểm kê khi có dữ liệu."], ["transfers", "Chuyển kho", "Các chuyển kho liên quan."], ["history", "Lịch sử", "Các thay đổi đã audit."]],
    employees: [["work", "Công việc", "Phiếu công và việc đã tham gia."], ["compensation", "Tiền công", "Số tiền công từ ledger."], ["payments", "Thanh toán / tạm ứng", "Các khoản thanh toán và tạm ứng."], ["history", "Lịch sử", "Các thay đổi đã audit."]],
    vehicles: [["info", "Thông tin", "Thông tin phương tiện hiện tại."], ["deliveries", "Giao hàng", "Các chuyến giao đã gắn phương tiện."], ["history", "Lịch sử", "Các thay đổi đã audit."]]
  }[kind];
  return tabs.map(([id, label, description]) => ({ id, label, description }));
}
function detailSummary(kind: CatalogKind, record: CatalogRecord, state: CatalogAccess["snapshot"]["state"]): Array<[string, number, "money" | "count" | "quantity"]> {
  return getCatalogSummary(state, kind, record.id).items;
}

function createActionLabel(kind: CatalogKind) {
  return ({
    customers: "khách hàng",
    suppliers: "nhà cung cấp",
    products: "vật tư",
    warehouses: "kho / bãi",
    vehicles: "phương tiện",
    employees: "nhân sự"
  } as const)[kind];
}
function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}
