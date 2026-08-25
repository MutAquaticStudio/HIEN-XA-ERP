"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useOperationsRuntime } from "./modules/use-operations-runtime";
import {
  canonicalUnitConversionMode,
  isDeterministicConversionMode,
  isVariableActualMode,
  normalizedAllowedContexts,
  previewProductUnitConversion,
  resolveProductUnitConversions,
  unitConversionContexts
} from "@/modules/operations/advanced-unit-conversion";
import { normalizeUnitName } from "@/modules/operations/unit-settings";
import { priceForDocumentUnit } from "@/modules/operations/product-pricing";
import { formatMoney, formatQuantity } from "@/lib/format";
import type {
  CanonicalUnitConversionMode,
  CreateCommand,
  OperationsActor,
  OperationsSnapshot,
  PurchaseUnitConversion,
  UnitConversionContext,
  UnitPhysicalDimension
} from "@/modules/operations/types";

type ConversionDraft = {
  unitId: string;
  mode: CanonicalUnitConversionMode;
  factorToBase: string;
  parentUnitId: string;
  factorToParent: string;
  lengthMeters: string;
  widthMeters: string;
  heightMeters: string;
  densitySourceDimension: "MASS" | "VOLUME";
  sourceToMetricFactor: string;
  baseToMetricFactor: string;
  allowedContexts: UnitConversionContext[];
  status: "active" | "inactive";
};

const contextLabels: Record<UnitConversionContext, string> = {
  PURCHASE: "Mua hàng",
  SALES: "Bán hàng",
  INVENTORY_DISPLAY: "Hiển thị kho",
  PORTAL: "Cổng khách",
  LOGISTICS: "Logistics"
};

const modeLabels: Record<CanonicalUnitConversionMode, string> = {
  FIXED_RATIO: "Tỷ lệ cố định",
  MULTI_LEVEL: "Nhiều cấp",
  VARIABLE_ACTUAL: "Theo thực nhận",
  DIMENSION_BASED: "Theo kích thước",
  DENSITY_BASED: "Theo khối lượng riêng"
};

const physicalDimensionLabels: Record<UnitPhysicalDimension, string> = {
  COUNT: "Số đếm",
  LENGTH: "Chiều dài (m)",
  AREA: "Diện tích (m²)",
  VOLUME: "Thể tích (L/m³ theo hệ số)",
  MASS: "Khối lượng (kg theo hệ số)",
  OTHER: "Khác / không áp dụng"
};

export function CatalogUnitSettingsWorkspace({ actor, initialProductId, initialSnapshot }: { actor: OperationsActor; initialProductId?: string; initialSnapshot: OperationsSnapshot }) {
  const runtime = useOperationsRuntime(initialSnapshot.state, initialSnapshot.revision, initialSnapshot.syncedAt);
  const state = runtime.state;
  const products = state.productUnits.filter((product) => product.status === "active");
  const [productId, setProductId] = useState(() => products.some((product) => product.id === initialProductId) ? initialProductId! : products[0]?.id ?? "");
  const product = products.find((item) => item.id === productId);
  const [unitName, setUnitName] = useState("");
  const [editingUnitId, setEditingUnitId] = useState("");
  const [editingUnitName, setEditingUnitName] = useState("");
  const [editingConversionId, setEditingConversionId] = useState<string>();
  const [conversionDraft, setConversionDraft] = useState<ConversionDraft>();
  const [profileDimension, setProfileDimension] = useState<UnitPhysicalDimension | "">(product?.inventoryDimension ?? "");
  const [profileDensity, setProfileDensity] = useState(product?.densityKgPerLiter ? String(product.densityKgPerLiter) : "");
  const [deleteIntent, setDeleteIntent] = useState<{ kind: "unit"; id: string; label: string } | { kind: "conversion"; id: string; label: string; expectedVersion: number }>();
  const canManage = actor.permissions.includes("catalog.manage_purchase_units");
  const availableUnits = useMemo(() => state.unitDefinitions.filter((unit) => unit.status === "active" && normalizeUnitName(unit.name) !== normalizeUnitName(product?.unitName ?? "")), [product?.unitName, state.unitDefinitions]);
  const resolvedConversions = useMemo(() => {
    if (!productId) return [];
    try { return resolveProductUnitConversions(state, productId); } catch { return []; }
  }, [productId, state]);
  const unitNamesById = useMemo(() => new Map(state.unitDefinitions.map((unit) => [unit.id, unit.name])), [state.unitDefinitions]);
  const baseUnitId = state.unitDefinitions.find((unit) => normalizeUnitName(unit.name) === normalizeUnitName(product?.unitName ?? ""))?.id;
  const selectedExisting = editingConversionId ? state.purchaseUnitConversions.find((item) => item.id === editingConversionId) : undefined;
  const preview = useMemo(() => {
    if (!product || !conversionDraft?.unitId) return undefined;
    try { return previewProductUnitConversion(state, conversionCandidate(product.id, conversionDraft)); }
    catch (error) { return { error: error instanceof Error ? error.message : "Cấu hình chưa hợp lệ." } as const; }
  }, [conversionDraft, product, state]);

  function chooseProduct(nextProductId: string) {
    const next = products.find((item) => item.id === nextProductId);
    setProductId(nextProductId);
    setProfileDimension(next?.inventoryDimension ?? "");
    setProfileDensity(next?.densityKgPerLiter ? String(next.densityKgPerLiter) : "");
    setEditingConversionId(undefined);
    setConversionDraft(undefined);
  }

  function openCreateConversion() {
    setEditingConversionId(undefined);
    setConversionDraft(defaultConversionDraft(availableUnits[0]?.id ?? ""));
  }

  function openEditConversion(conversion: PurchaseUnitConversion) {
    setEditingConversionId(conversion.id);
    setConversionDraft({
      unitId: conversion.unitId,
      mode: canonicalUnitConversionMode(conversion.conversionMode),
      factorToBase: conversion.factorToBase === null ? "" : String(conversion.factorToBase),
      parentUnitId: conversion.parentUnitId ?? "",
      factorToParent: conversion.factorToParent === undefined ? "" : String(conversion.factorToParent),
      lengthMeters: conversion.dimensionMetadata ? String(conversion.dimensionMetadata.lengthMeters) : "",
      widthMeters: conversion.dimensionMetadata?.widthMeters === undefined ? "" : String(conversion.dimensionMetadata.widthMeters),
      heightMeters: conversion.dimensionMetadata?.heightMeters === undefined ? "" : String(conversion.dimensionMetadata.heightMeters),
      densitySourceDimension: conversion.densityMetadata?.sourceDimension ?? "VOLUME",
      sourceToMetricFactor: conversion.densityMetadata ? String(conversion.densityMetadata.sourceToMetricFactor) : "1",
      baseToMetricFactor: conversion.densityMetadata ? String(conversion.densityMetadata.baseToMetricFactor) : "1",
      allowedContexts: normalizedAllowedContexts(conversion),
      status: conversion.status ?? "active"
    });
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product) return;
    runtime.runCreateCommand({ type: "updateProductUnitPhysicalProfile", productUnitId: product.id, inventoryDimension: profileDimension || undefined, densityKgPerLiter: profileDensity ? Number(profileDensity) : undefined, expectedVersion: product.version ?? 1 });
  }

  function saveConversion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || !conversionDraft || (preview && "error" in preview)) return;
    const command: Extract<CreateCommand, { type: "upsertPurchaseUnitConversion" }> = { type: "upsertPurchaseUnitConversion", ...conversionCandidate(product.id, conversionDraft), expectedVersion: selectedExisting?.version };
    runtime.runCreateCommand(command, () => { setEditingConversionId(undefined); setConversionDraft(undefined); });
  }

  return <div className="erp-v2-unit-page">
    <header className="erp-v2-page-header"><div><p className="erp-v2-eyebrow">Product Unit Workspace</p><h1>Đơn vị & quy đổi</h1><p className="erp-v2-page-description">Thiết lập chuỗi quy đổi typed theo từng vật tư. Kho luôn ghi nhận bằng đúng một đơn vị tồn kho gốc.</p></div><span className="erp-v2-count">Revision {runtime.syncMeta.revision}</span></header>
    {runtime.feedback ? <p className={`erp-v2-workspace-alert ${runtime.feedback.type}`} role={runtime.feedback.type === "error" ? "alert" : "status"}>{runtime.feedback.text}</p> : null}
    {!canManage ? <p className="erp-v2-workspace-alert warning">Bạn đang xem ở chế độ chỉ đọc. Chỉ người có quyền quản lý đơn vị mới được thay đổi cấu hình.</p> : null}

    <section className="erp-v2-panel unit-product-picker">
      <label className="form-field"><span>Vật tư đang cấu hình</span><select className="input" value={productId} onChange={(event) => chooseProduct(event.target.value)}><option value="">Chọn vật tư</option>{products.map((item) => <option key={item.id} value={item.id}>{item.productCode} · {item.productName}</option>)}</select></label>
      {product ? <div className="unit-base-banner"><span><small>ĐƠN VỊ TỒN KHO GỐC</small><strong>{product.unitName}</strong></span><p>Mọi nhập, xuất, chuyển kho, kiểm kê và giá vốn đều được chuyển về {product.unitName} trước khi ghi sổ.</p></div> : <p className="empty-state">Chưa có vật tư đang hoạt động để cấu hình.</p>}
    </section>

    {product ? <>
      <section className="erp-v2-panel"><div className="erp-v2-panel-header"><div><h2>Đặc tính vật lý của đơn vị gốc</h2><p>Chỉ cần khai báo khi dùng quy đổi theo kích thước hoặc khối lượng riêng.</p></div></div><form className="unit-profile-form" onSubmit={saveProfile}><label className="form-field"><span>Chiều đo tồn kho</span><select className="input" value={profileDimension} onChange={(event) => { const next = event.target.value as UnitPhysicalDimension | ""; setProfileDimension(next); if (next !== "MASS" && next !== "VOLUME") setProfileDensity(""); }}><option value="">Chưa khai báo</option>{Object.entries(physicalDimensionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>Khối lượng riêng (kg/L)</span><input className="input" type="number" min="0.000001" step="0.000001" value={profileDensity} disabled={profileDimension !== "MASS" && profileDimension !== "VOLUME"} onChange={(event) => setProfileDensity(event.target.value)} placeholder="Ví dụ: 1.25" /></label>{canManage ? <button className="erp-v2-button" type="submit" disabled={runtime.isPending}>Lưu đặc tính</button> : null}</form></section>

      <section className="erp-v2-panel"><div className="erp-v2-panel-header"><div><h2>Đơn vị đã cấu hình</h2><p>Hệ số cơ sở được dẫn xuất từ graph hiện hành; chứng từ cũ giữ nguyên snapshot.</p></div>{canManage ? <button className="erp-v2-button primary" type="button" disabled={runtime.isPending || availableUnits.length === 0} onClick={openCreateConversion}>Thêm quy đổi</button> : null}</div><div className="unit-table-wrap" role="region" aria-label="Bảng quy đổi đơn vị của vật tư" tabIndex={0}><table className="unit-workspace-table"><thead><tr><th>Đơn vị</th><th>Chế độ</th><th>Quy đổi</th><th>Tương đương gốc</th><th>Mua</th><th>Bán</th><th>Portal</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{resolvedConversions.map((conversion) => {
        const prices = safePrices(product, conversion);
        const unitLabel = unitNamesById.get(conversion.unitId) ?? conversion.unitId;
        return <tr key={conversion.id}><td data-label="Đơn vị"><strong>{unitLabel}</strong></td><td data-label="Chế độ">{modeLabels[conversion.canonicalMode]}</td><td data-label="Quy đổi">{conversionDescription(conversion, unitNamesById, product.unitName)}</td><td data-label="Tương đương gốc">{conversion.factorToBase === null ? "Theo thực nhận" : `1 ${unitLabel} = ${formatQuantity(conversion.factorToBase)} ${product.unitName}`}</td><td data-label="Mua">{contextValue(conversion, "PURCHASE", prices?.purchasePrice)}</td><td data-label="Bán">{contextValue(conversion, "SALES", prices?.salePrice)}</td><td data-label="Portal">{conversion.allowedContexts.includes("PORTAL") && prices ? formatMoney(prices.salePrice) : "Không"}</td><td data-label="Trạng thái"><span className={`erp-v2-status ${conversion.status === "active" ? "active" : "inactive"}`}>{conversion.status === "active" ? "Đang dùng" : "Tạm ngưng"}</span></td><td data-label="Thao tác"><span className="erp-v2-detail-actions">{canManage ? <><button className="erp-v2-button" type="button" onClick={() => openEditConversion(conversion)}>Sửa</button><button className="erp-v2-button danger" type="button" onClick={() => setDeleteIntent({ kind: "conversion", id: conversion.id, label: `${product.productName} · ${unitLabel}`, expectedVersion: conversion.version })}>Xóa</button></> : "—"}</span></td></tr>;
      })}</tbody></table>{resolvedConversions.length === 0 ? <p className="empty-state">Vật tư này chưa có quy đổi. Đơn vị gốc vẫn dùng được trong mọi nghiệp vụ được cấp quyền.</p> : null}</div></section>
    </> : null}

    <section className="erp-v2-panel"><div className="erp-v2-panel-header"><div><h2>Danh mục tên đơn vị</h2><p>Tên dùng chung; graph và hệ số luôn thuộc riêng từng vật tư.</p></div></div>{canManage ? <form className="unit-create-row" onSubmit={(event) => { event.preventDefault(); const name = unitName.trim(); if (name) runtime.runCreateCommand({ type: "createUnitDefinition", name }, () => setUnitName("")); }}><label className="form-field"><span>Tên đơn vị mới</span><input className="input" value={unitName} maxLength={40} onChange={(event) => setUnitName(event.target.value)} placeholder="Ví dụ: pallet, bao, tấm, lít" required /></label><button className="erp-v2-button primary" type="submit" disabled={runtime.isPending || !unitName.trim()}>Thêm đơn vị</button></form> : null}<div className="erp-v2-unit-list">{state.unitDefinitions.map((unit) => {
      const isBase = state.productUnits.some((item) => normalizeUnitName(item.unitName) === normalizeUnitName(unit.name));
      if (editingUnitId === unit.id) return <form className="erp-v2-unit-row" key={unit.id} onSubmit={(event) => { event.preventDefault(); runtime.runCreateCommand({ type: "updateUnitDefinition", unitId: unit.id, name: editingUnitName, expectedVersion: unit.version ?? 1 }, () => { setEditingUnitId(""); setEditingUnitName(""); }); }}><label className="form-field"><span>Tên đơn vị</span><input className="input" value={editingUnitName} maxLength={40} onChange={(event) => setEditingUnitName(event.target.value)} autoFocus required /></label><span className="erp-v2-detail-actions"><button className="erp-v2-button primary" type="submit" disabled={runtime.isPending || !editingUnitName.trim()}>Lưu</button><button className="erp-v2-button" type="button" onClick={() => setEditingUnitId("")}>Hủy</button></span></form>;
      return <div className="erp-v2-unit-row" key={unit.id}><span><strong>{unit.name}</strong><small>{isBase ? "Đang là đơn vị tồn kho gốc" : "Có thể cấu hình cho từng vật tư"}</small></span>{canManage && !isBase ? <span className="erp-v2-detail-actions"><button className="erp-v2-button" type="button" onClick={() => { setEditingUnitId(unit.id); setEditingUnitName(unit.name); }}>Đổi tên</button><button className="erp-v2-button danger" type="button" onClick={() => setDeleteIntent({ kind: "unit", id: unit.id, label: unit.name })}>Xóa</button></span> : null}</div>;
    })}</div></section>

    {conversionDraft && product ? <ConversionEditor product={product} draft={conversionDraft} setDraft={setConversionDraft} editing={Boolean(editingConversionId)} availableUnits={availableUnits} baseUnitId={baseUnitId} resolvedConversions={resolvedConversions} names={unitNamesById} preview={preview} isPending={runtime.isPending} onSave={saveConversion} onClose={() => setConversionDraft(undefined)} /> : null}
    {deleteIntent ? <section className="unit-conversion-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-unit-title"><div className="unit-conversion-modal compact"><div><p className="erp-v2-eyebrow">Xác nhận thao tác</p><h2 id="delete-unit-title">{deleteIntent.kind === "unit" ? "Xóa đơn vị" : "Xóa quy đổi"}: {deleteIntent.label}</h2><p>{deleteIntent.kind === "unit" ? "Sau khi xóa, tên đơn vị này không còn dùng được để tạo quy đổi mới. " : ""}Snapshot trên chứng từ lịch sử không bị thay đổi. Quy đổi cha phải được gỡ khỏi các chuỗi con trước khi xóa.</p></div><div className="erp-v2-detail-actions"><button className="erp-v2-button danger" type="button" disabled={runtime.isPending} onClick={() => { if (deleteIntent.kind === "unit") runtime.runCreateCommand({ type: "deleteUnitDefinition", unitId: deleteIntent.id }, () => setDeleteIntent(undefined)); else runtime.runCreateCommand({ type: "deletePurchaseUnitConversion", conversionId: deleteIntent.id, expectedVersion: deleteIntent.expectedVersion }, () => setDeleteIntent(undefined)); }}>Xác nhận xóa</button><button className="erp-v2-button" type="button" onClick={() => setDeleteIntent(undefined)}>Hủy</button></div></div></section> : null}
  </div>;
}

function ConversionEditor({ product, draft, setDraft, editing, availableUnits, baseUnitId, resolvedConversions, names, preview, isPending, onSave, onClose }: { product: OperationsSnapshot["state"]["productUnits"][number]; draft: ConversionDraft; setDraft: (draft: ConversionDraft | undefined) => void; editing: boolean; availableUnits: OperationsSnapshot["state"]["unitDefinitions"]; baseUnitId?: string; resolvedConversions: ReturnType<typeof resolveProductUnitConversions>; names: Map<string, string>; preview: ReturnType<typeof previewProductUnitConversion> | { error: string } | undefined; isPending: boolean; onSave: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  return <section className="unit-conversion-dialog" role="dialog" aria-modal="true" aria-labelledby="conversion-dialog-title"><form className="unit-conversion-modal" onSubmit={onSave}><div className="erp-v2-panel-header"><div><p className="erp-v2-eyebrow">{editing ? "Sửa quy đổi" : "Quy đổi mới"}</p><h2 id="conversion-dialog-title">{product.productName}</h2><p>Không dùng công thức chạy tự do; chỉ các chế độ typed được kiểm tra trên máy chủ.</p></div><button className="erp-v2-button" type="button" onClick={onClose}>Đóng</button></div><div className="unit-modal-grid">
    <label className="form-field"><span>Đơn vị giao dịch</span><select className="input" value={draft.unitId} disabled={editing} onChange={(event) => setDraft({ ...draft, unitId: event.target.value })}><option value="">Chọn đơn vị</option>{availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
    <label className="form-field"><span>Chế độ</span><select className="input" value={draft.mode} onChange={(event) => setDraft(withMode(draft, event.target.value as CanonicalUnitConversionMode))}>{Object.entries(modeLabels).filter(([value]) => value !== "DENSITY_BASED" || Boolean(product.densityKgPerLiter)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {draft.mode === "FIXED_RATIO" ? <label className="form-field"><span>Hệ số về {product.unitName}</span><input className="input" type="number" min="0.000001" step="0.000001" value={draft.factorToBase} onChange={(event) => setDraft({ ...draft, factorToBase: event.target.value })} required /></label> : null}
    {draft.mode === "MULTI_LEVEL" ? <><label className="form-field"><span>Đơn vị cha</span><select className="input" value={draft.parentUnitId} onChange={(event) => setDraft({ ...draft, parentUnitId: event.target.value })}><option value={baseUnitId ?? ""}>{product.unitName} · đơn vị gốc</option>{resolvedConversions.filter((item) => item.unitId !== draft.unitId && !isVariableActualMode(item.conversionMode)).map((item) => <option key={item.unitId} value={item.unitId}>{names.get(item.unitId) ?? item.unitId}</option>)}</select></label><label className="form-field"><span>Hệ số về đơn vị cha</span><input className="input" type="number" min="0.000001" step="0.000001" value={draft.factorToParent} onChange={(event) => setDraft({ ...draft, factorToParent: event.target.value })} required /></label></> : null}
    {draft.mode === "DIMENSION_BASED" ? <><p className="erp-v2-inline-note unit-grid-full">Đích phải khớp chiều đo tồn kho: {product.inventoryDimension ? physicalDimensionLabels[product.inventoryDimension] : "chưa khai báo"}.</p><label className="form-field"><span>Chiều dài (m)</span><input className="input" type="number" min="0.000001" step="0.000001" value={draft.lengthMeters} onChange={(event) => setDraft({ ...draft, lengthMeters: event.target.value })} required /></label>{product.inventoryDimension === "AREA" || product.inventoryDimension === "VOLUME" ? <label className="form-field"><span>Chiều rộng (m)</span><input className="input" type="number" min="0.000001" step="0.000001" value={draft.widthMeters} onChange={(event) => setDraft({ ...draft, widthMeters: event.target.value })} required /></label> : null}{product.inventoryDimension === "VOLUME" ? <label className="form-field"><span>Chiều dày/cao (m)</span><input className="input" type="number" min="0.000001" step="0.000001" value={draft.heightMeters} onChange={(event) => setDraft({ ...draft, heightMeters: event.target.value })} required /></label> : null}</> : null}
    {draft.mode === "DENSITY_BASED" ? <><p className="erp-v2-inline-note unit-grid-full">Khối lượng riêng hiện tại: {product.densityKgPerLiter ? `${formatQuantity(product.densityKgPerLiter)} kg/L` : "chưa khai báo"}.</p><label className="form-field"><span>Chiều đo đơn vị nguồn</span><select className="input" value={draft.densitySourceDimension} onChange={(event) => setDraft({ ...draft, densitySourceDimension: event.target.value as "MASS" | "VOLUME" })}><option value="VOLUME">Thể tích</option><option value="MASS">Khối lượng</option></select></label><label className="form-field"><span>1 đơn vị nguồn = kg/L</span><input className="input" type="number" min="0.000001" step="0.000001" value={draft.sourceToMetricFactor} onChange={(event) => setDraft({ ...draft, sourceToMetricFactor: event.target.value })} required /></label><label className="form-field"><span>1 đơn vị gốc = kg/L</span><input className="input" type="number" min="0.000001" step="0.000001" value={draft.baseToMetricFactor} onChange={(event) => setDraft({ ...draft, baseToMetricFactor: event.target.value })} required /></label></> : null}
    <fieldset className="unit-context-fieldset unit-grid-full"><legend>Được dùng tại</legend><div>{unitConversionContexts.map((context) => <label key={context}><input type="checkbox" checked={draft.allowedContexts.includes(context)} disabled={draft.mode === "VARIABLE_ACTUAL" && context !== "PURCHASE" && context !== "LOGISTICS"} onChange={(event) => setDraft({ ...draft, allowedContexts: event.target.checked ? [...draft.allowedContexts, context] : draft.allowedContexts.filter((item) => item !== context) })} /> {contextLabels[context]}</label>)}</div></fieldset>
    <label className="form-field"><span>Trạng thái</span><select className="input" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as "active" | "inactive" })}><option value="active">Đang dùng</option><option value="inactive">Tạm ngưng</option></select></label>
  </div><div className={`unit-live-preview ${preview && "error" in preview ? "error" : ""}`}><strong>Xem trước quy đổi</strong>{preview && "error" in preview ? <p>{preview.error}</p> : preview ? <p>{preview.factorToBase === null ? "Hệ số sẽ được chốt theo số thực nhận trên giao dịch mua." : `1 ${names.get(preview.unitId) ?? "đơn vị"} = ${formatQuantity(preview.factorToBase)} ${product.unitName}.`}</p> : <p>Chọn đơn vị và nhập đủ thông số để xem kết quả.</p>}</div><div className="erp-v2-detail-actions"><button className="erp-v2-button primary" type="submit" disabled={isPending || !draft.unitId || Boolean(preview && "error" in preview)}>{isPending ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Tạo quy đổi"}</button><button className="erp-v2-button" type="button" onClick={onClose}>Hủy</button></div></form></section>;
}

function defaultConversionDraft(unitId: string): ConversionDraft { return { unitId, mode: "FIXED_RATIO", factorToBase: "1", parentUnitId: "", factorToParent: "1", lengthMeters: "", widthMeters: "", heightMeters: "", densitySourceDimension: "VOLUME", sourceToMetricFactor: "1", baseToMetricFactor: "1", allowedContexts: [...unitConversionContexts], status: "active" }; }
function withMode(current: ConversionDraft, mode: CanonicalUnitConversionMode): ConversionDraft { return { ...current, mode, allowedContexts: mode === "VARIABLE_ACTUAL" ? ["PURCHASE", "LOGISTICS"] : current.allowedContexts.length ? current.allowedContexts : [...unitConversionContexts] }; }
function conversionCandidate(productUnitId: string, draft: ConversionDraft): Omit<PurchaseUnitConversion, "id" | "version" | "updatedAt" | "factorToBase"> & { factorToBase?: number } {
  const mode = draft.mode;
  return { productUnitId, unitId: draft.unitId, sourceUnitId: draft.unitId, conversionMode: mode, ...(mode === "FIXED_RATIO" ? { factorToBase: Number(draft.factorToBase) } : {}), ...(mode === "MULTI_LEVEL" ? { parentUnitId: draft.parentUnitId, factorToParent: Number(draft.factorToParent) } : {}), ...(mode === "DIMENSION_BASED" ? { dimensionMetadata: { sourceDimension: "COUNT", targetDimension: dimensionTarget(draft), lengthMeters: Number(draft.lengthMeters), ...(draft.widthMeters ? { widthMeters: Number(draft.widthMeters) } : {}), ...(draft.heightMeters ? { heightMeters: Number(draft.heightMeters) } : {}) } } : {}), ...(mode === "DENSITY_BASED" ? { densityMetadata: { sourceDimension: draft.densitySourceDimension, targetDimension: draft.densitySourceDimension === "MASS" ? "VOLUME" : "MASS", sourceToMetricFactor: Number(draft.sourceToMetricFactor), baseToMetricFactor: Number(draft.baseToMetricFactor) } } : {}), allowedContexts: draft.allowedContexts, status: draft.status };
}
function dimensionTarget(draft: ConversionDraft): "LENGTH" | "AREA" | "VOLUME" { if (draft.heightMeters) return "VOLUME"; if (draft.widthMeters) return "AREA"; return "LENGTH"; }
function safePrices(product: Parameters<typeof priceForDocumentUnit>[0], conversion: Parameters<typeof priceForDocumentUnit>[1]) { try { return priceForDocumentUnit(product, conversion); } catch { return undefined; } }
function contextValue(conversion: ReturnType<typeof resolveProductUnitConversions>[number], context: UnitConversionContext, price?: number) { if (!conversion.allowedContexts.includes(context)) return "Không"; if (!isDeterministicConversionMode(conversion.conversionMode)) return "Theo thực nhận"; return price === undefined ? "Được dùng" : formatMoney(price); }
function conversionDescription(conversion: ReturnType<typeof resolveProductUnitConversions>[number], names: Map<string, string>, baseUnitName: string) { if (conversion.canonicalMode === "VARIABLE_ACTUAL") return `Nhập số ${baseUnitName} thực nhận`; if (conversion.canonicalMode === "MULTI_LEVEL") return `1 ${names.get(conversion.unitId) ?? conversion.unitId} = ${formatQuantity(conversion.factorToParent ?? 0)} ${names.get(conversion.parentUnitId ?? "") ?? baseUnitName}`; if (conversion.canonicalMode === "DIMENSION_BASED") { const metadata = conversion.dimensionMetadata; return metadata ? [metadata.lengthMeters, metadata.widthMeters, metadata.heightMeters].filter((value) => value !== undefined).map((value) => formatQuantity(value!)).join(" × ") + " m" : "Thiếu kích thước"; } if (conversion.canonicalMode === "DENSITY_BASED") return `Theo ${formatQuantity(conversion.densityMetadata?.sourceToMetricFactor ?? 0)} và khối lượng riêng vật tư`; return `Tỷ lệ trực tiếp về ${baseUnitName}`; }
