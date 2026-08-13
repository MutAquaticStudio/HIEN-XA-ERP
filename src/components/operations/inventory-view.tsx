"use client";

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
import { InventoryCountSessionPanel } from "./inventory-count-session-panel";
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


export function InventoryView({
  state,
  runOperation,
  isPending
}: {
  state: OperationsState;
  runOperation: OperationHandler;
  isPending: boolean;
}) {
  const rows = state.warehouses.flatMap((warehouse) => state.productUnits.map((product) => [
    warehouse.name,
    product.productName,
    product.unitName,
    formatQuantity(stockBalance(state, warehouse.id, product.id)),
    state.inventoryMovements.filter((movement) => movement.warehouseId === warehouse.id && movement.productUnitId === product.id).length.toString()
  ]));
  const countAdjustments = state.inventoryMovements
    .filter((movement) => movement.movementType === "adjustment" && movement.sourceDocument.startsWith("KK-"))
    .slice()
    .reverse();
  const activeCountAdjustments = countAdjustments.filter((movement) => !movement.reversedById);
  const shortageCount = activeCountAdjustments.filter((movement) => movement.quantity < 0).length;
  const surplusCount = activeCountAdjustments.filter((movement) => movement.quantity > 0).length;

  return (
    <div className="workbench-grid">
      <div className="side-stack inventory-main-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Tồn kho hiện tại</h3>
            <p className="panel-note">Tồn kho được tính từ phát sinh kho, không sửa trực tiếp.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable headers={["Kho", "Vật tư", "Đơn vị", "Tồn", "Số phát sinh"]} rows={rows} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Phát sinh kho</h3>
            <p className="panel-note">Chỉ ghi thêm, có chứng từ nguồn và mã ghi sổ.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Loại", "Chứng từ", "Kho", "Vật tư", "Số lượng", "Mã ghi sổ", "Hành động"]}
            rows={state.inventoryMovements.map((movement) => [
              statusText(movement.movementType),
              movement.sourceDocument,
              state.warehouses.find((warehouse) => warehouse.id === movement.warehouseId)?.name ?? movement.warehouseId,
              productLabel(state, movement.productUnitId),
              formatQuantity(movement.quantity),
              movement.postingKey,
              movement.reversedById ? (
                <span key="reversed" className="muted">Đã đảo</span>
              ) : movement.movementType !== "opening" && movement.movementType !== "reverse" ? (
                <WorkflowActionButton key="reverse" operation="reverseInventoryMovement" state={state} runOperation={runOperation} isPending={isPending} label="Đảo" targetId={movement.id} />
              ) : movement.movementType === "reverse" ? (
                <span key="reverse-row" className="muted">Dòng đảo</span>
              ) : (
                <span key="opening" className="muted">Tồn đầu kỳ</span>
              )
            ])}
          />
        </div>
      </section>
      <section className="panel stock-count-history">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Lịch sử điều chỉnh kiểm kê cũ</h3>
            <p className="panel-note">Các phiếu KK cũ giữ nguyên để đối chiếu. Phiếu mới được quản lý theo từng đợt kiểm kê.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="stock-count-summary" aria-label="Tóm tắt chênh lệch kiểm kho">
            <div className="stock-count-summary-item">
              <span>Phiếu kiểm kê đang hiệu lực</span>
              <strong>{activeCountAdjustments.length}</strong>
            </div>
            <div className="stock-count-summary-item stock-count-summary-shortage">
              <span>Dòng thiếu theo kiểm kê</span>
              <strong>{shortageCount}</strong>
            </div>
            <div className="stock-count-summary-item stock-count-summary-surplus">
              <span>Dòng thừa theo kiểm kê</span>
              <strong>{surplusCount}</strong>
            </div>
          </div>
          <DataTable
            headers={["Phiếu", "Kho", "Vật tư", "Chênh lệch", "Tồn hiện tại", "Trạng thái", "Thời gian"]}
            rows={countAdjustments.map((movement) => [
              movement.sourceDocument,
              state.warehouses.find((warehouse) => warehouse.id === movement.warehouseId)?.name ?? movement.warehouseId,
              productLabel(state, movement.productUnitId),
              `${movement.quantity > 0 ? "+" : ""}${formatQuantity(movement.quantity)}`,
              formatQuantity(stockBalance(state, movement.warehouseId, movement.productUnitId)),
              movement.reversedById ? (
                <span className="status status-danger" key="reversed">Đã đảo</span>
              ) : movement.quantity < 0 ? (
                <span className="status status-danger" key="shortage">Thiếu</span>
              ) : (
                <span className="status status-core-ready" key="surplus">Thừa</span>
              ),
              formatDateTime(movement.postedAt)
            ])}
            emptyText="Chưa có lịch sử điều chỉnh kiểm kê cũ. Tạo phiếu kiểm kê mới ở biểu mẫu bên phải để bắt đầu."
          />
        </div>
      </section>
      </div>
      <div className="side-stack">
        <InventoryTransferForm state={state} runOperation={runOperation} isPending={isPending} />
        <InventoryCountSessionPanel state={state} runOperation={runOperation} isPending={isPending} />
      </div>
    </div>
  );
}

export function InventoryTransferForm({ state, runOperation, isPending }: { state: OperationsState; runOperation: OperationHandler; isPending: boolean }) {
  const actor = useContext(OperationsActorContext);
  const availableWarehouses = actor.warehouseIds
    ? state.warehouses.filter((warehouse) => actor.warehouseIds?.includes(warehouse.id))
    : state.warehouses;
  const { register, handleSubmit, watch, formState: { errors } } = useForm<{
    sourceWarehouseId: string;
    destinationWarehouseId: string;
    productUnitId: string;
    quantity: number;
    reason: string;
  }>({
    defaultValues: {
      sourceWarehouseId: availableWarehouses[0]?.id ?? "",
      destinationWarehouseId: availableWarehouses[1]?.id ?? availableWarehouses[0]?.id ?? "",
      productUnitId: state.productUnits[0]?.id ?? "",
      quantity: 1,
      reason: "Điều chuyển theo kế hoạch kho"
    }
  });
  const sourceWarehouseId = watch("sourceWarehouseId");
  const productUnitId = watch("productUnitId");
  const available = sourceWarehouseId && productUnitId ? stockBalance(state, sourceWarehouseId, productUnitId) : 0;

  return (
    <section className="panel">
      <div className="panel-header"><div><h3 className="panel-title">Chuyển kho</h3><p className="panel-note">Tồn khả dụng tại kho đi: {formatQuantity(available)}</p></div></div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => runOperation("postInventoryTransfer", undefined, values))}>
          <FormField label="Kho đi">
            <select className="input" {...register("sourceWarehouseId", { required: true })}>{availableWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
          </FormField>
          <FormField label="Kho đến">
            <select className="input" {...register("destinationWarehouseId", { required: true })}>{availableWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
          </FormField>
          <FormField label="Vật tư">
            <select className="input" {...register("productUnitId", { required: true })}>{state.productUnits.map((product) => <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>)}</select>
          </FormField>
          <FormField label="Số lượng" error={errors.quantity?.message}>
            <input className="input" type="number" min="0.001" step="0.001" {...register("quantity", { valueAsNumber: true, min: { value: 0.001, message: "Số lượng phải lớn hơn 0." } })} />
          </FormField>
          <FormField label="Lý do" error={errors.reason?.message}>
            <textarea className="input" rows={2} {...register("reason", { minLength: { value: 5, message: "Lý do phải có ít nhất 5 ký tự." } })} />
          </FormField>
          <SubmitButton label="Ghi chuyển kho" command="postInventoryTransfer" isPending={isPending} disabled={isPending || availableWarehouses.length < 2} />
        </form>
      </div>
    </section>
  );
}

export function InventoryCountForm({ state, runOperation, isPending }: { state: OperationsState; runOperation: OperationHandler; isPending: boolean }) {
  const actor = useContext(OperationsActorContext);
  const availableWarehouses = actor.warehouseIds
    ? state.warehouses.filter((warehouse) => actor.warehouseIds?.includes(warehouse.id))
    : state.warehouses;
  const { register, handleSubmit, watch, formState: { errors } } = useForm<{
    warehouseId: string;
    productUnitId: string;
    countedQuantity: number | undefined;
    reason: string;
  }>({
    defaultValues: {
      warehouseId: availableWarehouses[0]?.id ?? "",
      productUnitId: state.productUnits[0]?.id ?? "",
      countedQuantity: undefined,
      reason: "Điều chỉnh theo biên bản kiểm kê"
    }
  });
  const warehouseId = watch("warehouseId");
  const productUnitId = watch("productUnitId");
  const countedQuantity = watch("countedQuantity");
  const bookQuantity = warehouseId && productUnitId ? stockBalance(state, warehouseId, productUnitId) : 0;
  const difference = Number.isFinite(countedQuantity) ? (countedQuantity ?? 0) - bookQuantity : undefined;
  const differenceMagnitude = difference === undefined ? undefined : Math.abs(difference);
  const differenceTone = difference === undefined || difference === 0 ? "neutral" : difference > 0 ? "surplus" : "shortage";

  return (
    <section className="panel">
      <div className="panel-header"><div><h3 className="panel-title">Kiểm kê kho</h3><p className="panel-note">Tồn sổ hiện tại: {formatQuantity(bookQuantity)}</p></div></div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => runOperation("postInventoryCountAdjustment", undefined, values))}>
          <FormField label="Kho">
            <select className="input" {...register("warehouseId", { required: true })}>{availableWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
          </FormField>
          <FormField label="Vật tư">
            <select className="input" {...register("productUnitId", { required: true })}>{state.productUnits.map((product) => <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>)}</select>
          </FormField>
          <FormField label="Số đếm thực tế" error={errors.countedQuantity?.message}>
            <input className="input" type="number" min="0" step="0.001" {...register("countedQuantity", { valueAsNumber: true, min: { value: 0, message: "Số lượng không được âm." } })} />
          </FormField>
          <div className={`stock-count-preview stock-count-preview-${differenceTone}`} aria-live="polite">
            <span>Chênh lệch dự kiến</span>
            {difference === undefined ? (
              <strong>Nhập số đếm thực tế</strong>
            ) : difference === 0 ? (
              <strong>Không chênh lệch</strong>
            ) : (
              <strong>{difference > 0 ? "Thừa " : "Thiếu "}{formatQuantity(differenceMagnitude ?? 0)}</strong>
            )}
            <p>
              {difference === undefined
                ? "Hệ thống sẽ so sánh với tồn sổ sau khi cô/chú nhập số đếm."
                : difference === 0
                  ? "Không cần ghi điều chỉnh kho."
                  : "Khi xác nhận, hệ thống ghi một phát sinh điều chỉnh có lý do; tồn sổ không bị sửa trực tiếp."}
            </p>
          </div>
          <FormField label="Lý do" error={errors.reason?.message}>
            <textarea className="input" rows={2} {...register("reason", { minLength: { value: 5, message: "Lý do phải có ít nhất 5 ký tự." } })} />
          </FormField>
          <SubmitButton label="Ghi chênh lệch kiểm kê" command="postInventoryCountAdjustment" isPending={isPending} disabled={isPending || difference === undefined || difference === 0} />
        </form>
      </div>
    </section>
  );
}
