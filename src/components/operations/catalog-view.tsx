"use client";


import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileSpreadsheet,
  HandCoins,
  Home,
  LogOut,
  PlusCircle,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Truck,
  Users,
  WalletCards,
  Warehouse
} from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import {
  getOperationsSnapshotAction,
  importWorkbookDryRunAction,
  runDemoCreateCommandAction,
  runDemoCreateCommandWithImageAction,
  runDemoOperationAction,
  submitDeliveryCompletionWithImageAction,
  submitGoodsReceiptWithImageAction
} from "@/app/actions";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { deliveryLineQuantityInputMode } from "@/modules/operations/worker-ui-policy";
import {
  cashBalance,
  customerBalance,
  employeeBalance,
  lineTotals,
  partyName,
  productLabel,
  salesOrderTotals,
  stockBalance,
  supplierBalance
} from "@/modules/operations/selectors";
import {
  createMonthlyReport,
  getAvailableReportMonths,
  getDefaultReportMonth
} from "@/modules/operations/monthly-report";
import { createMonthlyReportExportPackage } from "@/modules/operations/report-package";
import {
  createRoleDashboard,
  type DashboardRoleId,
  type RoleDashboardMetric,
  type RoleDashboardTask
} from "@/modules/operations/role-dashboard";
import {
  dashboardRoleForActor
} from "@/modules/operations/identity";
import { createAuditIntegrityReport, createAuditLogCsv } from "@/modules/operations/audit-integrity";
import {
  createDebtStatementCsv,
  getCustomerDebtObligations,
  getCustomerDebtSummaries,
  getOpenCustomerDebtObligations,
  getOpenSupplierDebtObligations,
  getSupplierDebtObligations,
  getSupplierDebtSummaries,
  paymentAllocatedAmount,
  paymentUnallocatedAmount
} from "@/modules/operations/debt-reconciliation";
import { configuredPurchaseUnit, configuredPurchaseUnits, normalizeUnitName } from "@/modules/operations/unit-settings";
import {
  operationDescriptions,
  operationLabels,
  operationsErpRegistry,
  operationsOdooMetadata,
  type OperationsModuleId
} from "@/modules/operations/erp-registry";
import type { CreateCommand, DomainCommandName, OperationName, OperationOptions, OperationsActor, OperationsAttachment, OperationResult, OperationsSnapshot, OperationsState, PurchaseOrderLine, SalesOrderLine } from "@/modules/operations/types";

import { OperationsActorContext, type CreateCommandHandler, type OperationHandler, type SyncMeta, type WorkbookImportHandler } from './operations-contract';
import {
  FormField,
  ProductCatalogPreview,
  SubmitButton,
  WorkflowActionButton,
  ApprovalAttachmentPreview,
  OperationRow,
  EntityPanel,
  DataTable,
  SummaryItem,
  Metric,
  StatusBadge,
  canRunOperation,
  findPurchaseLineForUi,
  productBaseUnit,
  usesProductBaseUnit,
  documentUnitOptions,
  purchaseDocumentUnitOptions,
  defaultPurchaseUnitId,
  defaultPurchaseUnitFactor,
  defaultPurchaseUnitMode,
  isVariablePurchaseUnit,
  displayUnitName,
  documentConversionPreview,
  lineDocumentFactor,
  lineDocumentUnitName,
  salesLineQuantityText,
  purchaseLineProgressText,
  localDateValue,
  defaultAllocationAmounts,
  downloadTextFile,
  filterRows,
  normalizeSearch,
  statusText,
  debtStatusText,
  roleText,
  sourceText,
  formatRoleMetricValue,
  taskStatusClassName,
  taskStatusText
} from './operations-shared';

export function MasterDataView({
  state,
  createCommand,
  isPending,
  searchTerm
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
  searchTerm: string;
}) {
  const customers = filterRows(state.customers, searchTerm, (customer) => [customer.code, customer.displayName, customer.phone]);
  const suppliers = filterRows(state.suppliers, searchTerm, (supplier) => [supplier.code, supplier.displayName, supplier.phone]);
  const productUnits = filterRows(state.productUnits, searchTerm, (product) => [product.productCode, product.productName, product.unitName]);
  const warehouses = filterRows(state.warehouses, searchTerm, (warehouse) => [warehouse.code, warehouse.name]);
  const vehicles = filterRows(state.vehicles, searchTerm, (vehicle) => [vehicle.code, vehicle.plateNumber]);
  const employees = filterRows(state.employees, searchTerm, (employee) => [employee.code, employee.displayName, roleText(employee.roleType)]);

  const customerRows: ReactNode[][] = customers.map((customer) => [
    customer.code,
    customer.displayName,
    customer.phone,
    statusText(customer.status),
    <details>
      <summary>Chi tiết</summary>
      <div className="master-data-detail-body">
        <p><strong>Mã:</strong> {customer.code}</p>
        <p><strong>Tên:</strong> {customer.displayName}</p>
        <p><strong>Điện thoại:</strong> {customer.phone || "Chưa có"}</p>
        <p><strong>Hạn mức:</strong> {formatMoney(customer.creditLimit || 0)}</p>
        <p><strong>Trạng thái:</strong> {statusText(customer.status)}</p>
      </div>
    </details>
  ]);

  const supplierRows: ReactNode[][] = suppliers.map((supplier) => [
    supplier.code,
    supplier.displayName,
    supplier.phone,
    statusText(supplier.status),
    <details>
      <summary>Chi tiết</summary>
      <div className="master-data-detail-body">
        <p><strong>Mã:</strong> {supplier.code}</p>
        <p><strong>Tên:</strong> {supplier.displayName}</p>
        <p><strong>Điện thoại:</strong> {supplier.phone || "Chưa có"}</p>
        <p><strong>Trạng thái:</strong> {statusText(supplier.status)}</p>
        <p><strong>Bị khóa:</strong> {supplier.status === "inactive" ? "Có" : "Không"}</p>
      </div>
    </details>
  ]);

  const productRows: ReactNode[][] = productUnits.map((product) => {
    const preferredSupplier = product.preferredSupplierId
      ? state.suppliers.find((supplier) => supplier.id === product.preferredSupplierId)
      : undefined;
    const catalogState = product.status !== "active"
      ? "Đã ngừng dùng"
      : product.salePrice && Number.isFinite(product.saleTaxRate)
        ? "Đang hiện ở cổng khách"
        : "Chưa đưa lên cổng khách - cần thiết lập giá bán";

    return [
      product.productCode,
      product.productName,
      product.unitName,
      preferredSupplier?.displayName ?? "Chưa chọn",
      formatMoney(product.salePrice ?? 0),
      catalogState,
      <details>
        <summary>Chi tiết</summary>
        <div className="master-data-detail-body">
          <p><strong>Mã:</strong> {product.productCode}</p>
          <p><strong>Tên:</strong> {product.productName}</p>
          <p><strong>Đơn vị tồn kho:</strong> {product.unitName}</p>
          <p><strong>Nhà cung cấp chính:</strong> {preferredSupplier?.displayName ?? "Chưa chọn"}</p>
          <p><strong>Giá bán:</strong> {formatMoney(product.salePrice ?? 0)}</p>
          <p><strong>VAT:</strong> {Number.isFinite(product.saleTaxRate) ? `${(product.saleTaxRate * 100).toFixed(0)}%` : "Chưa thiết lập"}</p>
          <p><strong>Trạng thái cổng khách:</strong> {catalogState}</p>
        </div>
      </details>
    ];
  });

  const warehouseRows: ReactNode[][] = warehouses.map((warehouse) => [
    warehouse.code,
    warehouse.name,
    statusText(warehouse.status),
    <details>
      <summary>Chi tiết</summary>
      <div className="master-data-detail-body">
        <p><strong>Mã kho:</strong> {warehouse.code}</p>
        <p><strong>Tên kho/bãi:</strong> {warehouse.name}</p>
        <p><strong>Trạng thái:</strong> {statusText(warehouse.status)}</p>
      </div>
    </details>
  ]);

  const vehicleRows: ReactNode[][] = vehicles.map((vehicle) => [
    vehicle.code,
    vehicle.plateNumber,
    `${formatQuantity(vehicle.capacityTons)} tấn`,
    statusText(vehicle.status),
    <details>
      <summary>Chi tiết</summary>
      <div className="master-data-detail-body">
        <p><strong>Mã xe:</strong> {vehicle.code}</p>
        <p><strong>Biển số:</strong> {vehicle.plateNumber}</p>
        <p><strong>Tải trọng:</strong> {formatQuantity(vehicle.capacityTons)} tấn</p>
        <p><strong>Trạng thái:</strong> {statusText(vehicle.status)}</p>
      </div>
    </details>
  ]);

  const employeeRows: ReactNode[][] = employees.map((employee) => [
    employee.code,
    employee.displayName,
    roleText(employee.roleType),
    statusText(employee.status),
    <details>
      <summary>Chi tiết</summary>
      <div className="master-data-detail-body">
        <p><strong>Mã nhân sự:</strong> {employee.code}</p>
        <p><strong>Tên:</strong> {employee.displayName}</p>
        <p><strong>Vai trò:</strong> {roleText(employee.roleType)}</p>
        <p><strong>Trạng thái:</strong> {statusText(employee.status)}</p>
      </div>
    </details>
  ]);

  return (
    <div className="dashboard-grid">
      <CreateMasterDataPanel state={state} createCommand={createCommand} isPending={isPending} />
      <PurchaseUnitSettings state={state} createCommand={createCommand} isPending={isPending} />
      <EntityPanel
        title="Khách hàng"
        rows={customerRows}
        headers={["Mã", "Tên", "Điện thoại", "Trạng thái", "Chi tiết"]}
      />
      <EntityPanel
        title="Nhà cung cấp"
        rows={supplierRows}
        headers={["Mã", "Tên", "Điện thoại", "Trạng thái", "Chi tiết"]}
      />
      <EntityPanel
        title="Vật tư - đơn vị"
        rows={productRows}
        headers={["Mã", "Tên vật tư", "Đơn vị tồn kho", "Nhà cung cấp chính", "Giá bán", "Trạng thái cổng khách", "Chi tiết"]}
      />
      <EntityPanel
        title="Kho và bãi"
        rows={warehouseRows}
        headers={["Mã", "Tên kho/bãi", "Trạng thái", "Chi tiết"]}
      />
      <EntityPanel
        title="Phương tiện"
        rows={vehicleRows}
        headers={["Mã xe", "Biển số", "Tải trọng", "Trạng thái", "Chi tiết"]}
      />
      <EntityPanel
        title="Nhân sự"
        rows={employeeRows}
        headers={["Mã", "Tên", "Vai trò", "Trạng thái", "Chi tiết"]}
      />
    </div>
  );
}
export function CreateMasterDataPanel({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const [activeCategory, setActiveCategory] = useState<"customer" | "supplier" | "product" | "warehouse" | "vehicle" | "employee">("customer");
  const categories = [
    { id: "customer", label: "Khách hàng", description: "Tạo người mua mới để lập đơn bán." },
    { id: "supplier", label: "Nhà cung cấp", description: "Tạo đơn vị bán hàng cho cửa hàng." },
    { id: "product", label: "Vật tư", description: "Tạo vật tư và đơn vị tồn kho gốc." },
    { id: "warehouse", label: "Kho / bãi", description: "Tạo nơi nhận và quản lý hàng hóa." },
    { id: "vehicle", label: "Phương tiện", description: "Tạo xe phục vụ giao nhận." },
    { id: "employee", label: "Nhân sự", description: "Tạo tài xế hoặc thợ để phân công việc." }
  ] as const;
  const active = categories.find((category) => category.id === activeCategory) ?? categories[0];

  return (
    <section className="panel span-12">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Tạo danh mục nhanh</h3>
          <p className="panel-note">Dữ liệu nền được kiểm tra trùng tên/mã phía máy chủ trước khi lưu.</p>
        </div>
      </div>
      <div className="panel-body master-data-workspace">
        <div className="master-data-picker" aria-label="Chọn loại danh mục cần tạo">
          <div className="master-data-picker-copy">
            <span>Bước 1</span>
            <strong>Chọn một loại danh mục cần tạo</strong>
          </div>
          <div className="master-data-options" role="group" aria-label="Loại danh mục">
            {categories.map((category) => (
              <button
                aria-pressed={activeCategory === category.id}
                className={activeCategory === category.id ? "master-data-option master-data-option-active" : "master-data-option"}
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                type="button"
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <div className="master-data-active-form">
          <div className="master-data-active-heading">
            <span>Bước 2 - Đang tạo</span>
            <h4>{active.label}</h4>
            <p>{active.description}</p>
          </div>
          {activeCategory === "customer" ? <CustomerQuickForm createCommand={createCommand} isPending={isPending} /> : null}
          {activeCategory === "supplier" ? <SupplierQuickForm createCommand={createCommand} isPending={isPending} /> : null}
          {activeCategory === "product" ? <ProductUnitQuickForm state={state} createCommand={createCommand} isPending={isPending} /> : null}
          {activeCategory === "warehouse" ? <WarehouseQuickForm createCommand={createCommand} isPending={isPending} /> : null}
          {activeCategory === "vehicle" ? <VehicleQuickForm createCommand={createCommand} isPending={isPending} /> : null}
          {activeCategory === "employee" ? <EmployeeQuickForm createCommand={createCommand} isPending={isPending} /> : null}
        </div>
      </div>
    </section>
  );
}


export function CustomerQuickForm({
  createCommand,
  isPending
}: {
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<{ displayName: string; phone: string; creditLimit: number }>({
    defaultValues: { displayName: "", phone: "", creditLimit: 0 }
  });

  return (
    <form
      className="command-form"
      noValidate
      onSubmit={handleSubmit((values) => {
        createCommand({
          type: "createCustomer",
          displayName: values.displayName,
          phone: values.phone,
          creditLimit: values.creditLimit
        });
        reset({ displayName: "", phone: "", creditLimit: 0 });
      })}
    >
      <h4 className="form-title">Khách hàng</h4>
      <FormField label="Tên khách hàng" error={errors.displayName?.message}>
        <input className="input" {...register("displayName", { required: "Nhập tên khách hàng." })} />
      </FormField>
      <FormField label="Điện thoại">
        <input className="input" {...register("phone")} />
      </FormField>
      <FormField label="Hạn mức nợ" error={errors.creditLimit?.message}>
        <input
          className="input"
          type="number"
          min="0"
          step="1"
          {...register("creditLimit", {
            valueAsNumber: true,
            min: { value: 0, message: "Không được âm." }
          })}
        />
      </FormField>
      <SubmitButton label="Tạo khách hàng" command="createCustomer" isPending={isPending} />
    </form>
  );
}

export function InlineSupplierQuickForm({
  createCommand,
  isPending
}: {
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<{ displayName: string; phone: string }>({
    defaultValues: { displayName: "", phone: "" }
  });

  return (
    <form
      className="command-form compact-command-form"
      noValidate
      onSubmit={handleSubmit((values) => {
        createCommand({ type: "createSupplier", displayName: values.displayName, phone: values.phone });
        reset({ displayName: "", phone: "" });
      })}
    >
      <h4 className="form-title">Thêm nhà cung cấp</h4>
      <FormField label="Tên nhà cung cấp mới" error={errors.displayName?.message}>
        <input className="input" {...register("displayName", { required: "Nhập tên nhà cung cấp." })} />
      </FormField>
      <FormField label="Điện thoại">
        <input className="input" {...register("phone")} />
      </FormField>
      <SubmitButton label="Thêm vào dropdown" command="createSupplier" isPending={isPending} />
    </form>
  );
}

export function SupplierQuickForm({
  createCommand,
  isPending
}: {
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<{ displayName: string; phone: string }>({
    defaultValues: { displayName: "", phone: "" }
  });

  return (
    <form
      className="command-form"
      noValidate
      onSubmit={handleSubmit((values) => {
        createCommand({ type: "createSupplier", displayName: values.displayName, phone: values.phone });
        reset({ displayName: "", phone: "" });
      })}
    >
      <h4 className="form-title">Nhà cung cấp</h4>
      <FormField label="Tên nhà cung cấp" error={errors.displayName?.message}>
        <input className="input" {...register("displayName", { required: "Nhập tên nhà cung cấp." })} />
      </FormField>
      <FormField label="Điện thoại">
        <input className="input" {...register("phone")} />
      </FormField>
      <SubmitButton label="Tạo nhà cung cấp" command="createSupplier" isPending={isPending} />
    </form>
  );
}

export function PurchaseUnitSettings({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const canManage = actor.permissions.includes("catalog.manage_purchase_units");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const unitForm = useForm<{ name: string }>({ defaultValues: { name: "" } });
  const initialProductUnitId = state.productUnits[0]?.id ?? "";
  const conversionForm = useForm<{
    productUnitId: string;
    unitId: string;
    conversionMode: "fixed" | "variable";
    factorToBase?: number;
  }>({
    defaultValues: {
      productUnitId: initialProductUnitId,
      unitId: defaultPurchaseUnitId(state, initialProductUnitId),
      conversionMode: defaultPurchaseUnitMode(state, initialProductUnitId),
      factorToBase: defaultPurchaseUnitFactor(state, initialProductUnitId)
    }
  });
  const selectedProductUnitId = conversionForm.watch("productUnitId");
  const selectedUnitId = conversionForm.watch("unitId");
  const selectedMode = conversionForm.watch("conversionMode");
  const selectedFactor = conversionForm.watch("factorToBase");
  const selectedProduct = state.productUnits.find((item) => item.id === selectedProductUnitId);
  const selectedUnit = state.unitDefinitions.find((item) => item.id === selectedUnitId);
  const selectedConversion = state.purchaseUnitConversions.find(
    (item) => item.productUnitId === selectedProductUnitId && item.unitId === selectedUnitId
  );
  const baseUnitNames = new Set(state.productUnits.map((product) => normalizeUnitName(product.unitName)));
  const availableUnits = state.unitDefinitions.filter((unit) =>
    unit.status === "active" && !baseUnitNames.has(normalizeUnitName(unit.name))
  );
  const customUnitCount = state.unitDefinitions.filter((unit) => !baseUnitNames.has(normalizeUnitName(unit.name))).length;
  const resetSettingsKey = "reset:purchase-unit-settings";
  const hasPurchaseUnitSettings = customUnitCount > 0 || state.purchaseUnitConversions.length > 0;

  function syncConversion(productUnitId: string, unitId: string) {
    const existing = state.purchaseUnitConversions.find(
      (item) => item.productUnitId === productUnitId && item.unitId === unitId
    );
    conversionForm.setValue("conversionMode", existing?.conversionMode ?? "fixed", { shouldValidate: true });
    conversionForm.setValue("factorToBase", existing?.factorToBase ?? 1, { shouldValidate: true });
  }

  useEffect(() => {
    if (availableUnits.some((unit) => unit.id === selectedUnitId)) {
      return;
    }
    const nextUnitId = defaultPurchaseUnitId(state, selectedProductUnitId);
    conversionForm.setValue("unitId", nextUnitId);
    const existing = state.purchaseUnitConversions.find(
      (item) => item.productUnitId === selectedProductUnitId && item.unitId === nextUnitId
    );
    conversionForm.setValue("conversionMode", existing?.conversionMode ?? "fixed");
    conversionForm.setValue("factorToBase", existing?.factorToBase ?? 1);
  }, [availableUnits, conversionForm, selectedProductUnitId, selectedUnitId, state, state.purchaseUnitConversions]);

  const unitRows: ReactNode[][] = state.unitDefinitions.map((unit) => {
    const baseProducts = state.productUnits.filter(
      (product) => normalizeUnitName(product.unitName) === normalizeUnitName(unit.name)
    );
    const conversionCount = state.purchaseUnitConversions.filter((item) => item.unitId === unit.id).length;
    const deleteKey = `unit:${unit.id}`;
    return [
      displayUnitName(unit.name),
      baseProducts.length > 0 ? baseProducts.map((product) => product.productName).join(", ") : "Không",
      conversionCount,
      baseProducts.length > 0 ? (
        <span className="muted">Không thể xóa khi đang dùng làm đơn vị tồn kho</span>
      ) : pendingDelete === deleteKey ? (
        <div className="delete-confirmation">
          <span>Xóa đơn vị và {conversionCount} quy đổi hiện tại?</span>
          <button
            className="button button-small button-danger"
            type="button"
            disabled={isPending || !canManage}
            onClick={() => {
              createCommand({ type: "deleteUnitDefinition", unitId: unit.id });
              setPendingDelete(null);
            }}
          >
            <Trash2 aria-hidden="true" />
            Xác nhận xóa
          </button>
          <button className="button button-small" type="button" onClick={() => setPendingDelete(null)}>Hủy</button>
        </div>
      ) : (
        <button
          className="button button-small"
          type="button"
          disabled={isPending || !canManage}
          onClick={() => setPendingDelete(deleteKey)}
        >
          <Trash2 aria-hidden="true" />
          Xóa
        </button>
      )
    ];
  });

  const conversionRows: ReactNode[][] = state.purchaseUnitConversions.map((conversion) => {
    const product = state.productUnits.find((item) => item.id === conversion.productUnitId);
    const unit = state.unitDefinitions.find((item) => item.id === conversion.unitId);
    const deleteKey = `conversion:${conversion.id}`;
    return [
      product ? `${product.productCode} · ${product.productName}` : conversion.productUnitId,
      conversion.conversionMode === "variable"
        ? `${displayUnitName(unit?.name)} · nhập ${displayUnitName(product?.unitName)} thực tế trên từng đơn mua`
        : `1 ${displayUnitName(unit?.name)} = ${formatQuantity(conversion.factorToBase ?? 0)} ${displayUnitName(product?.unitName)}`,
      `v${conversion.version}`,
      pendingDelete === deleteKey ? (
        <div className="delete-confirmation">
          <span>Xóa quy đổi này? Chứng từ cÅ© không thay đổi.</span>
          <button
            className="button button-small button-danger"
            type="button"
            disabled={isPending || !canManage}
            onClick={() => {
              createCommand({
                type: "deletePurchaseUnitConversion",
                conversionId: conversion.id,
                expectedVersion: conversion.version
              });
              setPendingDelete(null);
            }}
          >
            <Trash2 aria-hidden="true" />
            Xác nhận xóa
          </button>
          <button className="button button-small" type="button" onClick={() => setPendingDelete(null)}>Hủy</button>
        </div>
      ) : (
        <button
          className="button button-small"
          type="button"
          disabled={isPending || !canManage}
          onClick={() => setPendingDelete(deleteKey)}
        >
          <Trash2 aria-hidden="true" />
          Xóa quy đổi
        </button>
      )
    ];
  });

  return (
    <section className="panel span-12">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Cài đặt đơn vị mua</h3>
          <p className="panel-note">Tự tạo đơn vị và chọn cách tính riêng cho từng vật tư. Chứng từ đã tạo luôn giữ nguyên dữ liệu cÅ©.</p>
        </div>
        {hasPurchaseUnitSettings ? pendingDelete === resetSettingsKey ? (
          <div className="delete-confirmation">
            <span>Xóa toàn bộ đơn vị mua và cách tính hiện tại?</span>
            <button
              className="button button-small button-danger"
              type="button"
              disabled={isPending || !canManage}
              onClick={() => {
                createCommand({
                  type: "resetPurchaseUnitSettings",
                  expectedCustomUnitCount: customUnitCount,
                  expectedConversionCount: state.purchaseUnitConversions.length
                });
                setPendingDelete(null);
              }}
            >
              <Trash2 aria-hidden="true" />
              Xác nhận xóa
            </button>
            <button className="button button-small" type="button" onClick={() => setPendingDelete(null)}>Hủy</button>
          </div>
        ) : (
          <button
            className="button button-small"
            type="button"
            disabled={isPending || !canManage}
            onClick={() => setPendingDelete(resetSettingsKey)}
          >
            <Trash2 aria-hidden="true" />
            Xóa cài đặt hiện tại
          </button>
        ) : null}
      </div>
      <div className="panel-body">
        <div className="unit-settings-grid">
          <form
            className="command-form unit-setting-form"
            noValidate
            onSubmit={unitForm.handleSubmit((values) => {
              createCommand({ type: "createUnitDefinition", name: values.name });
              unitForm.reset({ name: "" });
            })}
          >
            <h4 className="form-title">Thêm đơn vị</h4>
            <FormField label="Tên đơn vị" error={unitForm.formState.errors.name?.message}>
              <input
                className="input"
                placeholder="Ví dụ: Tấn, Tạ, Xe"
                {...unitForm.register("name", { required: "Nhập tên đơn vị." })}
              />
            </FormField>
            <SubmitButton label="Thêm đơn vị" command="createUnitDefinition" isPending={isPending} />
          </form>

          <form
            className="command-form unit-setting-form"
            noValidate
            onSubmit={conversionForm.handleSubmit((values) => {
              const existing = state.purchaseUnitConversions.find(
                (item) => item.productUnitId === values.productUnitId && item.unitId === values.unitId
              );
              createCommand({
                type: "upsertPurchaseUnitConversion",
                productUnitId: values.productUnitId,
                unitId: values.unitId,
                conversionMode: values.conversionMode,
                factorToBase: values.conversionMode === "fixed" ? values.factorToBase : undefined,
                expectedVersion: existing?.version
              });
            })}
          >
            <h4 className="form-title">Đơn vị mua theo vật tư</h4>
            <FormField label="Vật tư">
              <select
                className="input"
                {...conversionForm.register("productUnitId", {
                  required: "Chọn vật tư.",
                  onChange: (event) => {
                    const nextProductUnitId = event.target.value;
                    const nextUnitId = defaultPurchaseUnitId(state, nextProductUnitId);
                    conversionForm.setValue("unitId", nextUnitId);
                    syncConversion(nextProductUnitId, nextUnitId);
                  }
                })}
              >
                {state.productUnits.map((product) => (
                  <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Đơn vị mua" error={conversionForm.formState.errors.unitId?.message}>
              <select
                className="input"
                disabled={availableUnits.length === 0}
                {...conversionForm.register("unitId", {
                  required: "Chọn đơn vị mua.",
                  onChange: (event) => syncConversion(selectedProductUnitId, event.target.value)
                })}
              >
                <option value="">{availableUnits.length === 0 ? "Chưa có đơn vị mua" : "Chọn đơn vị mua"}</option>
                {availableUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{displayUnitName(unit.name)}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Cách tính">
              <select className="input" {...conversionForm.register("conversionMode") }>
                <option value="fixed">Quy đổi cố định</option>
                <option value="variable">Nhập số lượng thực tế mỗi lần mua</option>
              </select>
            </FormField>
            {selectedMode === "fixed" ? (
              <FormField
                label={`Số ${displayUnitName(selectedProduct?.unitName)} trong 1 ${displayUnitName(selectedUnit?.name)}`}
                error={conversionForm.formState.errors.factorToBase?.message}
              >
                <input
                  className="input"
                  type="number"
                  min="0.001"
                  step="0.001"
                  {...conversionForm.register("factorToBase", {
                    valueAsNumber: true,
                    required: "Nhập hệ số quy đổi.",
                    min: { value: 0.001, message: "Hệ số phải lớn hơn 0." }
                  })}
                />
              </FormField>
            ) : null}
            <p className="conversion-note">
              {selectedMode === "fixed"
                ? `1 ${displayUnitName(selectedUnit?.name)} = ${formatQuantity(Number(selectedFactor || 0))} ${displayUnitName(selectedProduct?.unitName)}`
                : `Mỗi đơn mua sẽ nhập tổng ${displayUnitName(selectedProduct?.unitName)} thực nhận, không dùng hệ số cố định.`}
            </p>
            <SubmitButton
              label={selectedConversion ? "Cập nhật quy đổi" : "Lưu quy đổi"}
              command="upsertPurchaseUnitConversion"
              isPending={isPending}
              disabled={isPending || availableUnits.length === 0}
            />
          </form>
        </div>

        <h4 className="section-heading">Danh mục đơn vị</h4>
        <DataTable
          headers={["Đơn vị", "Đơn vị tồn kho của", "Số cách tính", "Hành động"]}
          rows={unitRows}
          emptyText="Chưa có đơn vị. Hãy thêm đơn vị trước khi tạo vật tư."
        />
        <h4 className="section-heading">Cách tính đang áp dụng</h4>
        <DataTable
          headers={["Vật tư", "Cách tính", "Phiên bản", "Hành động"]}
          rows={conversionRows}
          emptyText="Chưa có cách tính đơn vị mua."
        />
      </div>
    </section>
  );
}

export function ProductUnitQuickForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const activeBaseUnits = state.unitDefinitions.filter((unit) => unit.status === "active");
  const canCreateProduct = activeBaseUnits.length > 0;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<{ productCode: string; productName: string; unitName: string; preferredSupplierId: string }>({
    defaultValues: { productCode: "", productName: "", unitName: "", preferredSupplierId: "" }
  });

  return (
    <form
      className="command-form"
      noValidate
      onSubmit={handleSubmit((values) => {
        createCommand({
          type: "createProductUnit",
          productCode: values.productCode,
          productName: values.productName,
          unitName: values.unitName,
          preferredSupplierId: values.preferredSupplierId || undefined
        }, () => {
          reset({ productCode: "", productName: "", unitName: "", preferredSupplierId: "" });
        });
      })}
    >
      <h4 className="form-title">Vật tư</h4>
      <FormField label="Mã vật tư" error={errors.productCode?.message}>
        <input className="input" {...register("productCode", { required: "Nhập mã vật tư." })} />
      </FormField>
      <FormField label="Tên vật tư" error={errors.productName?.message}>
        <input className="input" {...register("productName", { required: "Nhập tên vật tư." })} />
      </FormField>
      <FormField label="Đơn vị tồn kho gốc" error={errors.unitName?.message}>
        <select className="input" disabled={!canCreateProduct} {...register("unitName", { required: "Chọn đơn vị tồn kho gốc." })}>
          <option value="">{canCreateProduct ? "Chọn đơn vị" : "Chưa có đơn vị tồn kho để chọn"}</option>
          {activeBaseUnits.map((unit) => (
            <option key={unit.id} value={unit.name}>{displayUnitName(unit.name)}</option>
          ))}
        </select>
      </FormField>
      {!canCreateProduct ? (
        <p className="panel-note" role="status">
          Hãy thêm ít nhất một đơn vị tồn kho đang dùng ở phần “Đơn vị và quy đổi”, rồi quay lại tạo vật tư.
        </p>
      ) : null}
      <FormField label="Nhà cung cấp chính (có thể để trống)" error={errors.preferredSupplierId?.message}>
        <select className="input" {...register("preferredSupplierId")}>
          <option value="">Chưa chọn nhà cung cấp</option>
          {state.suppliers.filter((supplier) => supplier.status === "active").map((supplier) => (
            <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>
          ))}
        </select>
      </FormField>
      <SubmitButton
        label={canCreateProduct ? "Tạo vật tư" : "Cần thêm đơn vị tồn kho trước"}
        command="createProductUnit"
        isPending={isPending}
        disabled={isPending || !canCreateProduct}
      />
    </form>
  );
}

export function WarehouseQuickForm({ createCommand, isPending }: { createCommand: CreateCommandHandler; isPending: boolean }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ code: string; name: string }>({
    defaultValues: { code: "", name: "" }
  });

  return (
    <form className="command-form compact-command-form" noValidate onSubmit={handleSubmit((values) => {
      createCommand({ type: "createWarehouse", code: values.code, name: values.name });
      reset();
    })}>
      <h4 className="form-title">Kho / bãi</h4>
      <FormField label="Mã kho" error={errors.code?.message}>
        <input className="input" {...register("code", { required: "Nhập mã kho." })} />
      </FormField>
      <FormField label="Tên kho" error={errors.name?.message}>
        <input className="input" {...register("name", { required: "Nhập tên kho." })} />
      </FormField>
      <SubmitButton label="Tạo kho" command="createWarehouse" isPending={isPending} />
    </form>
  );
}

export function VehicleQuickForm({ createCommand, isPending }: { createCommand: CreateCommandHandler; isPending: boolean }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    code: string;
    plateNumber: string;
    capacityTons: number;
  }>({ defaultValues: { code: "", plateNumber: "", capacityTons: 5 } });

  return (
    <form className="command-form compact-command-form" noValidate onSubmit={handleSubmit((values) => {
      createCommand({ type: "createVehicle", ...values });
      reset({ code: "", plateNumber: "", capacityTons: 5 });
    })}>
      <h4 className="form-title">Phương tiện</h4>
      <FormField label="Mã xe" error={errors.code?.message}>
        <input className="input" {...register("code", { required: "Nhập mã xe." })} />
      </FormField>
      <FormField label="Biển số" error={errors.plateNumber?.message}>
        <input className="input" {...register("plateNumber", { required: "Nhập biển số xe." })} />
      </FormField>
      <FormField label="Tải trọng (tấn)" error={errors.capacityTons?.message}>
        <input className="input" type="number" min="0.1" step="0.1" {...register("capacityTons", {
          valueAsNumber: true,
          min: { value: 0.1, message: "Tải trọng phải lớn hơn 0." }
        })} />
      </FormField>
      <SubmitButton label="Tạo xe" command="createVehicle" isPending={isPending} />
    </form>
  );
}

export function EmployeeQuickForm({
  createCommand,
  isPending
}: {
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<{ displayName: string; roleType: "driver" | "worker" | "warehouse" | "sales" | "accountant" | "supervisor" }>({
    defaultValues: { displayName: "", roleType: "worker" }
  });

  return (
    <form
      className="command-form"
      noValidate
      onSubmit={handleSubmit((values) => {
        createCommand({ type: "createEmployee", displayName: values.displayName, roleType: values.roleType });
        reset({ displayName: "", roleType: "worker" });
      })}
    >
      <h4 className="form-title">Nhân sự</h4>
      <FormField label="Tên nhân viên" error={errors.displayName?.message}>
        <input className="input" {...register("displayName", { required: "Nhập tên nhân viên." })} />
      </FormField>
      <FormField label="Vai trò">
        <select className="input" {...register("roleType")}>
          <option value="worker">Thợ</option>
          <option value="driver">Tài xế</option>
          <option value="warehouse">Kho</option>
          <option value="sales">Bán hàng</option>
          <option value="accountant">Kế toán</option>
          <option value="supervisor">Giám sát</option>
        </select>
      </FormField>
      <SubmitButton label="Tạo nhân sự" command="createEmployee" isPending={isPending} />
    </form>
  );
}
