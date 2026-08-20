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

export function SalesView({
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
  const order = state.salesOrders[0];
  const totals = salesOrderTotals(order?.lines ?? []);

  return (
    <div className="workbench-grid">
      {order ? <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">{order.documentNo}</h3>
            <p className="panel-note">
              {partyName(state, order.customerId)} · ngày {order.orderDate} · phiên bản {order.version}
            </p>
          </div>
          <StatusBadge value={statusText(order.status)} tone={order.status === "draft" ? "warning" : "success"} />
        </div>
        <div className="panel-body">
          <div className="summary-grid">
            <SummaryItem label="Tổng sau VAT" value={formatMoney(totals.gross)} />
            <SummaryItem label="Trước VAT" value={formatMoney(totals.net)} />
            <SummaryItem label="Đã giao" value={`${order.lines.filter((line) => line.deliveredQuantity >= line.quantity).length}/${order.lines.length} dòng`} />
            <SummaryItem label="Nguồn hàng" value={order.status === "allocated" || order.status.includes("delivered") ? "Đã phân bổ" : "Chưa phân bổ"} />
          </div>
          <DataTable
            headers={["Vật tư", "Số lượng", "Đã giao", "Nguồn", "Thành tiền"]}
            rows={order.lines.map((line) => [
              productLabel(state, line.productUnitId),
              salesLineQuantityText(state, line),
              salesLineQuantityText(state, line, true),
              sourceText(line.sourceType),
              formatMoney(lineTotals(line).gross)
            ])}
          />
          <h4 className="section-heading">Danh sách đơn bán</h4>
          <DataTable
            headers={["Đơn bán", "Khách", "Trạng thái", "Tổng tiền", "Đã giao", "Ảnh", "Hành động"]}
            rows={state.salesOrders.map((salesOrder) => [
              <strong key="document">{salesOrder.documentNo}</strong>,
              partyName(state, salesOrder.customerId),
              <StatusBadge key="status" value={statusText(salesOrder.status)} tone={salesOrder.status === "draft" ? "warning" : "success"} />,
              formatMoney(salesOrderTotals(salesOrder.lines).gross),
              `${salesOrder.lines.filter((line) => line.deliveredQuantity >= line.quantity).length}/${salesOrder.lines.length} dòng`,
              <ApprovalAttachmentPreview key="attachments" attachments={salesOrder.attachments} emptyText="" />,
              salesOrder.status === "draft" ? (
                <WorkflowActionButton key="confirm" operation="confirmSalesOrder" state={state} runOperation={runOperation} isPending={isPending} label="Xác nhận" targetId={salesOrder.id} />
              ) : salesOrder.status === "confirmed" ? (
                <WorkflowActionButton key="allocate" operation="allocateSalesSources" state={state} runOperation={runOperation} isPending={isPending} label="Phân bổ nguồn" targetId={salesOrder.id} />
              ) : (
                <span key="monitor" className="muted">Theo dõi giao</span>
              )
            ])}
          />
        </div>
      </section> : (
        <section className="panel">
          <div className="panel-header"><div><h3 className="panel-title">Đơn bán</h3><p className="panel-note">Chưa có đơn bán.</p></div></div>
          <div className="panel-body"><p className="empty-text">Tạo đơn bán nháp để bắt đầu xử lý.</p></div>
        </section>
      )}
      <div className="side-stack">
        <SalesOrderDraftForm state={state} createCommand={createCommand} isPending={isPending} />
      </div>
    </div>
  );
}


export function SalesOrderDraftForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const customers = getSelectableCustomers(state, actor);
  const products = getSelectableProducts(state);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm<{
    customerId: string;
    lines: Array<{ productUnitId: string; quantity: number; unitPrice: number; taxRate: number; unitName: string; unitFactor: number }>;
  }>({
    defaultValues: {
      customerId: customers[0]?.id ?? "",
      lines: [{
        productUnitId: products[0]?.id ?? "",
        quantity: 1,
        unitPrice: 0,
        taxRate: 0.1,
        unitName: products[0]?.unitName ?? "",
        unitFactor: 1
      }]
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watchedLines = watch("lines");
  const disabled = isPending || customers.length === 0 || products.length === 0;
  const [documentImage, setDocumentImage] = useState<File | null>(null);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Tạo đơn bán nháp</h3>
          <p className="panel-note">Giá và VAT được giữ theo dòng đơn khi xác nhận.</p>
        </div>
      </div>
      <div className="panel-body">
        <form
          className="command-form"
          noValidate
          onSubmit={handleSubmit((values) => {
            createCommand({
              type: "createSalesOrderDraft",
              customerId: values.customerId,
              lines: values.lines
            }, () => {
              reset({
              customerId: values.customerId,
              lines: [{
                productUnitId: values.lines[0]?.productUnitId ?? products[0]?.id ?? "",
                 quantity: 1,
                 unitPrice: values.lines[0]?.unitPrice ?? 0,
                 taxRate: values.lines[0]?.taxRate ?? 0.1,
                 unitName: values.lines[0]?.unitName ?? products.find((product) => product.id === (values.lines[0]?.productUnitId ?? products[0]?.id))?.unitName ?? "",
                 unitFactor: values.lines[0]?.unitFactor ?? 1
              }]
              });
              setDocumentImage(null);
            }, documentImage ?? undefined);
          })}
        >
          <FormField label="Khách hàng">
            <select className="input" {...register("customerId", { required: "Chọn khách hàng." })}>
              {customers.length === 0 ? <option value="" disabled>Không có khách hàng đủ điều kiện</option> : null}
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.displayName}
                </option>
              ))}
            </select>
          </FormField>
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
                     const product = state.productUnits.find((item) => item.id === event.target.value);
                        setValue(`lines.${index}.unitName`, "");
                      setValue(`lines.${index}.unitFactor`, 1);
                    }
                  })}>
                    {products.length === 0 ? <option value="" disabled>Không có vật tư đang hoạt động</option> : null}
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>
                    ))}
                  </select>
                </FormField>
                <ProductCatalogPreview state={state} productUnitId={watchedLines?.[index]?.productUnitId ?? ""} />
                <div className="document-line-grid">
                  <FormField label="Đơn vị bán">
                    <select className="input" {...register(`lines.${index}.unitName`, { required: "Chọn đơn vị bán." })}>
                      {documentUnitOptions(state, watchedLines?.[index]?.productUnitId ?? "").map((unit) => (
                        <option key={unit} value={unit}>{displayUnitName(unit)}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField
                    label={`Quy đổi 1 ${displayUnitName(watchedLines?.[index]?.unitName)} về ${displayUnitName(productBaseUnit(state, watchedLines?.[index]?.productUnitId ?? ""))}`}
                    error={errors.lines?.[index]?.unitFactor?.message}
                  >
                    <input
                      className="input"
                      type="number"
                      min="0.001"
                      step="0.001"
                      disabled={usesProductBaseUnit(state, watchedLines?.[index]?.productUnitId ?? "", watchedLines?.[index]?.unitName)}
                      {...register(`lines.${index}.unitFactor`, { valueAsNumber: true, min: { value: 0.001, message: "Hệ số phải lớn hơn 0." } })}
                    />
                  </FormField>
                </div>
                <div className="document-line-grid">
                  <FormField label={`Số lượng (${displayUnitName(watchedLines?.[index]?.unitName)})`} error={errors.lines?.[index]?.quantity?.message}>
                    <input className="input" type="number" min="0.001" step="0.001" {...register(`lines.${index}.quantity`, {
                      valueAsNumber: true,
                      min: { value: 0.001, message: "Số lượng phải lớn hơn 0." }
                    })} />
                  </FormField>
                  <FormField label={`Đơn giá / ${displayUnitName(watchedLines?.[index]?.unitName)}`} error={errors.lines?.[index]?.unitPrice?.message}>
                    <input className="input" type="number" min="0" step="1" {...register(`lines.${index}.unitPrice`, {
                      valueAsNumber: true,
                      min: { value: 0, message: "Đơn giá không được âm." }
                    })} />
                  </FormField>
                  <FormField label="VAT">
                    <select className="input" {...register(`lines.${index}.taxRate`, { valueAsNumber: true })}>
                      <option value="0">0%</option><option value="0.05">5%</option><option value="0.08">8%</option><option value="0.1">10%</option>
                    </select>
                  </FormField>
                </div>
                <p className="conversion-note">{documentConversionPreview(state, watchedLines?.[index])}</p>
              </fieldset>
            ))}
          </div>
          <button className="button" type="button" disabled={isPending} onClick={() => append({
            productUnitId: products[0]?.id ?? "", quantity: 1, unitPrice: 0, taxRate: 0.1,
            unitName: products[0]?.unitName ?? "", unitFactor: 1
          })}>
            <PlusCircle aria-hidden="true" />
            Thêm dòng vật tư
          </button>
          <FormField label="Ảnh chứng từ bán (không bắt buộc)">
            <input
              className="input file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(event) => setDocumentImage(event.target.files?.[0] ?? null)}
            />
            {documentImage ? <p className="panel-note">{documentImage.name} · {(documentImage.size / 1024 / 1024).toFixed(1)} MB</p> : null}
          </FormField>
          <SubmitButton label="Tạo đơn bán" command="createSalesOrderDraft" isPending={isPending} disabled={disabled} />
        </form>
      </div>
    </section>
  );
}


