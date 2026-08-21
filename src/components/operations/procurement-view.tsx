"use client";


import Link from "next/link";
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
  getSelectableCustomers,
  getSelectableProducts,
  getSelectableSuppliers,
  getSelectableWarehouses,
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
import { InlineSupplierQuickForm } from './catalog-view';
import { WorkerDeliveryView } from './delivery-view';

function linkedDirectSaleSummary(
  state: OperationsState,
  purchaseOrder: OperationsState["purchaseOrders"][number],
  purchaseLine: PurchaseOrderLine
) {
  if (!purchaseLine.salesOrderLineId) return undefined;
  const salesOrder = state.salesOrders.find((order) => order.lines.some((line) => line.id === purchaseLine.salesOrderLineId));
  const salesLine = salesOrder?.lines.find((line) => line.id === purchaseLine.salesOrderLineId);
  if (!salesOrder || !salesLine) return undefined;
  const salesNet = salesLine.quantity * salesLine.unitPrice - (salesLine.discount?.amount ?? 0);
  const purchaseNet = purchaseLine.orderedQuantity * purchaseLine.unitCost - (purchaseLine.discount?.amount ?? 0);
  const freight = purchaseOrder.freightCharges?.reduce((total, charge) => {
    const allocation = charge.allocations.find((item) => item.purchaseOrderLineId === purchaseLine.id);
    return total + (allocation?.allocatedNetAmount ?? 0);
  }, 0) ?? 0;
  const expectedProfit = salesNet - purchaseNet - freight;
  return {
    documentNo: salesOrder.documentNo,
    expectedProfit,
    marginRate: salesNet > 0 ? expectedProfit / salesNet : 0
  };
}

function directLineEstimate(state: OperationsState, line: {
  productUnitId: string;
  orderedQuantity: number;
  unitCost: number;
  unitName: string;
  unitFactor?: number;
  actualBaseQuantity?: number;
  destinationType: "warehouse" | "customer_direct";
}) {
  if (line.destinationType !== "customer_direct") return undefined;
  const product = state.productUnits.find((item) => item.id === line.productUnitId);
  if (!product || product.salePrice === undefined) return undefined;
  const configuredUnit = configuredPurchaseUnit(state, line.productUnitId, line.unitName);
  const baseQuantity = configuredUnit?.conversionMode === "variable"
    ? Number(line.actualBaseQuantity) || 0
    : (Number(line.orderedQuantity) || 0) * (Number(line.unitFactor) || 0);
  const salesNet = baseQuantity * product.salePrice;
  const purchaseNet = (Number(line.orderedQuantity) || 0) * (Number(line.unitCost) || 0);
  return { salesNet, purchaseNet, expectedProfit: salesNet - purchaseNet };
}

export function ProcurementView({
  state,
  runOperation,
  createCommand,
  isPending
}: {
  state: OperationsState;
  runOperation: OperationHandler;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const [editingDraftId, setEditingDraftId] = useState<string>();
  const editingDraft = state.purchaseOrders.find((item) => item.id === editingDraftId && item.status === "draft");
  if (actor.role === "worker") {
    return <WorkerDeliveryView state={state} runOperation={runOperation} isPending={isPending} />;
  }

  return (
    <div className="phase4-document-workspace">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Đơn mua và điểm nhận</h3>
            <p className="panel-note">Một lần mua có thể chia vào kho hoặc giao thẳng khách.</p>
          </div>
          <a className="button button-small" href="/cash/transfer-proofs">Sao lưu chuyển khoản</a>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Đơn mua", "Nhà cung cấp", "Vật tư", "Điểm nhận", "Đã nhận", "Đơn bán / lãi dự kiến", "Ảnh", "Hành động"]}
            rows={state.purchaseOrders.flatMap((order) =>
              order.lines.map((line) => {
                const linkedSale = linkedDirectSaleSummary(state, order, line);
                return [
                `${order.documentNo} · ${statusText(order.status)}`,
                partyName(state, order.supplierId),
                productLabel(state, line.productUnitId),
                line.destinationType === "warehouse" ? "Kho cửa hàng" : "Giao thẳng khách",
                purchaseLineProgressText(state, line),
                line.destinationType === "customer_direct" ? (
                  linkedSale ? (
                    <div key="linked-sale" className="linked-sale-summary">
                      <strong>{linkedSale.documentNo}</strong>
                      <span>Lãi dự kiến {formatMoney(linkedSale.expectedProfit)} · {(linkedSale.marginRate * 100).toFixed(1)}%</span>
                    </div>
                  ) : <span key="no-linked-sale" className="muted">Chưa có đơn bán liên kết</span>
                ) : <span key="warehouse-sale" className="muted">Không áp dụng</span>,
                <ApprovalAttachmentPreview key="attachments" attachments={order.attachments} emptyText="" />,
                order.status === "draft" ? (
                  <div key="draft-actions" className="table-actions"><button className="button button-small" type="button" disabled={isPending} onClick={() => setEditingDraftId(order.id)}>Sửa nháp</button><WorkflowActionButton operation="confirmPurchaseOrder" state={state} runOperation={runOperation} isPending={isPending} label="Xác nhận đơn" targetId={order.id} /></div>
                ) : line.destinationType === "customer_direct" ? (
                  <div key="direct-actions" className="table-actions">
                    {line.receivedQuantity < line.orderedQuantity ? (
                      <WorkflowActionButton operation="confirmDirectDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Giao thẳng" targetId={line.id} />
                    ) : null}
                    {line.receivedQuantity > 0 ? (
                      <WorkflowActionButton operation="reverseDirectDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Đảo giao" targetId={line.id} />
                    ) : null}
                  </div>
                ) : line.receivedQuantity >= line.orderedQuantity ? (
                  <span key="done" className="muted">Đã nhận đủ</span>
                ) : state.approvalRequests.some((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id) ? (
                  actor.role === "owner" || actor.role === "accountant" ? (
                    <div key="receipt-approval" className="table-actions">
                      <ApprovalAttachmentPreview attachments={state.approvalRequests.find((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id)?.attachments} />
                      <WorkflowActionButton operation="approveGoodsReceipt" state={state} runOperation={runOperation} isPending={isPending} label="Duyệt nhận" targetId={state.approvalRequests.find((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id)?.id} />
                      <WorkflowActionButton operation="rejectGoodsReceipt" state={state} runOperation={runOperation} isPending={isPending} label="Từ chối" targetId={state.approvalRequests.find((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id)?.id} />
                    </div>
                  ) : (
                    <span key="receipt-waiting" className="muted">Chờ Chủ cửa hàng/Kế toán duyệt</span>
                  )
                ) : actor.role === "worker" ? (
                  <WorkflowActionButton key="submit-receipt" operation="submitGoodsReceipt" state={state} runOperation={runOperation} isPending={isPending} label="Gửi duyệt nhận" targetId={line.id} />
                ) : (
                  <WorkflowActionButton key="receipt" operation="postGoodsReceipt" state={state} runOperation={runOperation} isPending={isPending} label="Ghi nhập" targetId={line.id} />
                )
              ];
              })
            )}
          />
        </div>
      </section>
      <PurchaseOrderDraftForm state={state} createCommand={createCommand} isPending={isPending} editingDraft={editingDraft} onSaved={() => setEditingDraftId(undefined)} />
    </div>
  );
}


export function WorkerProcurementView({
  state,
  runOperation,
  isPending
}: {
  state: OperationsState;
  runOperation: OperationHandler;
  isPending: boolean;
}) {
  const rows = state.purchaseOrders.flatMap((order) => order.lines.map((line) => {
    const pendingApproval = state.approvalRequests.find((request) =>
      request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id
    );
    return [
      order.documentNo,
      productLabel(state, line.productUnitId),
      `${formatQuantity(line.receivedQuantity)} / ${formatQuantity(line.orderedQuantity)}`,
      pendingApproval ? "Chờ Chủ cửa hàng/Kế toán duyệt" : "Cần kiểm tra thực tế",
      pendingApproval
        ? <span key={`${line.id}-waiting`} className="muted">Đã gửi ảnh thực nhận</span>
        : <WorkflowActionButton key={`${line.id}-submit`} operation="submitGoodsReceipt" state={state} runOperation={runOperation} isPending={isPending} label="Chụp ảnh và gửi duyệt" targetId={line.id} />
    ];
  }));

  return <div className="workbench-grid">
    <section className="panel span-12">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Hàng cần nhận thực tế</h3>
          <p className="panel-note">Nhập số hàng đã nhận và chụp ảnh. Cửa hàng sẽ kiểm tra trước khi ghi vào kho.</p>
        </div>
      </div>
      <div className="panel-body">
        <DataTable
          headers={["Phiếu mua", "Vật tư", "Đã nhận / cần nhận", "Tình trạng", "Thao tác"]}
          rows={rows}
          emptyText="Chưa có hàng nào được giao cho bạn nhận."
        />
      </div>
    </section>
  </div>;
}


type PurchaseDraftFormValues = {
  supplierId: string;
  orderDate: string;
  paymentTermDays: number;
  paymentTermsNote: string;
  expectedDeliveryDate: string;
  createLinkedSalesDraft: boolean;
  lines: Array<{
    productUnitId: string;
    orderedQuantity: number;
    unitCost: number;
    taxRate: number;
    unitName: string;
    unitFactor?: number;
    actualBaseQuantity?: number;
    destinationType: "warehouse" | "customer_direct";
    warehouseId: string;
    customerId: string;
    discountKind: "percentage" | "amount";
    discountValue: number;
  }>;
};

export function PurchaseOrderDraftForm({
  state,
  createCommand,
  isPending,
  editingDraft,
  onSaved
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
  editingDraft?: OperationsState["purchaseOrders"][number];
  onSaved?: () => void;
}) {
  const actor = useContext(OperationsActorContext);
  const suppliers = getSelectableSuppliers(state, actor);
  const customers = getSelectableCustomers(state, actor);
  const products = getSelectableProducts(state);
  const warehouses = getSelectableWarehouses(state, actor);
  function getDefaultPurchaseUnit(productUnitId: string) {
    return configuredPurchaseUnits(state, productUnitId)[0];
  }

  function getDefaultPurchaseUnitFactor(productUnitId: string, unitName?: string) {
    const unit = unitName
      ? configuredPurchaseUnit(state, productUnitId, unitName)
      : getDefaultPurchaseUnit(productUnitId);

    return unit?.conversionMode === "fixed" ? unit.factorToBase ?? 1 : undefined;
  }

  const initialProductUnitId = products[0]?.id ?? "";
  const initialPurchaseUnit = getDefaultPurchaseUnit(initialProductUnitId);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm<PurchaseDraftFormValues>({
    defaultValues: {
      supplierId: suppliers[0]?.id ?? "",
      orderDate: localDateValue(),
      paymentTermDays: 0,
      paymentTermsNote: "",
      expectedDeliveryDate: "",
      createLinkedSalesDraft: false,
      lines: [{
        productUnitId: products[0]?.id ?? "",
        orderedQuantity: 1,
        unitCost: 0,
        taxRate: 0.1,
        unitName: initialPurchaseUnit?.unitName ?? "",
        unitFactor: getDefaultPurchaseUnitFactor(initialProductUnitId, initialPurchaseUnit?.unitName),
        destinationType: "warehouse",
        warehouseId: warehouses[0]?.id ?? "",
        customerId: customers[0]?.id ?? "",
        discountKind: "percentage",
        discountValue: 0
      }]
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watchedLines = watch("lines");
  const createLinkedSalesDraft = watch("createLinkedSalesDraft");
  const directEstimates = (watchedLines ?? [])
    .map((line) => directLineEstimate(state, line))
    .filter((estimate): estimate is NonNullable<typeof estimate> => Boolean(estimate));
  const directEstimateTotals = directEstimates.reduce(
    (totals, estimate) => ({
      salesNet: totals.salesNet + estimate.salesNet,
      purchaseNet: totals.purchaseNet + estimate.purchaseNet,
      expectedProfit: totals.expectedProfit + estimate.expectedProfit
    }),
    { salesNet: 0, purchaseNet: 0, expectedProfit: 0 }
  );
  const disabled = isPending || suppliers.length === 0 || products.length === 0;
  const [documentImage, setDocumentImage] = useState<File | null>(null);
  useEffect(() => {
    if (!editingDraft) return;
    reset({
      supplierId: editingDraft.supplierId,
      orderDate: editingDraft.orderDate,
      paymentTermDays: editingDraft.commercialTerms?.paymentTermDays ?? 0,
      paymentTermsNote: editingDraft.commercialTerms?.paymentTermsNote ?? "",
      expectedDeliveryDate: editingDraft.expectedDeliveryDate ?? "",
      createLinkedSalesDraft: false,
      lines: editingDraft.lines.map((line) => ({
        productUnitId: line.productUnitId,
        orderedQuantity: line.documentUnit?.quantity ?? line.orderedQuantity,
        unitCost: line.documentUnit?.unitAmount ?? line.unitCost,
        taxRate: line.taxRate,
        unitName: line.documentUnit?.unitName ?? getDefaultPurchaseUnit(line.productUnitId)?.unitName ?? "",
        unitFactor: line.documentUnit?.conversionMode === "fixed" ? line.documentUnit.factorToBase : undefined,
        actualBaseQuantity: line.documentUnit?.conversionMode === "variable" ? line.orderedQuantity : undefined,
        destinationType: line.destinationType,
        warehouseId: line.warehouseId ?? warehouses[0]?.id ?? "",
        customerId: line.customerId ?? customers[0]?.id ?? "",
        discountKind: line.discount?.kind ?? "percentage",
        discountValue: line.discount?.value ?? 0
      }))
    });
    setDocumentImage(null);
  }, [editingDraft, reset]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">{editingDraft ? `Sửa đơn mua nháp ${editingDraft.documentNo}` : "Tạo đơn mua nháp"}</h3>
          <p className="panel-note">Chọn rõ nhập kho hay giao thẳng để tránh ghi kho sai.</p>
        </div>
        {editingDraft ? <button className="button button-small" type="button" onClick={() => onSaved?.()}>Tạo đơn mới</button> : null}
      </div>
      <div className="panel-body">
        <InlineSupplierQuickForm createCommand={createCommand} isPending={isPending} />
        <div className="form-divider" />
        <form
          className="command-form"
          noValidate
          onSubmit={handleSubmit((values) => {
            const fields = {
              supplierId: values.supplierId,
              orderDate: values.orderDate,
              paymentTermDays: values.paymentTermDays,
              paymentTermsNote: values.paymentTermsNote,
              expectedDeliveryDate: values.expectedDeliveryDate || undefined,
              lines: values.lines.map((line) => {
                const configuredUnit = configuredPurchaseUnit(state, line.productUnitId, line.unitName);
                const configuredLineUnit = line.unitName || (getDefaultPurchaseUnit(line.productUnitId)?.unitName ?? "");
                return {
                  ...line,
                  discount: line.discountValue > 0 ? { kind: line.discountKind, value: line.discountValue } : undefined,
                  unitName: line.unitName || configuredLineUnit,
                  unitFactor: configuredUnit?.conversionMode === "variable" ? undefined : line.unitFactor,
                  actualBaseQuantity: configuredUnit?.conversionMode === "variable" ? line.actualBaseQuantity : undefined,
                  warehouseId: line.destinationType === "warehouse" ? line.warehouseId : undefined,
                  customerId: line.destinationType === "customer_direct" ? line.customerId : undefined
                };
              })
            };
            const command: CreateCommand = editingDraft
              ? { type: "updatePurchaseOrderDraft", purchaseOrderId: editingDraft.id, expectedVersion: editingDraft.version ?? 1, ...fields }
              : { type: "createPurchaseOrderDraft", createLinkedSalesDraft: values.createLinkedSalesDraft, ...fields };
            createCommand(command, () => {
              onSaved?.();
              reset({
              supplierId: values.supplierId,
              orderDate: values.orderDate,
              paymentTermDays: values.paymentTermDays,
              paymentTermsNote: values.paymentTermsNote,
              expectedDeliveryDate: values.expectedDeliveryDate,
              createLinkedSalesDraft: false,
              lines: [{
                productUnitId: values.lines[0]?.productUnitId ?? products[0]?.id ?? "",
                orderedQuantity: 1,
                unitCost: values.lines[0]?.unitCost ?? 0,
                taxRate: values.lines[0]?.taxRate ?? 0.1,
                unitName: values.lines[0]?.unitName || (getDefaultPurchaseUnit(values.lines[0]?.productUnitId ?? initialProductUnitId)?.unitName ?? ""),
                unitFactor:
                  values.lines[0]?.unitFactor ??
                  getDefaultPurchaseUnitFactor(
                    values.lines[0]?.productUnitId ?? initialProductUnitId,
                    values.lines[0]?.unitName || getDefaultPurchaseUnit(values.lines[0]?.productUnitId ?? initialProductUnitId)?.unitName
                  ),
                actualBaseQuantity: undefined,
                destinationType: values.lines[0]?.destinationType ?? "warehouse",
                warehouseId: values.lines[0]?.warehouseId ?? warehouses[0]?.id ?? "",
                customerId: values.lines[0]?.customerId ?? customers[0]?.id ?? "",
                discountKind: values.lines[0]?.discountKind ?? "percentage",
                discountValue: 0
              }]
              });
              setDocumentImage(null);
            }, editingDraft ? undefined : documentImage ?? undefined);
          })}
        >
          <FormField label="Nhà cung cấp">
            <select className="input" {...register("supplierId", { required: "Chọn nhà cung cấp." })}>
              {suppliers.length === 0 ? <option value="" disabled>Không có nhà cung cấp đủ điều kiện</option> : null}
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} · {supplier.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <div className="form-grid form-grid-4">
            <FormField label="Ngày chứng từ"><input className="input" type="date" max={localDateValue()} {...register("orderDate", { required: "Chọn ngày chứng từ." })} /></FormField>
            <FormField label="Điều khoản (ngày)"><input className="input" type="number" min="0" max="3650" {...register("paymentTermDays", { valueAsNumber: true, min: 0, max: 3650 })} /></FormField>
            <FormField label="Ngày giao dự kiến"><input className="input" type="date" {...register("expectedDeliveryDate")} /></FormField>
            <FormField label="Ghi chú điều khoản"><input className="input" {...register("paymentTermsNote")} /></FormField>
          </div>
          <div className="document-lines">
            {fields.map((field, index) => (
              <fieldset className="document-line" key={field.id}>
                <div className="document-line-header">
                  <legend>Dòng {index + 1}</legend>
                  <button className="button button-small" type="button" disabled={fields.length === 1 || isPending} onClick={() => remove(index)}>
                    <Trash2 aria-hidden="true" />
                    Xóa dòng
                  </button>
                </div>
                <FormField label="Vật tư" error={errors.lines?.[index]?.productUnitId?.message}>
                    <select className="input" {...register(`lines.${index}.productUnitId`, {
                      required: "Chọn vật tư.",
                      onChange: (event) => {
                      const nextProductUnitId = event.target.value;
                      const nextUnit = getDefaultPurchaseUnit(nextProductUnitId);
                      setValue(`lines.${index}.unitName`, nextUnit?.unitName ?? "");
                      setValue(`lines.${index}.unitFactor`, getDefaultPurchaseUnitFactor(nextProductUnitId, nextUnit?.unitName));
                        setValue(`lines.${index}.actualBaseQuantity`, undefined);
                      }
                    })}>
                    {products.length === 0 ? <option value="" disabled>Không có vật tư đang hoạt động</option> : null}
                    {products.map((product) => <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>)}
                  </select>
                </FormField>
                <ProductCatalogPreview state={state} productUnitId={watchedLines?.[index]?.productUnitId ?? ""} />
                <div className="document-line-grid">
                  <FormField label="Đơn vị mua">
                    <select className="input" {...register(`lines.${index}.unitName`, {
                      required: "Chọn đơn vị mua.",
                      onChange: (event) => {
                        const configured = configuredPurchaseUnit(
                          state,
                          watchedLines?.[index]?.productUnitId ?? "",
                         event.target.value
                       );
                        setValue(
                          `lines.${index}.unitFactor`,
                          configured?.conversionMode === "fixed" ? configured.factorToBase ?? 1 : undefined,
                          { shouldValidate: true }
                        );
                        setValue(`lines.${index}.actualBaseQuantity`, undefined);
                      }
                    })}>
                      <option value="" disabled>Chọn đơn vị mua</option>
                      {purchaseDocumentUnitOptions(state, watchedLines?.[index]?.productUnitId ?? "").map((unit) => (
                        <option key={unit} value={unit}>{displayUnitName(unit)}</option>
                      ))}
                    </select>
                  </FormField>
                  {isVariablePurchaseUnit(state, watchedLines?.[index]?.productUnitId ?? "", watchedLines?.[index]?.unitName) ? (
                    <FormField
                      label={`Tổng ${displayUnitName(productBaseUnit(state, watchedLines?.[index]?.productUnitId ?? ""))} thực nhận`}
                      error={errors.lines?.[index]?.actualBaseQuantity?.message}
                    >
                      <input
                        className="input"
                        type="number"
                        min="0.001"
                        step="0.001"
                        {...register(`lines.${index}.actualBaseQuantity`, {
                          valueAsNumber: true,
                          required: "Nhập số lượng thực nhận.",
                          min: { value: 0.001, message: "Số lượng thực nhận phải lớn hơn 0." }
                        })}
                      />
                    </FormField>
                  ) : (
                    <FormField
                      label={`Quy đổi 1 ${displayUnitName(watchedLines?.[index]?.unitName)} về ${displayUnitName(productBaseUnit(state, watchedLines?.[index]?.productUnitId ?? ""))}`}
                      error={errors.lines?.[index]?.unitFactor?.message}
                    >
                      <input
                        className="input"
                        type="number"
                        min="0.001"
                        step="0.001"
                        readOnly
                        title="Hệ số được quản lý tại Danh mục > Cài đặt đơn vị mua."
                        {...register(`lines.${index}.unitFactor`, { valueAsNumber: true, min: { value: 0.001, message: "Hệ số phải lớn hơn 0." } })}
                      />
                    </FormField>
                  )}
                </div>
                <FormField label="Điểm nhận">
                  <select className="input" {...register(`lines.${index}.destinationType`)}>
                    <option value="warehouse">Kho cửa hàng</option>
                    <option value="customer_direct">Giao thẳng khách</option>
                  </select>
                </FormField>
                {watchedLines?.[index]?.destinationType === "customer_direct" ? (
                  <FormField label="Khách nhận">
                    <select className="input" {...register(`lines.${index}.customerId`, { required: "Chọn khách nhận." })}>
                      {customers.length === 0 ? <option value="" disabled>Không có khách nhận đủ điều kiện</option> : null}
                      {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}
                    </select>
                  </FormField>
                ) : (
                  <FormField label="Kho nhận" error={errors.lines?.[index]?.warehouseId?.message}>
                    <select
                      className="input"
                      disabled={isPending || warehouses.length === 0}
                      {...register(`lines.${index}.warehouseId`, { required: "Chọn kho nhận." })}
                    >
                      {warehouses.length === 0 ? <option value="" disabled>Không có kho trong phạm vi được cấp</option> : null}
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
                      ))}
                    </select>
                  </FormField>
                )}
                <div className="document-line-grid">
                  <FormField label={`Số lượng mua (${displayUnitName(watchedLines?.[index]?.unitName)})`} error={errors.lines?.[index]?.orderedQuantity?.message}>
                    <input className="input" type="number" min="0.001" step="0.001" {...register(`lines.${index}.orderedQuantity`, {
                      valueAsNumber: true,
                      min: { value: 0.001, message: "Số lượng mua phải lớn hơn 0." }
                    })} />
                  </FormField>
                  <FormField label={`Giá mua / ${displayUnitName(watchedLines?.[index]?.unitName)}`} error={errors.lines?.[index]?.unitCost?.message}>
                    <input className="input" type="number" min="0" step="1" {...register(`lines.${index}.unitCost`, {
                      valueAsNumber: true,
                      min: { value: 0, message: "Giá mua không được âm." }
                    })} />
                  </FormField>
                  <FormField label="VAT">
                    <select className="input" {...register(`lines.${index}.taxRate`, { valueAsNumber: true })}>
                      <option value="0">0%</option><option value="0.05">5%</option><option value="0.08">8%</option><option value="0.1">10%</option>
                    </select>
                  </FormField>
                  <FormField label="Loại CK"><select className="input" {...register(`lines.${index}.discountKind`)}><option value="percentage">%</option><option value="amount">Số tiền</option></select></FormField>
                  <FormField label="Chiết khấu"><input className="input" type="number" min="0" step="0.01" {...register(`lines.${index}.discountValue`, { valueAsNumber: true, min: 0 })} /></FormField>
                </div>
                <p className="conversion-note">{documentConversionPreview(state, watchedLines?.[index])}</p>
              </fieldset>
            ))}
          </div>
          {!editingDraft && directEstimates.length > 0 ? (
            <div className="direct-sales-card">
              <label className="direct-sales-choice">
                <input type="checkbox" {...register("createLinkedSalesDraft")} />
                <span>
                  <strong>Tạo kèm đơn bán nháp</strong>
                  <small>Giá bán và VAT được lấy lại từ bảng giá hiện hành trên máy chủ.</small>
                </span>
              </label>
              <div className="direct-sales-estimate" aria-live="polite">
                <span>Tiền bán dự kiến <strong>{formatMoney(directEstimateTotals.salesNet)}</strong></span>
                <span>Tiền mua dự kiến <strong>{formatMoney(directEstimateTotals.purchaseNet)}</strong></span>
                <span>Lãi dự kiến <strong>{formatMoney(directEstimateTotals.expectedProfit)}</strong></span>
              </div>
              <p className="panel-note">
                {createLinkedSalesDraft
                  ? "Khi tạo, đơn mua và đơn bán nháp sẽ được liên kết. Chưa ghi kho hoặc công nợ."
                  : "Bật lựa chọn trên nếu muốn theo dõi riêng giá bán, giá mua và lãi chênh lệch."}
                {" "}Số lãi trên chưa gồm VAT, cước và chỉ được chốt sau khi xác nhận giao thẳng.
              </p>
            </div>
          ) : null}
          <button className="button" type="button" disabled={isPending} onClick={() => append({
            productUnitId: products[0]?.id ?? "", orderedQuantity: 1, unitCost: 0, taxRate: 0.1,
            unitName: getDefaultPurchaseUnit(products[0]?.id ?? "")?.unitName ?? "",
            unitFactor: getDefaultPurchaseUnitFactor(products[0]?.id ?? ""),
            actualBaseQuantity: undefined,
            destinationType: "warehouse", warehouseId: warehouses[0]?.id ?? "", customerId: customers[0]?.id ?? "", discountKind: "percentage", discountValue: 0
          })}>
            <PlusCircle aria-hidden="true" />
            Thêm dòng mua
          </button>
          {!editingDraft ? <FormField label="Ảnh chứng từ mua (không bắt buộc)">
            <input
              className="input file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(event) => setDocumentImage(event.target.files?.[0] ?? null)}
            />
            {documentImage ? <p className="panel-note">{documentImage.name} · {(documentImage.size / 1024 / 1024).toFixed(1)} MB</p> : null}
          </FormField> : null}
          <SubmitButton label={editingDraft ? "Lưu đơn mua nháp" : "Tạo đơn mua"} command={editingDraft ? "updatePurchaseOrderDraft" : "createPurchaseOrderDraft"} isPending={isPending} disabled={disabled} />
        </form>
      </div>
    </section>
  );
}


