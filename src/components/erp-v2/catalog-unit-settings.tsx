"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useOperationsRuntime } from "./modules/use-operations-runtime";
import { normalizeUnitName } from "@/modules/operations/unit-settings";
import type { OperationsActor, OperationsSnapshot, PurchaseUnitConversionMode } from "@/modules/operations/types";

export function CatalogUnitSettingsWorkspace({
  actor,
  initialProductId,
  initialSnapshot
}: {
  actor: OperationsActor;
  initialProductId?: string;
  initialSnapshot: OperationsSnapshot;
}) {
  const runtime = useOperationsRuntime(initialSnapshot.state, initialSnapshot.revision, initialSnapshot.syncedAt);
  const state = runtime.state;
  const products = state.productUnits.filter((product) => product.status === "active");
  const [productId, setProductId] = useState(() => products.some((product) => product.id === initialProductId) ? initialProductId! : products[0]?.id ?? "");
  const [unitName, setUnitName] = useState("");
  const [editingUnitId, setEditingUnitId] = useState("");
  const [editingUnitName, setEditingUnitName] = useState("");
  const [unitId, setUnitId] = useState("");
  const [mode, setMode] = useState<PurchaseUnitConversionMode>("fixed");
  const [factor, setFactor] = useState("1");
  const [deleteIntent, setDeleteIntent] = useState<
    | { kind: "unit"; id: string; label: string }
    | { kind: "conversion"; id: string; label: string; expectedVersion: number }
    | undefined
  >();
  const canManage = actor.permissions.includes("catalog.manage_purchase_units");
  const product = products.find((item) => item.id === productId);
  const conversions = state.purchaseUnitConversions.filter((item) => item.productUnitId === productId);
  const availableUnits = useMemo(() => state.unitDefinitions.filter((unit) =>
    unit.status === "active" && normalizeUnitName(unit.name) !== normalizeUnitName(product?.unitName ?? "")
  ), [product?.unitName, state.unitDefinitions]);
  const selectedUnitId = availableUnits.some((unit) => unit.id === unitId) ? unitId : "";
  const selectedConversion = conversions.find((conversion) => conversion.unitId === selectedUnitId);

  function createUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = unitName.trim();
    if (!name) return;
    runtime.runCreateCommand({ type: "createUnitDefinition", name }, () => setUnitName(""));
  }

  function saveConversion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productId || !selectedUnitId) return;
    runtime.runCreateCommand({
      type: "upsertPurchaseUnitConversion",
      productUnitId: productId,
      unitId: selectedUnitId,
      conversionMode: mode,
      factorToBase: mode === "fixed" ? Number(factor) : undefined,
      expectedVersion: selectedConversion?.version
    });
  }

  return <div className="erp-v2-unit-page">
    <header className="erp-v2-page-header">
      <div><p className="erp-v2-eyebrow">Danh mục nền</p><h1>Đơn vị & quy đổi</h1><p className="erp-v2-page-description">Đơn vị cố định dùng chung cho mua, bán và cổng khách hàng. Đơn vị biến đổi chỉ dùng khi nhận hàng mua.</p></div>
      <span className="erp-v2-count">Revision {runtime.syncMeta.revision}</span>
    </header>
    {runtime.feedback ? <p className={`erp-v2-workspace-alert ${runtime.feedback.type}`} role={runtime.feedback.type === "error" ? "alert" : "status"}>{runtime.feedback.text}</p> : null}
    {!canManage ? <p className="erp-v2-workspace-alert warning">Bạn đang xem ở chế độ chỉ đọc. Chỉ người có quyền quản lý đơn vị mới được thay đổi cấu hình.</p> : null}

    <div className="catalog-form-grid">
      <section className="erp-v2-panel catalog-form-section">
        <div className="erp-v2-panel-header"><div><h2>Danh mục đơn vị</h2><p>Tên đơn vị là dùng chung; hệ số được cấu hình riêng theo từng vật tư.</p></div></div>
        {canManage ? <form className="command-form" onSubmit={createUnit}>
          <label className="form-field"><span>Tên đơn vị mới</span><input className="input" value={unitName} maxLength={40} onChange={(event) => setUnitName(event.target.value)} placeholder="Ví dụ: pallet, tấn, xe" required /></label>
          <button className="erp-v2-button primary" type="submit" disabled={runtime.isPending || !unitName.trim()}>Thêm đơn vị</button>
        </form> : null}
        <div className="erp-v2-unit-list">
          {state.unitDefinitions.map((unit) => {
            const isBase = state.productUnits.some((item) => normalizeUnitName(item.unitName) === normalizeUnitName(unit.name));
            if (editingUnitId === unit.id) return <form className="erp-v2-unit-row" key={unit.id} onSubmit={(event) => { event.preventDefault(); runtime.runCreateCommand({ type: "updateUnitDefinition", unitId: unit.id, name: editingUnitName, expectedVersion: unit.version ?? 1 }, () => { setEditingUnitId(""); setEditingUnitName(""); }); }}><label className="form-field"><span>Tên đơn vị</span><input className="input" value={editingUnitName} maxLength={40} onChange={(event) => setEditingUnitName(event.target.value)} autoFocus required /></label><span className="erp-v2-detail-actions"><button className="erp-v2-button primary" type="submit" disabled={runtime.isPending || !editingUnitName.trim()}>Lưu</button><button className="erp-v2-button" type="button" onClick={() => setEditingUnitId("")}>Hủy</button></span></form>;
            return <div className="erp-v2-unit-row" key={unit.id}><span><strong>{unit.name}</strong><small>{isBase ? "Đang là đơn vị tồn kho gốc" : "Có thể dùng để cấu hình quy đổi"}</small></span>{canManage && !isBase ? <span className="erp-v2-detail-actions"><button className="erp-v2-button" type="button" disabled={runtime.isPending} onClick={() => { setEditingUnitId(unit.id); setEditingUnitName(unit.name); }}>Đổi tên</button><button className="erp-v2-button danger" type="button" disabled={runtime.isPending} onClick={() => setDeleteIntent({ kind: "unit", id: unit.id, label: unit.name })}>Xóa</button></span> : null}</div>;
          })}
        </div>
      </section>

      <section className="erp-v2-panel catalog-form-section">
        <div className="erp-v2-panel-header"><div><h2>Quy đổi theo vật tư</h2><p>Mỗi cặp vật tư–đơn vị chỉ có một cấu hình hiện hành.</p></div></div>
        <label className="form-field"><span>Vật tư</span><select className="input" value={productId} onChange={(event) => { setProductId(event.target.value); setUnitId(""); setMode("fixed"); setFactor("1"); }}><option value="">Chọn vật tư</option>{products.map((item) => <option key={item.id} value={item.id}>{item.productCode} · {item.productName}</option>)}</select></label>
        {product ? <p className="erp-v2-inline-note"><strong>Đơn vị tồn kho gốc:</strong> {product.unitName}. Tồn, kiểm kê và giá vốn luôn lưu theo đơn vị này.</p> : <p className="empty-state">Chưa có vật tư đang hoạt động để cấu hình.</p>}
        {canManage && product ? <form className="command-form" onSubmit={saveConversion}>
          <label className="form-field"><span>Đơn vị quy đổi</span><select className="input" value={selectedUnitId} onChange={(event) => { const nextId = event.target.value; const existing = conversions.find((conversion) => conversion.unitId === nextId); setUnitId(nextId); setMode(existing?.conversionMode ?? "fixed"); setFactor(String(existing?.factorToBase ?? 1)); }} disabled={availableUnits.length === 0}>{availableUnits.length === 0 ? <option value="">Tạo thêm đơn vị khác đơn vị gốc</option> : <><option value="" disabled>Chọn đơn vị</option>{availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</>}</select></label>
          <label className="form-field"><span>Loại quy đổi</span><select className="input" value={mode} onChange={(event) => setMode(event.target.value as PurchaseUnitConversionMode)}><option value="fixed">Cố định — mua, bán, portal</option><option value="variable">Biến đổi — chỉ mua hàng</option></select></label>
          {mode === "fixed" ? <label className="form-field"><span>Hệ số về {product.unitName}</span><input className="input" type="number" min="0.001" step="0.001" value={factor} onChange={(event) => setFactor(event.target.value)} required /></label> : <p className="erp-v2-inline-note">Hệ số sẽ được chốt từ số thực nhận khi nhập hàng, không dùng trong bán hàng hoặc portal.</p>}
          <button className="erp-v2-button primary" type="submit" disabled={runtime.isPending || !selectedUnitId || (mode === "fixed" && Number(factor) <= 0)}>{selectedConversion ? "Cập nhật quy đổi" : "Lưu quy đổi"}</button>
        </form> : null}
        <div className="erp-v2-unit-list">
          {conversions.length === 0 ? <p className="empty-state">Vật tư này chưa có quy đổi. Đơn vị gốc vẫn dùng được cho mọi chứng từ.</p> : conversions.map((conversion) => {
            const unit = state.unitDefinitions.find((item) => item.id === conversion.unitId);
            return <div className="erp-v2-unit-row" key={conversion.id}><span><strong>1 {unit?.name ?? conversion.unitId}</strong><small>{conversion.conversionMode === "fixed" ? `= ${conversion.factorToBase} ${product?.unitName ?? "đơn vị gốc"} · dùng mua/bán/portal` : "Theo số thực nhận · chỉ dùng mua hàng"}</small></span>{canManage ? <button className="erp-v2-button danger" type="button" disabled={runtime.isPending} onClick={() => setDeleteIntent({ kind: "conversion", id: conversion.id, label: `${product?.productName ?? productId} · ${unit?.name ?? conversion.unitId}`, expectedVersion: conversion.version })}>Xóa</button> : null}</div>;
          })}
        </div>
      </section>
    </div>
    {deleteIntent ? <section className="erp-v2-panel" role="alertdialog" aria-modal="true" aria-labelledby="delete-unit-title" aria-describedby="delete-unit-description">
      <div className="erp-v2-panel-header"><div><p className="erp-v2-eyebrow">Xác nhận thao tác</p><h2 id="delete-unit-title">{deleteIntent.kind === "unit" ? "Xóa đơn vị" : "Xóa quy đổi"}: {deleteIntent.label}</h2><p id="delete-unit-description">{deleteIntent.kind === "unit" ? "Đơn vị sẽ không còn dùng được để tạo quy đổi mới. Hệ thống vẫn từ chối nếu đơn vị đang được tham chiếu." : "Quy đổi này sẽ không còn được chọn cho chứng từ mới. Snapshot trên chứng từ lịch sử không bị thay đổi."}</p></div></div>
      <div className="erp-v2-detail-actions"><button className="erp-v2-button danger" type="button" disabled={runtime.isPending} onClick={() => {
        if (deleteIntent.kind === "unit") runtime.runCreateCommand({ type: "deleteUnitDefinition", unitId: deleteIntent.id }, () => setDeleteIntent(undefined));
        else runtime.runCreateCommand({ type: "deletePurchaseUnitConversion", conversionId: deleteIntent.id, expectedVersion: deleteIntent.expectedVersion }, () => setDeleteIntent(undefined));
      }}>{runtime.isPending ? "Đang xóa…" : "Xác nhận xóa"}</button><button className="erp-v2-button" type="button" disabled={runtime.isPending} onClick={() => setDeleteIntent(undefined)}>Hủy</button></div>
    </section> : null}
  </div>;
}
