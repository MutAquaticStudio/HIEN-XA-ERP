"use client";

import Link from "next/link";
import { useContext, useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ClipboardCheck, PackagePlus, Search, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { buildInventoryStockRows, type InventoryStockRow } from "@/modules/operations/inventory-read-model";
import { getSelectableProducts, getSelectableWarehouses, productLabel, stockBalance } from "@/modules/operations/selectors";
import type { OperationsState } from "@/modules/operations/types";
import { InventoryCountSessionPanel } from "./inventory-count-session-panel";
import { NegativeStockOverridePanel } from "./negative-stock-override-panel";
import { OperationsActorContext, type OperationHandler, type QuickInventoryCountHandler } from "./operations-contract";
import { DataTable, FormField, SubmitButton, WorkflowActionButton, normalizeSearch, statusText } from "./operations-shared";

type InventorySection = "stock" | "movements" | "actions" | "counts" | "exceptions";
type InventoryDrawer = "opening" | "transfer" | null;

export function InventoryView({ state, revision, activePath, runOperation, runQuickInventoryCount, isPending }: {
  state: OperationsState;
  revision: number;
  activePath: string;
  runOperation: OperationHandler;
  runQuickInventoryCount: QuickInventoryCountHandler;
  isPending: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const activeSection = sectionFromPath(activePath);
  const allRows = useMemo(() => buildInventoryStockRows(state, actor), [actor, state]);
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [productUnitId, setProductUnitId] = useState("");
  const [unitName, setUnitName] = useState("");
  const [stockState, setStockState] = useState<"all" | "positive" | "zero" | "negative" | "low">("all");
  const [drawer, setDrawer] = useState<InventoryDrawer>(null);
  const [quickRow, setQuickRow] = useState<InventoryStockRow>();
  const warehouses = getSelectableWarehouses(state, actor);
  const products = getSelectableProducts(state);
  const unitNames = [...new Set(products.map((product) => product.unitName))].sort((left, right) => left.localeCompare(right, "vi"));
  const canCreateWarehouse = actor.permissions.includes("catalog.create_warehouse");
  const canQuickCount = ["inventory.create_count_session", "inventory.record_count_line", "inventory.submit_count_session"].every((permission) => actor.permissions.includes(permission));
  const filteredRows = allRows.filter((row) => {
    const query = normalizeSearch(search);
    if (query && !normalizeSearch(`${row.productCode} ${row.productName} ${row.warehouseName ?? ""} ${row.unitName}`).includes(query)) return false;
    if (warehouseId && row.warehouseId !== warehouseId) return false;
    if (productUnitId && row.productUnitId !== productUnitId) return false;
    if (unitName && row.unitName !== unitName) return false;
    if (stockState === "positive" && !(row.quantity !== undefined && row.quantity > 0)) return false;
    if (stockState === "zero" && row.quantity !== 0) return false;
    if (stockState === "negative" && !(row.quantity !== undefined && row.quantity < 0)) return false;
    if (stockState === "low" && !(row.quantity !== undefined && row.minimumQuantity !== undefined && row.quantity <= row.minimumQuantity)) return false;
    return true;
  });

  useEffect(() => {
    if (activeSection === "stock") return;
    document.getElementById(`inventory-${activeSection}`)?.scrollIntoView({ block: "start" });
  }, [activeSection]);

  return <div className="inventory-workspace">
    <nav className="inventory-section-nav" aria-label="Khu vực Kho và tồn">
      {([["stock", "Tồn kho hiện tại"], ["movements", "Phát sinh kho"], ["actions", "Tồn đầu kỳ & chuyển kho"], ["counts", "Kiểm kê & điều chỉnh"], ["exceptions", "Ngoại lệ tồn âm"]] as const).map(([section, label]) => <Link className={activeSection === section ? "is-active" : ""} href={`/inventory/stock?section=${section}#inventory-${section}`} key={section}>{label}</Link>)}
    </nav>

    <section className="panel inventory-section" id="inventory-stock">
      <div className="panel-header"><div><h2 className="panel-title">Tồn kho hiện tại</h2><p className="panel-note">Số tồn được tính từ phát sinh append-only; giao diện không sửa trực tiếp balance.</p></div></div>
      <div className="panel-body">
        {warehouses.length === 0 ? <div className="erp-v2-workspace-alert warning" role="status"><span>Chưa có kho/bãi trong phạm vi. Vật tư vẫn được liệt kê nhưng tồn hiển thị “—”, không được hiểu là bằng 0.</span>{canCreateWarehouse ? <Link className="erp-v2-button primary" href="/catalog/warehouses/new">Tạo kho/bãi</Link> : null}</div> : null}
        <div className="inventory-filter-grid">
          <label className="form-field inventory-search"><span>Tìm kho hoặc vật tư</span><span className="input-with-icon"><Search aria-hidden="true" /><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mã, tên vật tư hoặc kho" /></span></label>
          <FilterSelect label="Kho" value={warehouseId} onChange={setWarehouseId}><option value="">Tất cả kho</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</FilterSelect>
          <FilterSelect label="Vật tư" value={productUnitId} onChange={setProductUnitId}><option value="">Tất cả vật tư</option>{products.map((product) => <option key={product.id} value={product.id}>{product.productCode} · {product.productName}</option>)}</FilterSelect>
          <FilterSelect label="Đơn vị tồn gốc" value={unitName} onChange={setUnitName}><option value="">Tất cả đơn vị</option>{unitNames.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</FilterSelect>
          <FilterSelect label="Trạng thái tồn" value={stockState} onChange={(value) => setStockState(value as typeof stockState)}><option value="all">Tất cả</option><option value="positive">Còn hàng</option><option value="zero">Bằng 0</option><option value="low">Dưới ngưỡng đã cấu hình</option><option value="negative">Tồn âm</option></FilterSelect>
        </div>
        <DataTable headers={["Kho", "Vật tư", "Đơn vị gốc", "Tồn", "Ngưỡng", "Phát sinh", "Hành động"]} rows={filteredRows.map((row) => [
          row.warehouseName ?? <span className="muted" key="no-warehouse">Chưa có kho</span>,
          <span key="product"><strong>{row.productCode}</strong><br /><span className="muted">{row.productName}</span></span>,
          row.unitName,
          row.quantity === undefined ? <strong key="unknown" aria-label="Chưa xác định tồn kho">—</strong> : formatQuantity(row.quantity),
          row.minimumQuantity === undefined ? "—" : formatQuantity(row.minimumQuantity),
          row.movementCount.toString(),
          row.warehouseId && canQuickCount ? <button className="erp-v2-button" type="button" key="quick" onClick={() => setQuickRow(row)}><ClipboardCheck aria-hidden="true" /> Điều chỉnh tồn</button> : <span className="muted" key="none">—</span>
        ])} emptyText="Không có dòng tồn phù hợp bộ lọc." />
      </div>
    </section>

    <section className="panel inventory-section" id="inventory-movements">
      <div className="panel-header"><div><h2 className="panel-title">Phát sinh kho</h2><p className="panel-note">Chỉ ghi thêm, có chứng từ nguồn và mã ghi sổ; sai sót được xử lý bằng dòng đảo.</p></div></div>
      <div className="panel-body"><DataTable headers={["Loại", "Chứng từ", "Kho", "Vật tư", "Số lượng", "Mã ghi sổ", "Hành động"]} rows={state.inventoryMovements.slice().reverse().map((movement) => [
        statusText(movement.movementType), movement.sourceDocument,
        state.warehouses.find((warehouse) => warehouse.id === movement.warehouseId)?.name ?? movement.warehouseId,
        productLabel(state, movement.productUnitId), formatQuantity(movement.quantity), movement.postingKey,
        movement.reversedById ? <span key="reversed" className="muted">Đã đảo</span> : movement.movementType !== "reverse" ? <WorkflowActionButton key="reverse" operation="reverseInventoryMovement" state={state} runOperation={runOperation} isPending={isPending} label="Đảo" targetId={movement.id} /> : <span key="reverse-row" className="muted">Dòng đảo</span>
      ])} emptyText="Chưa có phát sinh kho." /></div>
    </section>

    <section className="panel inventory-section" id="inventory-actions">
      <div className="panel-header"><div><h2 className="panel-title">Tồn đầu kỳ & chuyển kho</h2><p className="panel-note">Mỗi thao tác tạo movement có chứng từ; biểu mẫu chỉ mở khi cần dùng.</p></div></div>
      <div className="panel-body inventory-action-launchers">
        {actor.permissions.includes("inventory.post_opening") ? <button className="erp-v2-button primary" type="button" onClick={() => setDrawer("opening")}><PackagePlus aria-hidden="true" /> Ghi tồn đầu kỳ</button> : null}
        {actor.permissions.includes("inventory.post_transfer") ? <button className="erp-v2-button" type="button" onClick={() => setDrawer("transfer")}>Chuyển kho</button> : null}
        {!actor.permissions.includes("inventory.post_opening") && !actor.permissions.includes("inventory.post_transfer") ? <p className="muted">Tài khoản hiện tại chỉ được xem phát sinh trong phạm vi được cấp.</p> : null}
      </div>
    </section>

    <section className="inventory-section" id="inventory-counts"><InventoryCountSessionPanel state={state} runOperation={runOperation} isPending={isPending} /><InventoryCountHistory state={state} /></section>
    <section className="inventory-section" id="inventory-exceptions"><NegativeStockOverridePanel state={state} runOperation={runOperation} isPending={isPending} /></section>

    {drawer ? <InventoryActionDrawer title={drawer === "opening" ? "Ghi tồn đầu kỳ" : "Chuyển kho"} onClose={() => setDrawer(null)}>{drawer === "opening" ? <OpeningInventoryForm state={state} runOperation={runOperation} isPending={isPending} onSaved={() => setDrawer(null)} /> : <InventoryTransferForm state={state} runOperation={runOperation} isPending={isPending} onSaved={() => setDrawer(null)} />}</InventoryActionDrawer> : null}
    {quickRow ? <QuickInventoryCountDialog row={quickRow} revision={revision} isPending={isPending} runQuickInventoryCount={runQuickInventoryCount} onClose={() => setQuickRow(undefined)} /> : null}
  </div>;
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="form-field"><span>{label}</span><select className="input" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function QuickInventoryCountDialog({ row, revision, isPending, runQuickInventoryCount, onClose }: { row: InventoryStockRow; revision: number; isPending: boolean; runQuickInventoryCount: QuickInventoryCountHandler; onClose: () => void }) {
  const titleId = useId();
  const [countedQuantity, setCountedQuantity] = useState(String(row.quantity ?? 0));
  const [idempotencyKey] = useState(() => `quick-count-${crypto.randomUUID()}`);
  const difference = Number(countedQuantity) - (row.quantity ?? 0);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); runQuickInventoryCount(new FormData(event.currentTarget), onClose); }
  return <div className="erp-v2-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isPending) onClose(); }}><section className="erp-v2-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <div className="erp-v2-modal-header"><div><p className="erp-v2-eyebrow">Phiếu kiểm kê một dòng</p><h2 id={titleId}>Điều chỉnh tồn</h2><p>{row.productCode} · {row.productName} tại {row.warehouseName}</p></div><button className="erp-v2-icon-button" type="button" aria-label="Đóng" onClick={onClose} disabled={isPending}><X aria-hidden="true" /></button></div>
    <form className="command-form" onSubmit={submit}><input type="hidden" name="warehouseId" value={row.warehouseId} /><input type="hidden" name="productUnitId" value={row.productUnitId} /><input type="hidden" name="expectedRevision" value={revision} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <dl className="inventory-count-facts"><div><dt>Tồn sổ hiện tại</dt><dd>{formatQuantity(row.quantity ?? 0)} {row.unitName}</dd></div><div><dt>Chênh lệch dự kiến</dt><dd>{difference > 0 ? "+" : ""}{formatQuantity(Number.isFinite(difference) ? difference : 0)} {row.unitName}</dd></div></dl>
      <label className="form-field"><span>Số lượng thực tế mới</span><input className="input" name="countedQuantity" type="number" min="0" step="0.001" value={countedQuantity} onChange={(event) => setCountedQuantity(event.target.value)} required autoFocus /></label>
      <label className="form-field"><span>Lý do {difference !== 0 ? "(bắt buộc)" : "(không bắt buộc)"}</span><textarea className="input" name="reason" rows={3} minLength={difference !== 0 ? 5 : undefined} required={difference !== 0} placeholder="Mô tả nguyên nhân chênh lệch" /></label>
      <label className="form-field"><span>Ảnh/PDF riêng tư {difference !== 0 ? "(bắt buộc)" : "(không cần khi khớp sổ)"}</span><input className="input" name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required={difference !== 0} /></label>
      <p className="erp-v2-inline-note">Gửi phiếu chưa thay đổi tồn. Owner/Accountant phải duyệt, và hệ thống sẽ yêu cầu kiểm lại nếu phát sinh kho thay đổi trong lúc kiểm.</p>
      <div className="erp-v2-detail-actions"><button className="erp-v2-button primary" type="submit" disabled={isPending || !Number.isFinite(Number(countedQuantity)) || Number(countedQuantity) < 0}>{isPending ? "Đang gửi…" : "Gửi phiếu chờ duyệt"}</button><button className="erp-v2-button" type="button" onClick={onClose} disabled={isPending}>Hủy</button></div>
    </form>
  </section></div>;
}

function InventoryActionDrawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="inventory-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="inventory-drawer" aria-label={title}><div className="erp-v2-modal-header"><h2>{title}</h2><button className="erp-v2-icon-button" type="button" aria-label="Đóng" onClick={onClose}><X aria-hidden="true" /></button></div>{children}</aside></div>;
}

function InventoryCountHistory({ state }: { state: OperationsState }) {
  const adjustments = state.inventoryMovements.filter((movement) => movement.movementType === "adjustment" && movement.sourceDocument.startsWith("KK-")).slice().reverse();
  return <section className="panel"><div className="panel-header"><div><h2 className="panel-title">Lịch sử điều chỉnh đã duyệt</h2><p className="panel-note">Chỉ các chênh lệch đã được duyệt mới xuất hiện trong phát sinh kho.</p></div></div><div className="panel-body"><DataTable headers={["Phiếu", "Kho", "Vật tư", "Chênh lệch", "Trạng thái", "Thời gian"]} rows={adjustments.map((movement) => [movement.sourceDocument, state.warehouses.find((warehouse) => warehouse.id === movement.warehouseId)?.name ?? movement.warehouseId, productLabel(state, movement.productUnitId), `${movement.quantity > 0 ? "+" : ""}${formatQuantity(movement.quantity)}`, movement.reversedById ? "Đã đảo" : "Đang hiệu lực", formatDateTime(movement.postedAt)])} emptyText="Chưa có phiếu kiểm kê nào được duyệt ghi kho." /></div></section>;
}

export function OpeningInventoryForm({ state, runOperation, isPending, onSaved }: { state: OperationsState; runOperation: OperationHandler; isPending: boolean; onSaved?: () => void }) {
  const actor = useContext(OperationsActorContext);
  const warehouses = getSelectableWarehouses(state, actor);
  const products = getSelectableProducts(state);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ warehouseId: string; productUnitId: string; quantity: number; unitCost: number; reason: string }>({ defaultValues: { warehouseId: warehouses[0]?.id ?? "", productUnitId: products[0]?.id ?? "", quantity: 1, unitCost: 0, reason: "Đối chiếu tồn đầu kỳ" } });
  return <section className="panel inventory-drawer-panel"><div className="panel-body"><form className="command-form" noValidate onSubmit={handleSubmit((values) => runOperation("postOpeningInventory", undefined, values, () => { reset({ ...values, quantity: 1 }); onSaved?.(); }))}><FormField label="Kho"><select className="input" {...register("warehouseId", { required: true })}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></FormField><FormField label="Vật tư"><select className="input" {...register("productUnitId", { required: true })}>{products.map((product) => <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>)}</select></FormField><FormField label="Số lượng" error={errors.quantity?.message}><input className="input" type="number" min="0.001" step="0.001" {...register("quantity", { valueAsNumber: true, min: { value: 0.001, message: "Số lượng phải lớn hơn 0." } })} /></FormField><FormField label="Đơn giá vốn" error={errors.unitCost?.message}><input className="input" type="number" min="0" step="1" {...register("unitCost", { valueAsNumber: true, min: { value: 0, message: "Đơn giá vốn không được âm." } })} /></FormField><FormField label="Lý do" error={errors.reason?.message}><textarea className="input" rows={3} {...register("reason", { minLength: { value: 5, message: "Lý do phải có ít nhất 5 ký tự." } })} /></FormField><SubmitButton label="Ghi tồn đầu kỳ" command="postOpeningInventory" isPending={isPending} disabled={isPending || warehouses.length === 0 || products.length === 0} /></form></div></section>;
}

export function InventoryTransferForm({ state, runOperation, isPending, onSaved }: { state: OperationsState; runOperation: OperationHandler; isPending: boolean; onSaved?: () => void }) {
  const actor = useContext(OperationsActorContext);
  const warehouses = getSelectableWarehouses(state, actor);
  const products = getSelectableProducts(state);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<{ sourceWarehouseId: string; destinationWarehouseId: string; productUnitId: string; quantity: number; reason: string }>({ defaultValues: { sourceWarehouseId: warehouses[0]?.id ?? "", destinationWarehouseId: warehouses[1]?.id ?? "", productUnitId: products[0]?.id ?? "", quantity: 1, reason: "Điều chuyển theo kế hoạch kho" } });
  const sourceWarehouseId = watch("sourceWarehouseId");
  const productUnitId = watch("productUnitId");
  const available = sourceWarehouseId && productUnitId ? stockBalance(state, sourceWarehouseId, productUnitId) : 0;
  return <section className="panel inventory-drawer-panel"><div className="panel-body"><p className="erp-v2-inline-note">Tồn khả dụng tại kho đi: <strong>{formatQuantity(available)}</strong></p><form className="command-form" noValidate onSubmit={handleSubmit((values) => runOperation("postInventoryTransfer", undefined, values, onSaved))}><FormField label="Kho đi"><select className="input" {...register("sourceWarehouseId", { required: true })}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></FormField><FormField label="Kho đến"><select className="input" {...register("destinationWarehouseId", { required: true })}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></FormField><FormField label="Vật tư"><select className="input" {...register("productUnitId", { required: true })}>{products.map((product) => <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>)}</select></FormField><FormField label="Số lượng" error={errors.quantity?.message}><input className="input" type="number" min="0.001" step="0.001" {...register("quantity", { valueAsNumber: true, min: { value: 0.001, message: "Số lượng phải lớn hơn 0." } })} /></FormField><FormField label="Lý do" error={errors.reason?.message}><textarea className="input" rows={3} {...register("reason", { minLength: { value: 5, message: "Lý do phải có ít nhất 5 ký tự." } })} /></FormField><SubmitButton label="Ghi chuyển kho" command="postInventoryTransfer" isPending={isPending} disabled={isPending || warehouses.length < 2} /></form></div></section>;
}

function sectionFromPath(activePath: string): InventorySection {
  const section = new URLSearchParams(activePath.split("?")[1] ?? "").get("section");
  return section === "movements" || section === "actions" || section === "counts" || section === "exceptions" ? section : "stock";
}
