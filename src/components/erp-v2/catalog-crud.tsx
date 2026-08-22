"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { runErpV2CreateCommandAction, runErpV2OperationAction } from "@/app/actions";
import type { CatalogAccess, CatalogKind } from "@/server/erp-v2/catalog-read-model";
import type { Customer, Employee, ProductUnit, Supplier, Vehicle, Warehouse } from "@/modules/operations/types";

type CatalogRecord = Customer | Supplier | ProductUnit | Warehouse | Vehicle | Employee;

const roleLabels: Record<Employee["roleType"], string> = {
  worker: "Thợ",
  driver: "Tài xế",
  warehouse: "Kho",
  sales: "Bán hàng",
  accountant: "Kế toán",
  supervisor: "Giám sát"
};

const labels: Record<CatalogKind, string> = {
  customers: "khách hàng",
  suppliers: "nhà cung cấp",
  products: "vật tư",
  warehouses: "kho / bãi",
  vehicles: "phương tiện",
  employees: "nhân sự"
};

export function CatalogCreateForm({ access, kind }: { access: CatalogAccess; kind: CatalogKind }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>({ creditLimit: "0", capacityTons: "5", salePrice: "", saleTaxRate: "0", status: "active" });
  const [visibleOnCustomerPortal, setVisibleOnCustomerPortal] = useState(true);
  const [orderableOnline, setOrderableOnline] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const title = catalogDisplayName(kind);
  const update = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    const command = createCommand(kind, values, visibleOnCustomerPortal, orderableOnline);
    const validation = validateCreate(kind, values);
    if (validation) { setError(validation); return; }
    startTransition(async () => {
      const result = await runErpV2CreateCommandAction({ command, idempotencyKey: `catalog-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` });
      if (!result.ok) { setError(result.error); return; }
      if (!result.result.createdEntityId) { setError("Đã lưu nhưng chưa nhận được ID master authoritative; thử tải lại."); return; }
      setMessage("Đã tạo bản ghi. Đang mở chi tiết authoritative…");
      router.push(`${catalogPath(kind, result.result.createdEntityId)}?created=1`);
      router.refresh();
    });
  }

  return (
    <section className="erp-v2-panel" aria-labelledby="catalog-create-title">
      <div className="erp-v2-panel-header"><div><p className="erp-v2-eyebrow">Danh mục nền</p><h1 id="catalog-create-title">Tạo {labels[kind]}</h1><p>Biểu mẫu lưu qua command authoritative, kiểm tra trùng và audit phía máy chủ.</p></div></div>
      <form className="command-form erp-v2-crud-form" noValidate onSubmit={submit} aria-busy={isPending}>
        {kind === "customers" ? <><Field label="Tên khách hàng" name="displayName" value={values.displayName ?? ""} onChange={update} required /><Field label="Điện thoại" name="phone" value={values.phone ?? ""} onChange={update} /><Field label="Hạn mức nợ (VND)" name="creditLimit" value={values.creditLimit ?? "0"} onChange={update} type="number" min="0" /></> : null}
        {kind === "suppliers" ? <><Field label="Tên nhà cung cấp" name="displayName" value={values.displayName ?? ""} onChange={update} required /><Field label="Điện thoại" name="phone" value={values.phone ?? ""} onChange={update} /></> : null}
        {kind === "products" ? <ProductCreateFields access={access} values={values} update={update} visibleOnCustomerPortal={visibleOnCustomerPortal} setVisibleOnCustomerPortal={setVisibleOnCustomerPortal} orderableOnline={orderableOnline} setOrderableOnline={setOrderableOnline} /> : null}
        {kind === "warehouses" ? <><Field label="Mã kho / bãi" name="code" value={values.code ?? ""} onChange={update} required /><Field label="Tên kho / bãi" name="name" value={values.name ?? ""} onChange={update} required /></> : null}
        {kind === "vehicles" ? <><Field label="Mã phương tiện" name="code" value={values.code ?? ""} onChange={update} required /><Field label="Biển số" name="plateNumber" value={values.plateNumber ?? ""} onChange={update} required /><Field label="Tải trọng (tấn)" name="capacityTons" value={values.capacityTons ?? "5"} onChange={update} type="number" min="0.1" step="0.1" required /></> : null}
        {kind === "employees" ? <><Field label="Tên nhân sự" name="displayName" value={values.displayName ?? ""} onChange={update} required /><label className="form-field"><span>Vai trò</span><select className="input" value={values.roleType ?? "worker"} onChange={(event) => update("roleType", event.target.value)}><option value="worker">Thợ</option><option value="driver">Tài xế</option><option value="warehouse">Kho</option><option value="sales">Bán hàng</option><option value="accountant">Kế toán</option><option value="supervisor">Giám sát</option></select></label></> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success" role="status">{message}</p> : null}
        <div className="erp-v2-detail-actions"><button className="erp-v2-button primary" type="submit" disabled={isPending}>{isPending ? "Đang lưu…" : `Tạo ${labels[kind]}`}</button><button className="erp-v2-button" type="button" onClick={() => router.push(catalogPath(kind))} disabled={isPending}>Hủy</button></div>
      </form>
    </section>
  );
}

export function CatalogEditForm({ access, kind, record }: { access: CatalogAccess; kind: CatalogKind; record: CatalogRecord }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initial = editValues(kind, record);
  const [values, setValues] = useState<Record<string, string>>(initial.values as unknown as Record<string, string>);
  const [visibleOnCustomerPortal, setVisibleOnCustomerPortal] = useState(initial.visibleOnCustomerPortal);
  const [orderableOnline, setOrderableOnline] = useState(initial.orderableOnline);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const update = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    const validation = validateEdit(kind, values);
    if (validation) { setError(validation); return; }
    startTransition(async () => {
      const result = await runErpV2OperationAction({ operation: "updateCatalogRecord", targetId: record.id, idempotencyKey: `catalog-edit-${kind}-${record.id}-${Date.now()}`, options: editOptions(kind, values, visibleOnCustomerPortal, orderableOnline, record.version ?? 1) });
      if (!result.ok) { setError(result.error); return; }
      setMessage(result.result.summary);
      router.refresh();
    });
  }
  return (
    <section className="erp-v2-panel" aria-labelledby="catalog-edit-title">
      <div className="erp-v2-panel-header"><div><p className="erp-v2-eyebrow">{catalogDisplayName(kind)}</p><h1 id="catalog-edit-title">Chỉnh sửa {labels[kind]}</h1><p>ID authoritative: {record.id} · phiên bản {record.version ?? 1}. Dữ liệu dẫn xuất và chứng từ lịch sử không chỉnh sửa tại đây.</p></div></div>
      <form className="command-form erp-v2-crud-form" noValidate onSubmit={submit} aria-busy={isPending}>
        {kind === "customers" ? <><Field label="Tên khách hàng" name="displayName" value={values.displayName ?? ""} onChange={update} required /><Field label="Điện thoại" name="phone" value={values.phone ?? ""} onChange={update} /><Field label="Hạn mức nợ (VND)" name="creditLimit" value={values.creditLimit ?? "0"} onChange={update} type="number" min="0" /></> : null}
        {kind === "suppliers" ? <><Field label="Tên nhà cung cấp" name="displayName" value={values.displayName ?? ""} onChange={update} required /><Field label="Điện thoại" name="phone" value={values.phone ?? ""} onChange={update} /></> : null}
        {kind === "products" ? <><Field label="Mã vật tư" name="productCode" value={values.productCode ?? ""} onChange={update} required /><Field label="Tên vật tư" name="productName" value={values.productName ?? ""} onChange={update} required /><label className="form-field"><span>Nhà cung cấp chính</span><select className="input" value={values.preferredSupplierId ?? ""} onChange={(event) => update("preferredSupplierId", event.target.value)}><option value="">Chưa chọn</option>{access.snapshot.state.suppliers.filter((supplier) => supplier.status === "active").map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}</select></label><CheckField label="Hiển thị trên cổng khách hàng" checked={visibleOnCustomerPortal} onChange={setVisibleOnCustomerPortal} /><CheckField label="Cho phép đặt trực tuyến" checked={orderableOnline} onChange={setOrderableOnline} /></> : null}
        {kind === "warehouses" ? <><Field label="Mã kho / bãi" name="code" value={values.code ?? ""} onChange={update} required /><Field label="Tên kho / bãi" name="name" value={values.name ?? ""} onChange={update} /></> : null}
        {kind === "vehicles" ? <><Field label="Mã phương tiện" name="code" value={values.code ?? ""} onChange={update} required /><Field label="Biển số" name="plateNumber" value={values.plateNumber ?? ""} onChange={update} required /><Field label="Tải trọng (tấn)" name="capacityTons" value={values.capacityTons ?? ""} onChange={update} type="number" min="0.1" step="0.1" required /></> : null}
        {kind === "employees" ? <><Field label="Tên nhân sự" name="displayName" value={values.displayName ?? ""} onChange={update} required /><label className="form-field"><span>Vai trò</span><select className="input" value={values.roleType ?? "worker"} onChange={(event) => update("roleType", event.target.value)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></> : null}
        <label className="form-field"><span>Trạng thái</span><select className="input" value={values.status ?? "active"} onChange={(event) => update("status", event.target.value)}><option value="active">Đang hoạt động</option><option value="inactive">Tạm ngưng</option></select></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success" role="status">{message}</p> : null}
        <div className="erp-v2-detail-actions"><button className="erp-v2-button primary" type="submit" disabled={isPending}>{isPending ? "Đang lưu…" : "Lưu thay đổi"}</button><button className="erp-v2-button" type="button" onClick={() => router.push(catalogPath(kind, record.id))} disabled={isPending}>Hủy</button></div>
      </form>
    </section>
  );
}

function ProductCreateFields({ access, values, update, visibleOnCustomerPortal, setVisibleOnCustomerPortal, orderableOnline, setOrderableOnline }: { access: CatalogAccess; values: Record<string, string>; update: (name: string, value: string) => void; visibleOnCustomerPortal: boolean; setVisibleOnCustomerPortal: (value: boolean) => void; orderableOnline: boolean; setOrderableOnline: (value: boolean) => void }) {
  return <><Field label="Mã vật tư" name="productCode" value={values.productCode ?? ""} onChange={update} required /><Field label="Tên vật tư" name="productName" value={values.productName ?? ""} onChange={update} required /><label className="form-field"><span>Đơn vị tồn kho gốc</span><select className="input" value={values.unitName ?? ""} onChange={(event) => update("unitName", event.target.value)} required><option value="">Chọn đơn vị</option>{access.snapshot.state.unitDefinitions.filter((unit) => unit.status === "active").map((unit) => <option key={unit.id} value={unit.name}>{unit.name}</option>)}</select></label><label className="form-field"><span>Nhà cung cấp chính</span><select className="input" value={values.preferredSupplierId ?? ""} onChange={(event) => update("preferredSupplierId", event.target.value)}><option value="">Chưa chọn</option>{access.snapshot.state.suppliers.filter((supplier) => supplier.status === "active").map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}</select></label><Field label="Giá bán (VND, có thể để trống)" name="salePrice" value={values.salePrice ?? ""} onChange={update} type="number" min="0" /><Field label="VAT (%, 0–100)" name="saleTaxRate" value={values.saleTaxRate ?? "0"} onChange={update} type="number" min="0" max="100" step="0.01" /><CheckField label="Hiển thị trên cổng khách hàng" checked={visibleOnCustomerPortal} onChange={setVisibleOnCustomerPortal} /><CheckField label="Cho phép đặt trực tuyến" checked={orderableOnline} onChange={setOrderableOnline} /><label className="form-field"><span>Trạng thái khi tạo</span><select className="input" value={values.status ?? "active"} onChange={(event) => update("status", event.target.value)}><option value="active">Đang hoạt động</option><option value="inactive">Tạm ngưng</option></select></label></>;
}

function createCommand(kind: CatalogKind, values: Record<string, string>, visibleOnCustomerPortal: boolean, orderableOnline: boolean) {
  if (kind === "customers") return { type: "createCustomer" as const, displayName: values.displayName?.trim() ?? "", phone: values.phone?.trim() ?? "", creditLimit: Number(values.creditLimit || 0) };
  if (kind === "suppliers") return { type: "createSupplier" as const, displayName: values.displayName?.trim() ?? "", phone: values.phone?.trim() ?? "" };
  if (kind === "products") return { type: "createProductUnit" as const, productCode: values.productCode?.trim() ?? "", productName: values.productName?.trim() ?? "", unitName: values.unitName?.trim() ?? "", preferredSupplierId: values.preferredSupplierId || undefined, salePrice: values.salePrice === "" ? undefined : Number(values.salePrice), saleTaxRate: Number(values.saleTaxRate || 0) / 100, visibleOnCustomerPortal, orderableOnline, status: (values.status === "inactive" ? "inactive" : "active") as "active" | "inactive" };
  if (kind === "warehouses") return { type: "createWarehouse" as const, code: values.code?.trim() ?? "", name: values.name?.trim() ?? "" };
  if (kind === "vehicles") return { type: "createVehicle" as const, code: values.code?.trim() ?? "", plateNumber: values.plateNumber?.trim() ?? "", capacityTons: Number(values.capacityTons) };
  return { type: "createEmployee" as const, displayName: values.displayName?.trim() ?? "", roleType: (values.roleType || "worker") as Employee["roleType"] };
}

function editOptions(kind: CatalogKind, values: Record<string, string>, visibleOnCustomerPortal: boolean, orderableOnline: boolean, expectedVersion: number) {
  const base = { catalogKind: kind, expectedVersion, status: values.status === "inactive" ? "inactive" as const : "active" as const };
  if (kind === "customers") return { ...base, displayName: values.displayName, phone: values.phone, creditLimit: Number(values.creditLimit || 0) };
  if (kind === "suppliers") return { ...base, displayName: values.displayName, phone: values.phone };
  if (kind === "products") return { ...base, productCode: values.productCode, productName: values.productName, preferredSupplierId: values.preferredSupplierId, visibleOnCustomerPortal, orderableOnline };
  if (kind === "warehouses") return { ...base, code: values.code, name: values.name };
  if (kind === "vehicles") return { ...base, code: values.code, plateNumber: values.plateNumber, capacityTons: Number(values.capacityTons) };
  return { ...base, displayName: values.displayName, roleType: values.roleType as Employee["roleType"] };
}

function editValues(kind: CatalogKind, record: CatalogRecord) {
  if (kind === "customers") { const item = record as Customer; return { values: { displayName: item.displayName, phone: item.phone, creditLimit: String(item.creditLimit), status: item.status }, visibleOnCustomerPortal: true, orderableOnline: true }; }
  if (kind === "suppliers") { const item = record as Supplier; return { values: { displayName: item.displayName, phone: item.phone, status: item.status }, visibleOnCustomerPortal: true, orderableOnline: true }; }
  if (kind === "products") { const item = record as ProductUnit; return { values: { productCode: item.productCode, productName: item.productName, preferredSupplierId: item.preferredSupplierId ?? "", status: item.status }, visibleOnCustomerPortal: item.visibleOnCustomerPortal !== false, orderableOnline: item.orderableOnline !== false }; }
  if (kind === "warehouses") { const item = record as Warehouse; return { values: { code: item.code, name: item.name, status: item.status }, visibleOnCustomerPortal: true, orderableOnline: true }; }
  if (kind === "vehicles") { const item = record as Vehicle; return { values: { code: item.code, plateNumber: item.plateNumber, capacityTons: String(item.capacityTons), status: item.status }, visibleOnCustomerPortal: true, orderableOnline: true }; }
  const item = record as Employee; return { values: { displayName: item.displayName, roleType: item.roleType, status: item.status }, visibleOnCustomerPortal: true, orderableOnline: true };
}

function validateCreate(kind: CatalogKind, values: Record<string, string>) {
  if ((kind === "customers" || kind === "suppliers" || kind === "employees") && !values.displayName?.trim()) return "Tên không được để trống.";
  if (kind === "products" && (!values.productCode?.trim() || !values.productName?.trim() || !values.unitName?.trim())) return "Mã, tên và đơn vị vật tư là bắt buộc.";
  if ((kind === "warehouses" || kind === "vehicles") && !values.code?.trim()) return "Mã là bắt buộc.";
  if (kind === "warehouses" && !values.name?.trim()) return "Tên kho / bãi là bắt buộc.";
  if (kind === "vehicles" && (!values.plateNumber?.trim() || Number(values.capacityTons) <= 0)) return "Biển số và tải trọng xe phải hợp lệ.";
  if (kind === "products" && (Number(values.saleTaxRate || 0) < 0 || Number(values.saleTaxRate || 0) > 100)) return "VAT phải từ 0 đến 100%.";
  return "";
}

function validateEdit(kind: CatalogKind, values: Record<string, string>) {
  if ((kind === "customers" || kind === "suppliers" || kind === "employees") && !values.displayName?.trim()) return "Tên không được để trống.";
  if (kind === "products" && (!values.productCode?.trim() || !values.productName?.trim())) return "Mã và tên vật tư là bắt buộc.";
  if ((kind === "warehouses" || kind === "vehicles") && !values.code?.trim()) return "Mã là bắt buộc.";
  if (kind === "warehouses" && !values.name?.trim()) return "Tên kho / bãi là bắt buộc.";
  if (kind === "vehicles" && (!values.plateNumber?.trim() || Number(values.capacityTons) <= 0)) return "Biển số và tải trọng xe phải hợp lệ.";
  return "";
}

function catalogDisplayName(kind: CatalogKind) {
  return ({
    customers: "Khách hàng",
    suppliers: "Nhà cung cấp",
    products: "Vật tư",
    warehouses: "Kho / bãi",
    vehicles: "Phương tiện",
    employees: "Nhân sự"
  } as const)[kind];
}

function catalogPath(kind: CatalogKind, id?: string) {
  return id ? "/catalog/" + kind + "/" + encodeURIComponent(id) : "/catalog/" + kind;
}

function Field({ label, name, value, onChange, type = "text", min, max, step, required }: { label: string; name: string; value: string; onChange: (name: string, value: string) => void; type?: string; min?: string; max?: string; step?: string; required?: boolean }) {
  return <label className="form-field"><span>{label}</span><input className="input" name={name} value={value} onChange={(event) => onChange(name, event.target.value)} type={type} min={min} max={max} step={step} required={required} /></label>;
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="form-field checkbox-field"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}
