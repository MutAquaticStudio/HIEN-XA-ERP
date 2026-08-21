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
  runErpV2CreateCommandAction,
  runErpV2CreateCommandWithImageAction,
  runErpV2OperationAction,
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
  getSelectableEmployees,
  getSelectableProducts,
  lineTotals,
  partyName,
  productLabel,
  salesOrderTotals,
  salesLineTotals,
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
import { salesSourceAllocations } from "@/modules/operations/sales-source-allocations";
import { NegativeStockOverridePanel } from "./negative-stock-override-panel";

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

export function SalesView({ state, runOperation, createCommand, isPending, focusedRecordId }: { state: OperationsState; runOperation: OperationHandler; createCommand: CreateCommandHandler; isPending: boolean; focusedRecordId?: string }) {
  const order = state.salesOrders.find((item) => item.id === focusedRecordId) ?? state.salesOrders[0];
  const [editingDraftId, setEditingDraftId] = useState<string>();
  const editingDraft = state.salesOrders.find((item) => item.id === editingDraftId && item.status === "draft");
  const totals = order ? salesOrderTotals(order.lines, order.deliveryCharge, order.commission) : salesOrderTotals([]);
  const workOrders = order ? state.workOrders.filter((item) => item.salesOrderId === order.id) : [];
  return (
    <div className="phase4-document-workspace">
      {order ? <section className="panel">
        <div className="panel-header"><div><h3 className="panel-title">{order.documentNo}</h3><p className="panel-note">{partyName(state, order.customerId)} · ngày chứng từ {order.orderDate} · tạo thật {order.createdAt ?? "—"} · phiên bản {order.version}</p></div><StatusBadge value={statusText(order.status)} tone={order.status === "draft" ? "warning" : "success"} /></div>
        <div className="panel-body">
          <div className="summary-grid">
            <SummaryItem label="Khách phải trả" value={formatMoney(totals.customerGross)} />
            <SummaryItem label="Chiết khấu" value={formatMoney(totals.discount)} />
            <SummaryItem label="CTV nội bộ" value={formatMoney(totals.commission)} />
            <SummaryItem label="Cấp nguồn hàng" value={order.lines.every((line) => salesSourceAllocations(line).length > 0) ? "Đã cấp theo từng allocation" : "Chưa cấp nguồn"} />
            <SummaryItem label="Phân việc hiện trường" value={workOrders.length > 0 ? `${workOrders.length} phiếu việc · ${workOrders.map((item) => statusText(item.status)).join(", ")}` : "Chờ xác nhận đơn"} />
          </div>
          <DataTable headers={["Vật tư", "Số lượng", "Đã giao", "Nguồn hàng", "Thành tiền"]} rows={order.lines.map((line) => [productLabel(state, line.productUnitId), salesLineQuantityText(state, line), salesLineQuantityText(state, line, true), salesSourceAllocations(line).length ? salesSourceAllocations(line).map((allocation) => `${sourceText(allocation.sourceType)} · ${formatQuantity(allocation.allocatedQuantity)}`).join("; ") : "Chưa cấp", formatMoney(lineTotals(line).gross)])} />
          <p className="panel-note">Cấp nguồn hàng quyết định kho/nhà cung cấp theo từng dòng. Phân việc hiện trường dùng Work Order hiện có sau khi xác nhận, không tạo một hệ công việc thứ hai.</p>
          <h4 className="section-heading">Danh sách đơn bán</h4>
          <DataTable headers={["Đơn bán", "Khách", "Ngày chứng từ", "Trạng thái", "Khách phải trả", "Hành động"]} rows={state.salesOrders.map((salesOrder) => [
            <Link key="document" href={`/sales/orders/${salesOrder.id}`}><strong>{salesOrder.documentNo}</strong></Link>, partyName(state, salesOrder.customerId), salesOrder.orderDate,
            <StatusBadge key="status" value={statusText(salesOrder.status)} tone={salesOrder.status === "draft" ? "warning" : "success"} />,
            formatMoney(salesOrderTotals(salesOrder.lines, salesOrder.deliveryCharge, salesOrder.commission).customerGross),
            salesOrder.status === "draft" ? <div key="draft-actions" className="table-actions"><button className="button button-small" type="button" disabled={isPending} onClick={() => setEditingDraftId(salesOrder.id)}>Sửa nháp</button><WorkflowActionButton operation="confirmSalesOrder" state={state} runOperation={runOperation} isPending={isPending} label="Xác nhận" targetId={salesOrder.id} /></div> : salesOrder.status === "confirmed" ? <WorkflowActionButton key="allocate" operation="allocateSalesSources" state={state} runOperation={runOperation} isPending={isPending} label="Cấp nguồn" targetId={salesOrder.id} /> : <span key="monitor" className="muted">Theo dõi giao</span>
          ])} />
        </div>
      </section> : <section className="panel"><div className="panel-header"><div><h3 className="panel-title">Đơn bán</h3><p className="panel-note">Chưa có đơn bán.</p></div></div><div className="panel-body"><p className="empty-text">Tạo đơn bán nháp để bắt đầu xử lý.</p></div></section>}
      <NegativeStockOverridePanel state={state} runOperation={runOperation} isPending={isPending} />
      <SalesOrderDraftForm state={state} createCommand={createCommand} isPending={isPending} editingDraft={editingDraft} onSaved={() => setEditingDraftId(undefined)} />
    </div>
  );
}

type SalesDraftFormValues = {
  customerId: string;
  orderDate: string;
  paymentTermDays: number;
  paymentTermsNote: string;
  promisedDeliveryDate: string;
  paymentMethod: "transfer" | "credit_requested";
  referrerEmployeeId: string;
  deliveryAddress: string;
  customerNote: string;
  commissionKind: "percentage" | "amount";
  commissionValue: number;
  lines: Array<{ productUnitId: string; quantity: number; unitPrice: number; taxRate: number; unitName: string; unitFactor: number; discountKind: "percentage" | "amount"; discountValue: number }>;
};

export function SalesOrderDraftForm({ state, createCommand, isPending, editingDraft, onSaved }: { state: OperationsState; createCommand: CreateCommandHandler; isPending: boolean; editingDraft?: OperationsState["salesOrders"][number]; onSaved?: () => void }) {
  const actor = useContext(OperationsActorContext);
  const customers = getSelectableCustomers(state, actor);
  const products = getSelectableProducts(state);
  const referrers = getSelectableEmployees(state, actor, "sales");
  const today = localDateValue();
  const initialProduct = products[0];
  const { control, register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<SalesDraftFormValues>({ defaultValues: {
    customerId: customers[0]?.id ?? "", orderDate: today, paymentTermDays: 0, paymentTermsNote: "", promisedDeliveryDate: "", paymentMethod: "transfer", referrerEmployeeId: "", deliveryAddress: "", customerNote: "", commissionKind: "percentage", commissionValue: 0,
    lines: [{ productUnitId: initialProduct?.id ?? "", quantity: 1, unitPrice: initialProduct?.salePrice ?? 0, taxRate: initialProduct?.saleTaxRate ?? 0.1, unitName: initialProduct?.unitName ?? "", unitFactor: 1, discountKind: "percentage", discountValue: 0 }]
  }});
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watchedLines = watch("lines");
  const watchedCommissionValue = watch("commissionValue");
  const watchedCommissionKind = watch("commissionKind");
  const previewLines = watchedLines.map((line, index) => {
    const factor = usesProductBaseUnit(state, line.productUnitId, line.unitName) ? 1 : Number(line.unitFactor || 1);
    const quantity = Number(line.quantity || 0) * factor;
    const unitPrice = Number(line.unitPrice || 0) / factor;
    const baseAmount = quantity * unitPrice;
    const discountValue = Number(line.discountValue || 0);
    const discountAmount = line.discountKind === "percentage" ? baseAmount * discountValue / 100 : discountValue;
    const discount = discountValue > 0 ? { kind: line.discountKind, value: discountValue, amount: discountAmount, baseAmount } : undefined;
    return { id: `preview-${index}`, productUnitId: line.productUnitId, quantity, deliveredQuantity: 0, unitPrice, taxRate: Number(line.taxRate || 0), discount };
  });
  const discountedNet = previewLines.reduce((sum, line) => sum + line.quantity * line.unitPrice - (line.discount?.amount ?? 0), 0);
  const commissionAmount = watchedCommissionKind === "percentage" ? discountedNet * Number(watchedCommissionValue || 0) / 100 : Number(watchedCommissionValue || 0);
  const previewTotals = salesOrderTotals(previewLines, undefined, commissionAmount > 0 ? { kind: watchedCommissionKind, value: Number(watchedCommissionValue || 0), amount: commissionAmount, baseAmount: discountedNet } : undefined);
  const disabled = isPending || customers.length === 0 || products.length === 0;
  const [documentImage, setDocumentImage] = useState<File | null>(null);
  useEffect(() => {
    if (!editingDraft) return;
    reset({
      customerId: editingDraft.customerId,
      orderDate: editingDraft.orderDate,
      paymentTermDays: editingDraft.commercialTerms?.paymentTermDays ?? 0,
      paymentTermsNote: editingDraft.commercialTerms?.paymentTermsNote ?? "",
      promisedDeliveryDate: editingDraft.promisedDeliveryDate ?? "",
      paymentMethod: editingDraft.paymentMethod ?? "transfer",
      referrerEmployeeId: editingDraft.referrerEmployeeId ?? "",
      deliveryAddress: editingDraft.deliveryAddress ?? "",
      customerNote: editingDraft.customerNote ?? "",
      commissionKind: editingDraft.commission?.kind ?? "percentage",
      commissionValue: editingDraft.commission?.value ?? 0,
      lines: editingDraft.lines.map((line) => ({
        productUnitId: line.productUnitId,
        quantity: line.documentUnit?.quantity ?? line.quantity,
        unitPrice: line.documentUnit?.unitAmount ?? line.unitPrice,
        taxRate: line.taxRate,
        unitName: line.documentUnit?.unitName ?? productBaseUnit(state, line.productUnitId),
        unitFactor: line.documentUnit?.factorToBase ?? 1,
        discountKind: line.discount?.kind ?? "percentage",
        discountValue: line.discount?.value ?? 0
      }))
    });
    setDocumentImage(null);
  }, [editingDraft, reset]);
  return <section className="panel phase4-sales-editor">
    <div className="panel-header"><div><h3 className="panel-title">{editingDraft ? `Sửa đơn bán nháp ${editingDraft.documentNo}` : "Tạo đơn bán nháp"}</h3><p className="panel-note">Ngày chứng từ có thể lùi về ngày đã qua; thời gian tạo thật vẫn do máy chủ ghi nhận.</p></div>{editingDraft ? <button className="button button-small" type="button" onClick={() => onSaved?.()}>Tạo đơn mới</button> : null}</div>
    <div className="panel-body"><form className="command-form" noValidate onSubmit={handleSubmit((values) => {
      const fields = { customerId: values.customerId, orderDate: values.orderDate, deliveryAddress: values.deliveryAddress, customerNote: values.customerNote, paymentMethod: values.paymentMethod, referrerEmployeeId: values.referrerEmployeeId || undefined, commission: values.commissionValue > 0 ? { kind: values.commissionKind, value: values.commissionValue } : undefined, paymentTermDays: values.paymentTermDays, paymentTermsNote: values.paymentTermsNote, promisedDeliveryDate: values.promisedDeliveryDate || undefined, lines: values.lines.map((line) => ({ productUnitId: line.productUnitId, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate, unitName: line.unitName, unitFactor: line.unitFactor, discount: line.discountValue > 0 ? { kind: line.discountKind, value: line.discountValue } : undefined })) };
      const command: CreateCommand = editingDraft ? { type: "updateSalesOrderDraft", salesOrderId: editingDraft.id, expectedVersion: editingDraft.version, ...fields } : { type: "createSalesOrderDraft", ...fields };
      createCommand(command, () => { onSaved?.(); reset({ ...values, orderDate: values.orderDate, lines: [{ ...values.lines[0], quantity: 1, discountValue: 0 }] }); setDocumentImage(null); }, editingDraft ? undefined : documentImage ?? undefined);
    })}>
      <div className="form-grid form-grid-4">
        <FormField label="Khách hàng"><select className="input" {...register("customerId", { required: "Chọn khách hàng." })}>{customers.length === 0 ? <option value="" disabled>Không có khách hàng đủ điều kiện</option> : null}{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} · {customer.displayName}</option>)}</select></FormField>
        <FormField label="Ngày chứng từ" error={errors.orderDate?.message}><input className="input" type="date" max={today} {...register("orderDate", { required: "Chọn ngày chứng từ." })} /></FormField>
        <FormField label="Điều khoản (ngày)"><input className="input" type="number" min="0" max="3650" {...register("paymentTermDays", { valueAsNumber: true, min: 0, max: 3650 })} /></FormField>
        <FormField label="Ngày giao cam kết"><input className="input" type="date" {...register("promisedDeliveryDate")} /></FormField>
        <FormField label="CTV / người giới thiệu"><select className="input" {...register("referrerEmployeeId")}><option value="">Không chọn</option>{referrers.map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}</select></FormField>
        <FormField label="Phương thức thanh toán"><select className="input" {...register("paymentMethod")}><option value="transfer">Chuyển khoản</option><option value="credit_requested">Ghi nợ theo hạn mức</option></select></FormField>
        <FormField label="Địa chỉ giao hàng"><input className="input" {...register("deliveryAddress")} placeholder="Địa chỉ công trình / người nhận" /></FormField>
        <FormField label="Ghi chú"><input className="input" {...register("customerNote")} placeholder="Ghi chú nội bộ / giao nhận" /></FormField>
      </div>
      <FormField label="Ghi chú điều khoản"><textarea className="input textarea" {...register("paymentTermsNote")} /></FormField>
      <div className="document-lines">
        {fields.map((field, index) => <fieldset className="document-line phase4-line-card" key={field.id}>
          <div className="document-line-header"><legend>Dòng {index + 1}</legend><button className="button button-small" type="button" disabled={fields.length === 1 || isPending} onClick={() => remove(index)}><Trash2 aria-hidden="true" /> Xóa dòng</button></div>
          <div className="document-line-grid phase4-sales-line-grid">
            <FormField label="Vật tư" error={errors.lines?.[index]?.productUnitId?.message}><select className="input" {...register(`lines.${index}.productUnitId`, { required: "Chọn vật tư.", onChange: (event) => { const product = state.productUnits.find((item) => item.id === event.target.value); setValue(`lines.${index}.unitName`, product?.unitName ?? ""); setValue(`lines.${index}.unitPrice`, product?.salePrice ?? 0); setValue(`lines.${index}.taxRate`, product?.saleTaxRate ?? 0.1); setValue(`lines.${index}.unitFactor`, 1); } })}>{products.map((product) => <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>)}</select></FormField>
            <FormField label="ĐVT"><select className="input" {...register(`lines.${index}.unitName`, { required: "Chọn đơn vị." })}>{documentUnitOptions(state, watchedLines?.[index]?.productUnitId ?? "").map((unit) => <option key={unit} value={unit}>{displayUnitName(unit)}</option>)}</select></FormField>
            <FormField label="Số lượng" error={errors.lines?.[index]?.quantity?.message}><input className="input" type="number" min="0.001" step="0.001" {...register(`lines.${index}.quantity`, { valueAsNumber: true, min: { value: 0.001, message: "Số lượng phải lớn hơn 0." } })} /></FormField>
            <FormField label="Đơn giá" error={errors.lines?.[index]?.unitPrice?.message}><input className="input" type="number" min="0" step="1" {...register(`lines.${index}.unitPrice`, { valueAsNumber: true, min: { value: 0, message: "Đơn giá không được âm." } })} /></FormField>
            <FormField label="Loại CK"><select className="input" {...register(`lines.${index}.discountKind`)}><option value="percentage">%</option><option value="amount">Số tiền</option></select></FormField>
            <FormField label="Chiết khấu"><input className="input" type="number" min="0" step="0.01" {...register(`lines.${index}.discountValue`, { valueAsNumber: true, min: 0 })} /></FormField>
            <FormField label="VAT"><select className="input" {...register(`lines.${index}.taxRate`, { valueAsNumber: true })}><option value="0">0%</option><option value="0.05">5%</option><option value="0.08">8%</option><option value="0.1">10%</option></select></FormField>
            <div className="phase4-line-total"><span>Thành tiền</span><strong>{formatMoney(salesLineTotals(previewLines[index] ?? { quantity: 0, unitPrice: 0, taxRate: 0, discount: undefined }).gross)}</strong></div>
          </div>
          {!usesProductBaseUnit(state, watchedLines?.[index]?.productUnitId ?? "", watchedLines?.[index]?.unitName) ? <FormField label="Hệ số quy đổi (đã cấu hình)"><input className="input" type="number" readOnly {...register(`lines.${index}.unitFactor`, { valueAsNumber: true, min: 0.001 })} /></FormField> : null}
          <ProductCatalogPreview state={state} productUnitId={watchedLines?.[index]?.productUnitId ?? ""} />
          <p className="conversion-note">{documentConversionPreview(state, watchedLines?.[index])}</p>
        </fieldset>)}
      </div>
      <button className="button" type="button" disabled={isPending} onClick={() => append({ productUnitId: products[0]?.id ?? "", quantity: 1, unitPrice: products[0]?.salePrice ?? 0, taxRate: products[0]?.saleTaxRate ?? 0.1, unitName: products[0]?.unitName ?? "", unitFactor: 1, discountKind: "percentage", discountValue: 0 })}><PlusCircle aria-hidden="true" /> Thêm dòng vật tư</button>
      <div className="form-grid phase4-commercial-summary"><SummaryItem label="Trước VAT" value={formatMoney(previewTotals.net)} /><SummaryItem label="VAT" value={formatMoney(previewTotals.tax)} /><SummaryItem label="Khách phải trả" value={formatMoney(previewTotals.customerGross)} /><SummaryItem label="Chi phí CTV nội bộ" value={formatMoney(previewTotals.commission)} /></div>
      {!editingDraft ? <FormField label="Ảnh chứng từ bán (không bắt buộc)"><input className="input file-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setDocumentImage(event.target.files?.[0] ?? null)} />{documentImage ? <p className="panel-note">{documentImage.name} · {(documentImage.size / 1024 / 1024).toFixed(1)} MB</p> : null}</FormField> : null}
      <SubmitButton label={editingDraft ? "Lưu đơn bán nháp" : "Tạo đơn bán nháp"} command={editingDraft ? "updateSalesOrderDraft" : "createSalesOrderDraft"} isPending={isPending} disabled={disabled} />
    </form></div>
  </section>;
}


