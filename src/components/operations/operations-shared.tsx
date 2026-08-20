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
import { DataTable as V2DataTable, EmptyState as V2EmptyState, Panel as V2Panel, StatusBadge as V2StatusBadge } from '@/components/ui/primitives';

export function FormField({
  label,
  error,
  children
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function ProductCatalogPreview({ state, productUnitId }: { state: OperationsState; productUnitId: string }) {
  const product = state.productUnits.find((item) => item.id === productUnitId);
  if (!product) {
    return null;
  }

  return (
    <dl className="reference-grid">
      <div className="reference-item">
        <dt>Mã vật tư</dt>
        <dd>{product.productCode}</dd>
      </div>
      <div className="reference-item">
        <dt>Tên vật tư</dt>
        <dd>{product.productName}</dd>
      </div>
      <div className="reference-item">
        <dt>Đơn vị tồn kho</dt>
        <dd>{displayUnitName(product.unitName)}</dd>
      </div>
      <div className="reference-item">
        <dt>Tồn kho</dt>
        <dd>{formatQuantity(stockBalance(state, "wh-main", product.id))} {displayUnitName(product.unitName)}</dd>
      </div>
    </dl>
  );
}

export function SubmitButton({
  label,
  command,
  isPending,
  disabled = isPending
}: {
  label: string;
  command: DomainCommandName;
  isPending: boolean;
  disabled?: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const permission = operationsErpRegistry.commandByName.get(command)?.permission;
  const authorized = !permission || actor.permissions.includes(permission);
  return (
    <button
      className="button button-primary command-submit"
      type="submit"
      disabled={disabled || !authorized}
      title={authorized ? undefined : `${actor.displayName} không có quyền ${permission}.`}
    >
      <PlusCircle aria-hidden="true" />
      {isPending ? "Đang lưu..." : label}
    </button>
  );
}

export function WorkflowActionButton({
  operation,
  state,
  runOperation,
  isPending,
  label,
  targetId
}: {
  operation: OperationName;
  state: OperationsState;
  runOperation: OperationHandler;
  isPending: boolean;
  label?: string;
  targetId?: string;
}) {
  const actor = useContext(OperationsActorContext);
  const readiness = canRunOperation(state, operation, targetId, actor);
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [quantity, setQuantity] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [evidence, setEvidence] = useState("");
  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [lineQuantities, setLineQuantities] = useState<Record<string, string>>({});
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [accuracyMeters, setAccuracyMeters] = useState("");
  const [locationSource, setLocationSource] = useState<"gps" | "manual">("gps");
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const needsReason = [
    "reverseInventoryMovement",
    "reverseDirectDelivery",
    "failDelivery",
    "reverseCustomerPayment",
    "reverseSupplierPayment",
    "reverseCashVoucher",
    "reverseEmployeePayment",
    "reverseEmployeeAdvance",
    "rejectGoodsReceipt",
    "rejectDeliveryCompletion",
    "requestDeliveryQuantityChange"
  ].includes(operation);
  const needsQuantity = operation === "postGoodsReceipt" || operation === "submitGoodsReceipt" || operation === "confirmDirectDelivery";
  const needsReceiptImage = operation === "submitGoodsReceipt";
  const needsDeliveryConfirmation = operation === "completeDelivery" || operation === "submitDeliveryCompletion";
  const needsDeliveryQuantityProposal = operation === "requestDeliveryQuantityChange";
  const deliveryQuantityInputMode = deliveryLineQuantityInputMode(actor.role, operation);
  const needsDeliveryLineQuantities = needsDeliveryQuantityProposal || (needsDeliveryConfirmation && deliveryQuantityInputMode !== "server_derived");
  const needsDeliveryImage = operation === "submitDeliveryCompletion";
  const needsPaymentAllocation = operation === "allocateCustomerPayment" || operation === "allocateSupplierPayment";
  const needsLocation = operation === "recordWorkOrderLocation";
  const needsDetails = needsReason || needsQuantity || needsReceiptImage || needsDeliveryImage || needsDeliveryConfirmation || needsDeliveryLineQuantities || needsPaymentAllocation || needsLocation;
  const deliveryJob = targetId ? state.deliveryJobs.find((job) => job.id === targetId) : undefined;
  const deliveryOrder = deliveryJob ? state.salesOrders.find((order) => order.id === deliveryJob.salesOrderId) : undefined;
  const openDeliveryLines = deliveryOrder?.lines.filter(
    (line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity
  ) ?? [];
  const targetPurchase = targetId && needsQuantity ? findPurchaseLineForUi(state, targetId) : undefined;
  const allocationPayment = operation === "allocateCustomerPayment"
    ? state.customerPayments.find((payment) => payment.id === targetId)
    : operation === "allocateSupplierPayment"
      ? state.supplierPayments.find((payment) => payment.id === targetId)
      : undefined;
  const openPaymentObligations = operation === "allocateCustomerPayment" && allocationPayment && "customerId" in allocationPayment
    ? getOpenCustomerDebtObligations(state, allocationPayment.customerId)
    : operation === "allocateSupplierPayment" && allocationPayment && "supplierId" in allocationPayment
      ? getOpenSupplierDebtObligations(state, allocationPayment.supplierId)
      : [];
  const allocationAvailable = allocationPayment ? paymentUnallocatedAmount(allocationPayment) : 0;
  const targetWorkOrder = targetId ? state.workOrders.find((order) => order.id === targetId) : undefined;

  function openDetails() {
    if (needsQuantity && !quantity && targetId) {
      const purchase = findPurchaseLineForUi(state, targetId);
      if (purchase) {
        setQuantity(String((purchase.line.orderedQuantity - purchase.line.receivedQuantity) / lineDocumentFactor(purchase.line)));
      }
    }
    if (needsLocation && !latitude && !longitude) {
      setLatitude("");
      setLongitude("");
      setAccuracyMeters("");
      setLocationSource("gps");
    }
    if (needsDeliveryLineQuantities && Object.keys(lineQuantities).length === 0) {
      setLineQuantities(Object.fromEntries(openDeliveryLines.map((line) => [line.id, String((line.quantity - line.deliveredQuantity) / lineDocumentFactor(line))])));
    }
    if (needsPaymentAllocation && Object.keys(allocationAmounts).length === 0) {
      setAllocationAmounts(defaultAllocationAmounts(openPaymentObligations, allocationAvailable));
    }
    setExpanded(true);
  }

  function submitDetails() {
    const options: OperationOptions = {};
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const parsedAccuracy = accuracyMeters.trim() === "" ? undefined : Number(accuracyMeters);
    if (needsReason) {
      options.reason = reason;
    }
    if (needsQuantity) {
      options.quantity = Number(quantity) * (targetPurchase ? lineDocumentFactor(targetPurchase.line) : 1);
    }
    if (needsDeliveryLineQuantities) {
      options.recipientName = recipientName;
      options.evidence = evidence;
      options.lineQuantities = Object.fromEntries(
        Object.entries(lineQuantities)
          .map(([lineId, value]) => {
            const line = openDeliveryLines.find((candidate) => candidate.id === lineId);
            return [lineId, Number(value) * (line ? lineDocumentFactor(line) : 1)];
          })
          .filter(([, value]) => Number(value) > 0)
      );
    }
    if (needsPaymentAllocation) {
      options.allocations = Object.entries(allocationAmounts)
        .map(([ledgerEntryId, amount]) => ({ ledgerEntryId, amount: Number(amount) }))
        .filter((allocation) => allocation.amount > 0);
    }
    if (needsLocation) {
      if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
        return;
      }
        options.location = {
          latitude: parsedLatitude,
          longitude: parsedLongitude,
          source: locationSource,
          recordedAt: new Date().toISOString(),
          accuracyMeters: parsedAccuracy === undefined || !Number.isFinite(parsedAccuracy) ? undefined : parsedAccuracy
        };
    }
    runOperation(operation, targetId, options, () => setExpanded(false), receiptImage ?? undefined);
  }

  function readCurrentLocation() {
    if (!navigator.geolocation) {
      setAccuracyMeters("0");
      return;
    }
    setIsFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(String(position.coords.latitude));
        setLongitude(String(position.coords.longitude));
        setAccuracyMeters(position.coords.accuracy >= 0 ? String(position.coords.accuracy) : "");
        setLocationSource("gps");
        setIsFetchingLocation(false);
      },
      () => {
        setIsFetchingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  return (
    <div className="workflow-action">
      <button
        className="button button-small table-action"
        type="button"
        disabled={!readiness.canRun || isPending}
        title={readiness.canRun ? operationDescriptions[operation] : readiness.reason}
        aria-expanded={needsDetails ? expanded : undefined}
        onClick={() => needsDetails ? openDetails() : runOperation(
          operation,
          targetId,
          operation === "claimOpenSalesWorkOrder" ? { expectedVersion: targetWorkOrder?.version ?? 1 } : undefined
        )}
      >
        {label ?? operationLabels[operation]}
      </button>
      {expanded ? (
        <div className="inline-action-form">
          {needsReason ? (
            <FormField label="Lý do bắt buộc">
              <textarea className="input" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
            </FormField>
          ) : null}
          {needsQuantity ? (
            <>
              <FormField label={`Số lượng thực tế (${displayUnitName(targetPurchase ? lineDocumentUnitName(state, targetPurchase.line) : undefined)})`}>
                <input className="input" type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </FormField>
              {targetPurchase && lineDocumentFactor(targetPurchase.line) !== 1 ? (
                <p className="conversion-note">Hệ thống sẽ ghi {formatQuantity(Number(quantity || 0) * lineDocumentFactor(targetPurchase.line))} {displayUnitName(productBaseUnit(state, targetPurchase.line.productUnitId))} vào sổ.</p>
              ) : null}
            </>
          ) : null}
          {needsReceiptImage ? (
            <FormField label="Ảnh thực nhận bắt buộc">
              <input
                className="input file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(event) => setReceiptImage(event.target.files?.[0] ?? null)}
              />
              <p className="conversion-note">Chụp rõ hàng, xe hoặc phiếu cân để Chủ cửa hàng/Kế toán kiểm tra trước khi duyệt.</p>
              {receiptImage ? <p className="muted">Đã chọn: {receiptImage.name}</p> : null}
            </FormField>
          ) : null}
          {needsDeliveryConfirmation ? (
            <>
              {needsDeliveryImage ? (
                <FormField label="Ảnh xác nhận đã giao bắt buộc">
                  <input
                    className="input file-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={(event) => setReceiptImage(event.target.files?.[0] ?? null)}
                  />
                  <p className="conversion-note">Chụp rõ hàng đã giao tại điểm nhận. Ảnh được gửi riêng cho Chủ cửa hàng/Kế toán duyệt.</p>
                  {receiptImage ? <p className="muted">Đã chọn: {receiptImage.name}</p> : null}
                </FormField>
              ) : null}
              <FormField label="Người nhận">
                <input className="input" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
              </FormField>
              <FormField label="Bằng chứng giao nhận">
                <input className="input" placeholder="Số phiếu, ảnh hoặc chữ ký" value={evidence} onChange={(event) => setEvidence(event.target.value)} />
              </FormField>
              {deliveryQuantityInputMode === "server_derived" ? <p className="conversion-note">Số lượng giao sẽ lấy từ đơn đã duyệt. Bạn không thể sửa số lượng tại đây.</p> : null}
            </>
          ) : null}
          {needsDeliveryLineQuantities ? (
            <>
              {needsDeliveryQuantityProposal ? <p className="conversion-note">Đây là đề nghị chênh lệch, chưa thay đổi số lượng giao. Chủ cửa hàng/Kế toán phải duyệt trước khi ghi nhận.</p> : null}
              {openDeliveryLines.map((line) => (
                <FormField key={line.id} label={`${productLabel(state, line.productUnitId)} · số lượng đề nghị (${displayUnitName(lineDocumentUnitName(state, line))})`}>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max={(line.quantity - line.deliveredQuantity) / lineDocumentFactor(line)}
                    step="0.001"
                    value={lineQuantities[line.id] ?? ""}
                    onChange={(event) => setLineQuantities((current) => ({ ...current, [line.id]: event.target.value }))}
                  />
                </FormField>
              ))}
            </>
          ) : null}
          {needsLocation ? (
            <>
              <div className="inline-location-actions">
                <button
                  className="button button-small"
                  type="button"
                  disabled={isPending || isFetchingLocation}
                  onClick={readCurrentLocation}
                >
                  {isFetchingLocation ? "Đang lay vi tri..." : "Lay vi tri hien tai"}
                </button>
              </div>
              <FormField label="Nguon vi tri">
                <select
                  className="input"
                  value={locationSource}
                  onChange={(event) => setLocationSource(event.target.value as "gps" | "manual")}
                >
                  <option value="gps">GPS</option>
                  <option value="manual">Nhập tay</option>
                </select>
              </FormField>
              <FormField label="Vi do">
                <input
                  className="input"
                  type="number"
                  step="0.000001"
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                />
              </FormField>
              <FormField label="Kinh do">
                <input
                  className="input"
                  type="number"
                  step="0.000001"
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                />
              </FormField>
              <FormField label="Độ chính xác (m), không bắt buộc">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={accuracyMeters}
                  onChange={(event) => setAccuracyMeters(event.target.value)}
                />
              </FormField>
            </>
          ) : null}
          {needsPaymentAllocation ? (
            <>
              <p className="allocation-summary">
                Có thể phân bổ {formatMoney(allocationAvailable)}. Kiểm tra số tiền từng chứng từ trước khi xác nhận.
              </p>
              <div className="allocation-list">
                {openPaymentObligations.map((obligation) => (
                  <div className="allocation-row" key={obligation.ledgerEntryId}>
                    <div>
                      <strong>{obligation.sourceDocument}</strong>
                      <span>{formatDateTime(obligation.postingDate)} · còn {formatMoney(obligation.openAmount)}</span>
                    </div>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max={obligation.openAmount}
                      step="1"
                      aria-label={`Phân bổ vào ${obligation.sourceDocument}`}
                      value={allocationAmounts[obligation.ledgerEntryId] ?? ""}
                      onChange={(event) => setAllocationAmounts((current) => ({ ...current, [obligation.ledgerEntryId]: event.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <div className="table-actions">
            <button
              className="button button-small button-primary"
              type="button"
                  disabled={isPending || ((needsReceiptImage || needsDeliveryImage) && !receiptImage) || (needsLocation && (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))))}
              onClick={submitDetails}
            >
              {needsDeliveryImage ? "Xác nhận đã giao và gửi duyệt" : "Xác nhận"}
            </button>
            <button className="button button-small" type="button" disabled={isPending} onClick={() => setExpanded(false)}>Hủy</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ApprovalAttachmentPreview({
  attachments,
  emptyText = "Thiếu ảnh"
}: {
  attachments?: OperationsAttachment[];
  emptyText?: string;
}) {
  if (!attachments || attachments.length === 0) {
    return emptyText ? <span className="muted">{emptyText}</span> : null;
  }
  return (
    <div className="approval-attachments" aria-label="Ảnh đính kèm phiếu nhập">
      {attachments.map((attachment) => (
        <a key={attachment.id} href={`/api/operations/attachments/${attachment.id}`} target="_blank" rel="noreferrer" title={`Mở ${attachment.fileName}`}>
          <img src={`/api/operations/attachments/${attachment.id}`} alt={`Ảnh ${attachment.fileName}`} loading="lazy" />
        </a>
      ))}
    </div>
  );
}

export function OperationRow({
  operation,
  state,
  index,
  onRun,
  isPending
}: {
  operation: OperationName;
  state: OperationsState;
  index: number;
  onRun: OperationHandler;
  isPending: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const readiness = canRunOperation(state, operation, undefined, actor);
  const completed = state.processedOperations.some((item) => item.operation === operation) && !readiness.canRun;
  const requiresDocumentInput = [
    "submitGoodsReceipt",
    "postGoodsReceipt",
    "postInventoryTransfer",
    "postInventoryCountAdjustment",
    "reverseInventoryMovement",
    "confirmDirectDelivery",
    "reverseDirectDelivery",
    "completeDelivery",
    "failDelivery",
    "allocateCustomerPayment",
    "allocateSupplierPayment",
    "reverseCustomerPayment",
    "reverseSupplierPayment",
    "reverseCashVoucher",
    "reverseEmployeePayment",
    "confirmEmployeeAdvance",
    "submitDeliveryCompletion",
    "reverseEmployeeAdvance"
  ].includes(operation);

  return (
    <div className={completed ? "timeline-item timeline-item-done" : "timeline-item"}>
      <div className="timeline-index">{completed ? <CheckCircle2 aria-hidden="true" /> : index}</div>
      <div className="timeline-content">
        <p className="timeline-title">{operationLabels[operation]}</p>
        <p className="timeline-text">{completed ? "Đã xử lý" : operationDescriptions[operation]}</p>
        {!readiness.canRun && !completed ? <p className="timeline-reason">{readiness.reason}</p> : null}
      </div>
      {requiresDocumentInput ? (
        <span className="muted">Thực hiện tại dòng chứng từ</span>
      ) : (
        <button className="button button-small" type="button" disabled={!readiness.canRun || isPending} onClick={() => onRun(operation)}>
          Chạy
        </button>
      )}
    </div>
  );
}


export function EntityPanel({ title, headers, rows }: { title: string; headers: string[]; rows: ReactNode[][] }) {
  return (
    <V2Panel className="panel span-6">
      <div className="panel-header">
        <h3 className="panel-title">{title}</h3>
      </div>
      <div className="panel-body">
        <DataTable headers={headers} rows={rows} />
      </div>
    </V2Panel>
  );
}

export function DataTable({
  headers,
  rows,
  emptyText = "Chưa có dữ liệu.",
  className = ""
}: {
  headers: string[];
  rows: ReactNode[][];
  emptyText?: string;
  className?: string;
}) {
  if (rows.length === 0) {
    return <V2EmptyState title="Chưa có dữ liệu" description={emptyText} />;
  }

  return (
    <V2DataTable headers={headers} rows={rows} className={`table-wrap data-table ${className}`.trim()} />
  );
}

export function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-item">
      <p className="summary-label">{label}</p>
      <p className="summary-value">{value}</p>
    </div>
  );
}

export function Metric({ label, value, metricId }: { label: string; value: string; metricId?: string }) {
  return (
    <div className="metric" data-metric-id={metricId}>
      <p className="summary-label">{label}</p>
      <p className="metric-value">{value}</p>
    </div>
  );
}

export function StatusBadge({ value, tone }: { value: string; tone: "success" | "warning" }) {
  return (
    <V2StatusBadge tone={tone}>
      {tone === "success" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
      {value}
    </V2StatusBadge>
  );
}

export function canRunOperation(state: OperationsState, operation: OperationName, targetId?: string, actor?: OperationsActor): { canRun: boolean; reason?: string } {
  const permission = operationsErpRegistry.commandByName.get(operation)?.permission;
  if (actor && permission && !actor.permissions.includes(permission)) {
    return { canRun: false, reason: `${actor.displayName} không có quyền ${permission}.` };
  }

  const targetSalesOrder = targetId ? state.salesOrders.find((item) => item.id === targetId) : undefined;
  const order = targetSalesOrder ?? state.salesOrders.find((item) => item.status === "draft") ?? state.salesOrders[0];
  const confirmedOrder = targetSalesOrder?.status === "confirmed" ? targetSalesOrder : state.salesOrders.find((item) => item.status === "confirmed");
  const targetPurchase = targetId ? findPurchaseLineForUi(state, targetId) : undefined;
  const targetInventoryMovement = targetId ? state.inventoryMovements.find((movement) => movement.id === targetId || movement.postingKey === targetId) : undefined;
  const poWarehouse = state.purchaseOrders.find((item) =>
    item.status !== "draft" && item.lines.some((line) => line.destinationType === "warehouse" && line.receivedQuantity < line.orderedQuantity)
  );
  const poDirect = state.purchaseOrders.find((item) =>
    item.status !== "draft" && item.lines.some((line) => line.destinationType === "customer_direct" && line.receivedQuantity < line.orderedQuantity)
  );
  const deliveryJobCanMove = (job: OperationsState["deliveryJobs"][number]) => {
    const salesOrder = state.salesOrders.find((item) => item.id === job.salesOrderId);
    return Boolean(
      salesOrder &&
        (salesOrder.status === "allocated" || salesOrder.status === "partially_delivered") &&
        salesOrder.lines.some((line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity)
    );
  };
  const findDeliveryByStatus = (statuses: string[]) => state.deliveryJobs.find((job) => statuses.includes(job.status) && deliveryJobCanMove(job));
  const deliveryAssigned = findDeliveryByStatus(["assigned"]);
  const deliveryLoading = findDeliveryByStatus(["loading"]);
  const deliveryInTransit = findDeliveryByStatus(["in_transit"]);
  const deliveryActive = findDeliveryByStatus(["assigned", "loading", "in_transit"]);
  const targetDelivery = targetId ? state.deliveryJobs.find((job) => job.id === targetId) : undefined;
  const targetDeliveryOrder = targetDelivery ? state.salesOrders.find((item) => item.id === targetDelivery.salesOrderId) : undefined;
  const targetCustomerPayment = targetId ? state.customerPayments.find((payment) => payment.id === targetId) : undefined;
  const customerPayment =
    state.customerPayments.find((payment) => payment.status === "draft" && state.customerLedgerEntries.some((entry) => entry.customerId === payment.customerId && entry.direction === "debit")) ??
    state.customerPayments[0];
  const confirmedCustomerPayment = targetCustomerPayment && ["confirmed", "partially_allocated"].includes(targetCustomerPayment.status)
    ? targetCustomerPayment
    : state.customerPayments.find((payment) => ["confirmed", "partially_allocated"].includes(payment.status) && payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0) < payment.amount);
  const targetSupplierPayment = targetId ? state.supplierPayments.find((payment) => payment.id === targetId) : undefined;
  const supplierPayment =
    state.supplierPayments.find((payment) => payment.status === "draft" && supplierBalance(state.supplierLedgerEntries, payment.supplierId) >= payment.amount) ??
    state.supplierPayments[0];
  const targetCashVoucher = targetId ? state.cashVouchers.find((voucher) => voucher.id === targetId) : undefined;
  const cashVoucher = targetCashVoucher ?? state.cashVouchers.find((voucher) => voucher.status === "draft") ?? state.cashVouchers[0];
  const targetWorkOrder = targetId ? state.workOrders.find((item) => item.id === targetId) : undefined;
  const workOrder = targetWorkOrder ?? state.workOrders.find((item) => item.status === "submitted") ?? state.workOrders[0];
  const approvedWorkOrder = targetWorkOrder?.status === "approved" ? targetWorkOrder : state.workOrders.find((item) => item.status === "approved");
  const compensation = state.compensationBatches.find((item) => item.status === "draft" && item.lines.length === 0) ?? state.compensationBatches[0];
  const targetEmployeePayment = targetId ? state.employeePayments.find((payment) => payment.id === targetId) : undefined;
  const employeePayment =
    state.employeePayments.find((payment) => payment.status === "draft" && employeeBalance(state, payment.employeeId) >= payment.amount && cashBalance(state) >= payment.amount) ??
    state.employeePayments[0];
  const targetEmployeeAdvance = targetId ? state.employeeAdvances.find((advance) => advance.id === targetId) : undefined;
  const employeeAdvance = targetEmployeeAdvance ?? state.employeeAdvances.find((advance) => advance.status === "draft") ?? state.employeeAdvances[0];
  const targetImportIssue = targetId ? state.importIssues.find((issue) => issue.id === targetId) : undefined;
  const actorWorkerEmployee = actor
    ? state.employees.find((employee) =>
      employee.roleType === "worker" && normalizeSearch(employee.displayName) === normalizeSearch(actor.displayName)
    )
    : undefined;

  switch (operation) {
    case "confirmSalesOrder":
      if (targetId && !targetSalesOrder) {
        return { canRun: false, reason: "Không tìm thấy đơn bán." };
      }
      if (!order) {
        return { canRun: false, reason: "Chưa có đơn bán nháp." };
      }
      return order.status === "draft" ? { canRun: true } : { canRun: false, reason: "Đơn bán đã xác nhận." };
    case "claimOpenSalesWorkOrder":
      if (actor?.role !== "worker") {
        return { canRun: false, reason: "Chỉ tài khoản Thợ mới được nhận đơn mới." };
      }
      if (!targetWorkOrder || !targetWorkOrder.salesOrderId) {
        return { canRun: false, reason: "Chọn đơn mới cụ thể để nhận." };
      }
      if (!actorWorkerEmployee || actorWorkerEmployee.status !== "active") {
        return { canRun: false, reason: "Tài khoản này chưa sẵn sàng. Hãy báo chủ cửa hàng." };
      }
      return targetWorkOrder.status === "open" && targetWorkOrder.participants.length === 0
        ? { canRun: true }
        : { canRun: false, reason: "Đơn này đã có người nhận." };
    case "recordWorkOrderLocation":
      if (actor?.role !== "worker") {
        return { canRun: false, reason: "Bạn chưa được phép gửi vị trí." };
      }
      if (!targetWorkOrder || !targetWorkOrder.salesOrderId) {
        return { canRun: false, reason: "Việc này chưa thể gửi vị trí." };
      }
      if (!actorWorkerEmployee || actorWorkerEmployee.status !== "active") {
        return { canRun: false, reason: "Tài khoản này chưa sẵn sàng. Hãy báo chủ cửa hàng." };
      }
      if (targetWorkOrder.status === "open" || !targetWorkOrder.claimedByEmployeeId) {
        return { canRun: false, reason: "Hãy nhận việc trước khi gửi vị trí." };
      }
      return targetWorkOrder.participants.some((participant) => participant.employeeId === actorWorkerEmployee.id)
        ? { canRun: true }
        : { canRun: false, reason: "Việc này không thuộc về bạn." };
    case "allocateSalesSources":
      if (targetId) {
        if (!targetSalesOrder) {
          return { canRun: false, reason: "Không tìm thấy đơn bán." };
        }
        return targetSalesOrder.status === "confirmed" ? { canRun: true } : { canRun: false, reason: "Cần xác nhận đơn bán trước." };
      }
      return confirmedOrder ? { canRun: true } : { canRun: false, reason: "Cần xác nhận đơn bán trước." };
    case "confirmPurchaseOrder": {
      const targetOrder = targetId ? state.purchaseOrders.find((item) => item.id === targetId) : state.purchaseOrders.find((item) => item.status === "draft");
      return targetOrder?.status === "draft"
        ? { canRun: true }
        : { canRun: false, reason: targetId ? "Đơn mua không còn ở trạng thái nháp." : "Không còn đơn mua nháp." };
    }
    case "submitGoodsReceipt":
      if (targetId) {
        if (!targetPurchase) {
          return { canRun: false, reason: "Không tìm thấy dòng mua." };
        }
        const hasPendingReceipt = state.approvalRequests.some((request) =>
          request.type === "goods_receipt" && request.status === "pending" && (request.targetId === targetId || request.id === targetId)
        );
        return !hasPendingReceipt && targetPurchase.purchaseOrder.status !== "draft" && targetPurchase.line.destinationType === "warehouse" && Boolean(targetPurchase.line.warehouseId) && targetPurchase.line.receivedQuantity < targetPurchase.line.orderedQuantity
          ? { canRun: true }
          : { canRun: false, reason: hasPendingReceipt ? "Dòng mua đang chờ duyệt." : "Dòng mua chưa sẵn sàng nhận kho." };
      }
      return poWarehouse && !poWarehouse.lines.some((line) => state.approvalRequests.some((request) => request.type === "goods_receipt" && request.status === "pending" && request.targetId === line.id))
        ? { canRun: true }
        : { canRun: false, reason: "Chua co dong mua nhan kho san sang." };
    case "approveGoodsReceipt":
    case "rejectGoodsReceipt": {
      if (actor && actor.role !== "owner" && actor.role !== "accountant") {
        return { canRun: false, reason: "Chỉ Chủ cửa hàng hoặc Kế toán được duyệt." };
      }
      const request = state.approvalRequests.find((item) => item.type === "goods_receipt" && item.status === "pending" && (!targetId || item.id === targetId || item.targetId === targetId));
      return request ? { canRun: true } : { canRun: false, reason: "Không có phiếu nhập đang chờ duyệt." };
    }
    case "postGoodsReceipt":
      if (targetId) {
        if (!targetPurchase) {
          return { canRun: false, reason: "Không tìm thấy dòng mua." };
        }
        if (state.approvalRequests.some((request) => request.type === "goods_receipt" && request.status === "pending" && (request.targetId === targetId || request.id === targetId))) {
          return { canRun: false, reason: "Dòng mua đang chờ Chủ cửa hàng hoặc Kế toán duyệt." };
        }
        return targetPurchase.purchaseOrder.status !== "draft" && targetPurchase.line.destinationType === "warehouse" && Boolean(targetPurchase.line.warehouseId) && targetPurchase.line.receivedQuantity < targetPurchase.line.orderedQuantity
          ? { canRun: true }
          : { canRun: false, reason: targetPurchase.purchaseOrder.status === "draft" ? "Cần xác nhận đơn mua trước." : "Dòng mua này không còn cần nhập kho." };
      }
      if (!poWarehouse) {
        return { canRun: false, reason: "Chưa có đơn mua nhập kho." };
      }
      return { canRun: true };
    case "postInventoryTransfer":
      return state.warehouses.length >= 2 && state.productUnits.length > 0
        ? { canRun: true }
        : { canRun: false, reason: "Cần ít nhất hai kho và một vật tư để chuyển kho." };
    case "postInventoryCountAdjustment":
      return state.warehouses.length > 0 && state.productUnits.length > 0
        ? { canRun: true }
        : { canRun: false, reason: "Cần kho và vật tư để kiểm kê." };
    case "reverseInventoryMovement":
      if (!targetId) {
        return { canRun: false, reason: "Chọn phát sinh kho cụ thể để đảo." };
      }
      if (!targetInventoryMovement) {
        return { canRun: false, reason: "Không tìm thấy phát sinh kho." };
      }
      if (targetInventoryMovement.reversedById) {
        return { canRun: false, reason: "Phát sinh kho đã được đảo." };
      }
      if (targetInventoryMovement.movementType === "opening" || targetInventoryMovement.movementType === "reverse") {
        return { canRun: false, reason: "Tồn đầu kỳ và dòng đảo không được đảo bằng thao tác này." };
      }
      return stockBalance(state, targetInventoryMovement.warehouseId, targetInventoryMovement.productUnitId) - targetInventoryMovement.quantity >= 0
        ? { canRun: true }
        : { canRun: false, reason: "Đảo phát sinh này sẽ làm âm tồn kho." };
    case "confirmDirectDelivery":
      if (targetId) {
        if (!targetPurchase) {
          return { canRun: false, reason: "Không tìm thấy dòng mua." };
        }
        const hasLinkedDirectSalesLine = state.salesOrders.some(
          (salesOrder) =>
            (salesOrder.status === "allocated" || salesOrder.status === "partially_delivered") &&
            salesOrder.lines.some(
              (line) =>
                line.productUnitId === targetPurchase.line.productUnitId &&
                line.deliveredQuantity < line.quantity &&
                (line.purchaseOrderLineId === targetPurchase.line.id || line.sourceType === "direct_supplier")
            )
        );
        return targetPurchase.purchaseOrder.status !== "draft" && targetPurchase.line.destinationType === "customer_direct" && targetPurchase.line.receivedQuantity < targetPurchase.line.orderedQuantity && hasLinkedDirectSalesLine
          ? { canRun: true }
          : { canRun: false, reason: targetPurchase.purchaseOrder.status === "draft" ? "Cần xác nhận đơn mua trước." : "Cần phân bổ nguồn giao thẳng trước." };
      }
      if (!poDirect) {
        return { canRun: false, reason: "Chưa có đơn mua giao thẳng." };
      }
      return poDirect.status !== "fully_received" && state.salesOrders.some((item) => item.status === "allocated" || item.status === "partially_delivered")
        ? { canRun: true }
        : { canRun: false, reason: "Cần phân bổ nguồn và dòng giao thẳng chưa xác nhận." };
    case "reverseDirectDelivery":
      if (!targetId || !targetPurchase) {
        return { canRun: false, reason: "Chọn dòng mua giao thẳng đã ghi nhận để đảo." };
      }
      return targetPurchase.line.destinationType === "customer_direct" && targetPurchase.line.receivedQuantity > 0
        ? { canRun: true }
        : { canRun: false, reason: "Dòng mua chưa có lần giao thẳng để đảo." };
    case "startDeliveryLoading":
      if (targetId) {
        if (!targetDelivery || !targetDeliveryOrder) {
          return { canRun: false, reason: "Không tìm thấy chuyến giao." };
        }
        return targetDelivery.status === "assigned" && deliveryJobCanMove(targetDelivery)
          ? { canRun: true }
          : { canRun: false, reason: "Chuyến này chưa sẵn sàng bốc hàng." };
      }
      return deliveryAssigned ? { canRun: true } : { canRun: false, reason: "Cần chuyến giao đã phân công và đơn đã phân bổ qua kho." };
    case "dispatchDelivery":
      if (targetId) {
        if (!targetDelivery || !targetDeliveryOrder) {
          return { canRun: false, reason: "Không tìm thấy chuyến giao." };
        }
        return targetDelivery.status === "loading" && deliveryJobCanMove(targetDelivery)
          ? { canRun: true }
          : { canRun: false, reason: "Cần bốc hàng trước khi xuất bến." };
      }
      return deliveryLoading ? { canRun: true } : { canRun: false, reason: "Cần chuyến đang bốc hàng." };
    case "submitDeliveryCompletion":
      if (targetId) {
        if (!targetDelivery || !targetDeliveryOrder) {
          return { canRun: false, reason: "Không tìm thấy chuyến giao." };
        }
        const hasPendingDelivery = state.approvalRequests.some((request) => request.type === "delivery_completion" && request.status === "pending" && (request.targetId === targetId || request.id === targetId));
        return !hasPendingDelivery && targetDelivery.status === "in_transit" &&
          (targetDeliveryOrder.status === "allocated" || targetDeliveryOrder.status === "partially_delivered") &&
          targetDeliveryOrder.lines.some((line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity)
          ? { canRun: true }
          : { canRun: false, reason: hasPendingDelivery ? "Chuyến giao đang chờ duyệt." : "Chuyến này chưa đủ điều kiện gửi xác nhận." };
      }
      return deliveryInTransit && !state.approvalRequests.some((request) => request.type === "delivery_completion" && request.status === "pending" && request.targetId === deliveryInTransit.id)
        ? { canRun: true }
        : { canRun: false, reason: "Chưa có chuyến giao sẵn sàng gửi xác nhận." };
    case "approveDeliveryCompletion":
    case "rejectDeliveryCompletion": {
      if (actor && actor.role !== "owner" && actor.role !== "accountant") {
        return { canRun: false, reason: "Chỉ Chủ cửa hàng hoặc Kế toán được duyệt." };
      }
      const request = state.approvalRequests.find((item) => item.type === "delivery_completion" && item.status === "pending" && (!targetId || item.id === targetId || item.targetId === targetId));
      return request ? { canRun: true } : { canRun: false, reason: "Không có xác nhận giao đang chờ duyệt." };
    }
    case "completeDelivery":
      if (targetId) {
        if (!targetDelivery || !targetDeliveryOrder) {
          return { canRun: false, reason: "Không tìm thấy chuyến giao." };
        }
        if (state.approvalRequests.some((request) => request.type === "delivery_completion" && request.status === "pending" && (request.targetId === targetId || request.id === targetId))) {
          return { canRun: false, reason: "Chuyến giao đang chờ Chủ cửa hàng hoặc Kế toán duyệt." };
        }
        return targetDelivery.status === "in_transit" &&
          (targetDeliveryOrder.status === "allocated" || targetDeliveryOrder.status === "partially_delivered") &&
          targetDeliveryOrder.lines.some((line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity)
          ? { canRun: true }
          : { canRun: false, reason: "Chuyến này chưa đủ điều kiện hoàn tất." };
      }
      return deliveryInTransit ? { canRun: true } : { canRun: false, reason: "Cần chuyến đã xuất bến, đơn đã phân bổ và đủ tồn kho phần qua kho." };
    case "failDelivery":
      if (targetId) {
        if (!targetDelivery || !targetDeliveryOrder) {
          return { canRun: false, reason: "Không tìm thấy chuyến giao." };
        }
        return ["assigned", "loading", "in_transit"].includes(targetDelivery.status) && deliveryJobCanMove(targetDelivery)
          ? { canRun: true }
          : { canRun: false, reason: "Chuyến này không thể báo thất bại." };
      }
      return deliveryActive ? { canRun: true } : { canRun: false, reason: "Không có chuyến giao đang xử lý." };
    case "confirmCustomerPayment":
      if (targetId) {
        if (!targetCustomerPayment) {
          return { canRun: false, reason: "Không tìm thấy phiếu thu." };
        }
        return targetCustomerPayment.status === "draft" && state.customerLedgerEntries.some((entry) => entry.customerId === targetCustomerPayment.customerId && entry.direction === "debit")
          ? { canRun: true }
          : { canRun: false, reason: "Phiếu thu này chưa đủ điều kiện xác nhận." };
      }
      if (!customerPayment) {
        return { canRun: false, reason: "Chưa có phiếu thu nháp." };
      }
      return customerPayment.status === "draft" && state.customerLedgerEntries.some((entry) => entry.direction === "debit")
        ? { canRun: true }
        : { canRun: false, reason: "Cần có phải thu và phiếu thu nháp." };
    case "allocateCustomerPayment":
      if (targetId) {
        if (!targetCustomerPayment) {
          return { canRun: false, reason: "Không tìm thấy phiếu thu." };
        }
        return ["confirmed", "partially_allocated"].includes(targetCustomerPayment.status) && paymentUnallocatedAmount(targetCustomerPayment) > 0 && getOpenCustomerDebtObligations(state, targetCustomerPayment.customerId).length > 0
          ? { canRun: true }
          : { canRun: false, reason: "Phiếu thu chưa xác nhận, đã phân bổ hết hoặc không còn chứng từ nợ phù hợp." };
      }
      return confirmedCustomerPayment
        ? { canRun: true }
        : { canRun: false, reason: "Cần xác nhận phiếu thu trước." };
    case "reverseCustomerPayment":
      if (!targetId) {
        return { canRun: false, reason: "Chọn phiếu thu cụ thể để đảo." };
      }
      if (!targetCustomerPayment) {
        return { canRun: false, reason: "Không tìm thấy phiếu thu." };
      }
      return ["confirmed", "partially_allocated", "allocated"].includes(targetCustomerPayment.status)
        ? { canRun: true }
        : { canRun: false, reason: "Chỉ phiếu thu đã xác nhận hoặc đã phân bổ mới được đảo." };
    case "confirmSupplierPayment":
      if (targetId) {
        if (!targetSupplierPayment) {
          return { canRun: false, reason: "Không tìm thấy phiếu chi." };
        }
        return targetSupplierPayment.status === "draft" && supplierBalance(state.supplierLedgerEntries, targetSupplierPayment.supplierId) >= targetSupplierPayment.amount && cashBalance(state) >= targetSupplierPayment.amount
          ? { canRun: true }
          : { canRun: false, reason: "Phiếu chi này chưa đủ điều kiện xác nhận." };
      }
      if (!supplierPayment) {
        return { canRun: false, reason: "Chưa có phiếu chi nháp." };
      }
      return supplierPayment.status === "draft" && supplierBalance(state.supplierLedgerEntries, supplierPayment.supplierId) >= supplierPayment.amount && cashBalance(state) >= supplierPayment.amount
        ? { canRun: true }
        : { canRun: false, reason: "Cần có đủ công nợ phải trả và số dư quỹ." };
    case "allocateSupplierPayment":
      if (targetId) {
        if (!targetSupplierPayment) {
          return { canRun: false, reason: "Không tìm thấy phiếu chi." };
        }
        return ["confirmed", "partially_allocated"].includes(targetSupplierPayment.status) && paymentUnallocatedAmount(targetSupplierPayment) > 0 && getOpenSupplierDebtObligations(state, targetSupplierPayment.supplierId).length > 0
          ? { canRun: true }
          : { canRun: false, reason: "Phiếu chi chưa xác nhận, đã phân bổ hết hoặc không còn chứng từ nợ phù hợp." };
      }
      return state.supplierPayments.some((payment) => ["confirmed", "partially_allocated"].includes(payment.status) && payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0) < payment.amount)
        ? { canRun: true }
        : { canRun: false, reason: "Cần xác nhận phiếu chi trước khi phân bổ." };
    case "reverseSupplierPayment":
      if (!targetId) {
        return { canRun: false, reason: "Chọn phiếu chi nhà cung cấp cụ thể để đảo." };
      }
      if (!targetSupplierPayment) {
        return { canRun: false, reason: "Không tìm thấy phiếu chi." };
      }
      return ["confirmed", "partially_allocated", "allocated"].includes(targetSupplierPayment.status)
        ? { canRun: true }
        : { canRun: false, reason: "Chỉ phiếu chi đã xác nhận hoặc đã phân bổ mới được đảo." };
    case "confirmCashVoucher":
      if (targetId && !targetCashVoucher) {
        return { canRun: false, reason: "Không tìm thấy phiếu quỹ." };
      }
      if (!cashVoucher || cashVoucher.status !== "draft") {
        return { canRun: false, reason: "Không còn phiếu quỹ nháp." };
      }
      return cashVoucher.direction === "out" && cashBalance(state) < cashVoucher.amount
        ? { canRun: false, reason: "Tồn quỹ không đủ để xác nhận phiếu chi." }
        : { canRun: true };
    case "reverseCashVoucher":
      if (!targetCashVoucher) {
        return { canRun: false, reason: "Chọn phiếu quỹ đã xác nhận để đảo." };
      }
      return targetCashVoucher.status === "confirmed"
        ? { canRun: true }
        : { canRun: false, reason: "Chỉ phiếu quỹ đã xác nhận mới được đảo." };
    case "approveWorkOutput":
      if (targetId && !targetWorkOrder) {
        return { canRun: false, reason: "Không tìm thấy phiếu công." };
      }
      if (!workOrder) {
        return { canRun: false, reason: "Chưa có phiếu công chờ duyệt." };
      }
      return workOrder.status === "submitted" ? { canRun: true } : { canRun: false, reason: "Sản lượng đã duyệt hoặc đã tính công." };
    case "postCompensation":
      if (!compensation) {
        return { canRun: false, reason: "Chưa có bảng công nháp." };
      }
      if (targetId) {
        if (!targetWorkOrder) {
          return { canRun: false, reason: "Không tìm thấy phiếu công." };
        }
        return targetWorkOrder.status === "approved" && compensation.status === "draft"
          ? { canRun: true }
          : { canRun: false, reason: "Cần duyệt sản lượng trước khi ghi nhận bảng công." };
      }
      return approvedWorkOrder && compensation.status === "draft"
        ? { canRun: true }
        : { canRun: false, reason: "Cần duyệt sản lượng trước khi ghi nhận bảng công." };
    case "payEmployee":
      if (targetId) {
        if (!targetEmployeePayment) {
          return { canRun: false, reason: "Không tìm thấy phiếu thanh toán nhân viên." };
        }
        return targetEmployeePayment.status === "draft" && employeeBalance(state, targetEmployeePayment.employeeId) >= targetEmployeePayment.amount && cashBalance(state) >= targetEmployeePayment.amount
          ? { canRun: true }
          : { canRun: false, reason: "Phiếu này chưa đủ điều kiện thanh toán." };
      }
      if (!employeePayment) {
        return { canRun: false, reason: "Chưa có phiếu thanh toán nhân viên nháp." };
      }
      return employeePayment.status === "draft" && employeeBalance(state, employeePayment.employeeId) >= employeePayment.amount && cashBalance(state) >= employeePayment.amount
        ? { canRun: true }
        : { canRun: false, reason: "Cần có công đã chốt và quỹ đủ tiền." };
    case "reverseEmployeePayment":
      if (!targetId) {
        return { canRun: false, reason: "Chọn phiếu thanh toán nhân viên cụ thể để đảo." };
      }
      if (!targetEmployeePayment) {
        return { canRun: false, reason: "Không tìm thấy phiếu thanh toán nhân viên." };
      }
      return targetEmployeePayment.status === "confirmed"
        ? { canRun: true }
        : { canRun: false, reason: "Chỉ phiếu thanh toán đã xác nhận mới được đảo." };
    case "confirmEmployeeAdvance":
      if (targetId && !targetEmployeeAdvance) {
        return { canRun: false, reason: "Không tìm thấy phiếu tạm ứng." };
      }
      return employeeAdvance?.status === "draft" && cashBalance(state) >= employeeAdvance.amount
        ? { canRun: true }
        : { canRun: false, reason: "Cần phiếu tạm ứng nháp và đủ số dư quỹ." };
    case "reverseEmployeeAdvance":
      if (!targetId || !targetEmployeeAdvance) {
        return { canRun: false, reason: "Chọn phiếu tạm ứng đã xác nhận để đảo." };
      }
      return targetEmployeeAdvance.status === "confirmed"
        ? { canRun: true }
        : { canRun: false, reason: "Chỉ phiếu tạm ứng đã xác nhận mới được đảo." };
    case "resolveImportIssue":
      if (targetId) {
        if (!targetImportIssue) {
          return { canRun: false, reason: "Không tìm thấy vấn đề import." };
        }
        return targetImportIssue.status === "open" ? { canRun: true } : { canRun: false, reason: "Vấn đề import đã xử lý." };
      }
      return state.importIssues.some((issue) => issue.status === "open")
        ? { canRun: true }
        : { canRun: false, reason: "Không còn vấn đề import đang mở." };
    case "ignoreImportIssue":
      if (targetId) {
        if (!targetImportIssue) {
          return { canRun: false, reason: "Không tìm thấy cảnh báo import." };
        }
        return targetImportIssue.status === "open" && targetImportIssue.severity === "warning"
          ? { canRun: true }
          : { canRun: false, reason: "Chỉ cảnh báo import đang mở mới được bỏ qua." };
      }
      return state.importIssues.some((issue) => issue.status === "open" && issue.severity === "warning")
        ? { canRun: true }
        : { canRun: false, reason: "Không còn cảnh báo import đang mở." };
    default:
      return { canRun: false, reason: "Không có quy tắc cho thao tác này." };
  }
}

export function findPurchaseLineForUi(state: OperationsState, targetId: string) {
  for (const purchaseOrder of state.purchaseOrders) {
    for (const line of purchaseOrder.lines) {
      if (purchaseOrder.id === targetId || line.id === targetId) {
        return { purchaseOrder, line };
      }
    }
  }
  return undefined;
}

type DocumentUnitFormLine = {
  productUnitId?: string;
  unitName?: string;
  unitFactor?: number;
  actualBaseQuantity?: number;
  quantity?: number;
  orderedQuantity?: number;
};

export function productBaseUnit(state: OperationsState, productUnitId: string) {
  return state.productUnits.find((product) => product.id === productUnitId)?.unitName ?? "";
}

export function usesProductBaseUnit(state: OperationsState, productUnitId: string, unitName?: string) {
  return normalizeSearch(productBaseUnit(state, productUnitId)) === normalizeSearch(unitName ?? "");
}

export function documentUnitOptions(state: OperationsState, productUnitId: string) {
  // Only the base unit and product-specific configured conversions are valid.
  const candidates = [
    productBaseUnit(state, productUnitId),
    ...configuredPurchaseUnits(state, productUnitId).map((unit) => unit.unitName)
  ].filter(Boolean);
  const seen = new Set<string>();
  return candidates.filter((unit) => {
    const normalized = normalizeSearch(unit);
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

export function purchaseDocumentUnitOptions(state: OperationsState, productUnitId: string) {
  return configuredPurchaseUnits(state, productUnitId).map((unit) => unit.unitName);
}

export function defaultPurchaseUnitId(state: OperationsState, productUnitId: string) {
  const configuredUnitId = state.purchaseUnitConversions.find(
    (conversion) => conversion.productUnitId === productUnitId &&
      state.unitDefinitions.some((unit) => unit.id === conversion.unitId && unit.status === "active")
  )?.unitId;
  if (configuredUnitId) {
    return configuredUnitId;
  }
  // An unconfigured alternative unit is not a valid default.
  return "";
}

export function defaultPurchaseUnitFactor(state: OperationsState, productUnitId: string) {
  const unitId = defaultPurchaseUnitId(state, productUnitId);
  return state.purchaseUnitConversions.find(
    (conversion) => conversion.productUnitId === productUnitId && conversion.unitId === unitId
  )?.factorToBase ?? 1;
}

export function defaultPurchaseUnitMode(state: OperationsState, productUnitId: string) {
  const unitId = defaultPurchaseUnitId(state, productUnitId);
  return state.purchaseUnitConversions.find(
    (conversion) => conversion.productUnitId === productUnitId && conversion.unitId === unitId
  )?.conversionMode ?? "fixed";
}

export function isVariablePurchaseUnit(state: OperationsState, productUnitId: string, unitName?: string) {
  return configuredPurchaseUnit(state, productUnitId, unitName)?.conversionMode === "variable";
}

export function displayUnitName(unitName?: string) {
  if (!unitName) {
    return "đơn vị";
  }
  return normalizeSearch(unitName) === "m3" ? "m³" : unitName;
}

export function documentConversionPreview(state: OperationsState, line?: DocumentUnitFormLine) {
  if (!line?.productUnitId) {
    return "Chọn vật tư để xem đơn vị tồn kho.";
  }
  const baseUnit = productBaseUnit(state, line.productUnitId);
  const unitName = line.unitName || baseUnit;
  const configuredUnit = configuredPurchaseUnit(state, line.productUnitId, unitName);
  const quantity = Number(line.quantity ?? line.orderedQuantity ?? 0);
  if (configuredUnit?.conversionMode === "variable") {
    const actualBaseQuantity = Number(line.actualBaseQuantity);
    if (!Number.isFinite(actualBaseQuantity) || actualBaseQuantity <= 0) {
      return `Nhập tổng ${displayUnitName(baseUnit)} thực nhận cho ${formatQuantity(quantity)} ${displayUnitName(unitName)}.`;
    }
    return `${formatQuantity(quantity)} ${displayUnitName(unitName)} · ghi nhận thực tế ${formatQuantity(actualBaseQuantity)} ${displayUnitName(baseUnit)}; không dùng quy đổi cố định.`;
  }
  const factor = usesProductBaseUnit(state, line.productUnitId, unitName) ? 1 : Number(line.unitFactor);
  if (!Number.isFinite(factor) || factor <= 0) {
    return `Nhập số ${displayUnitName(baseUnit)} có trong 1 ${displayUnitName(unitName)}.`;
  }
  return `1 ${displayUnitName(unitName)} = ${formatQuantity(factor)} ${displayUnitName(baseUnit)} · ${formatQuantity(quantity)} ${displayUnitName(unitName)} sẽ ghi ${formatQuantity(quantity * factor)} ${displayUnitName(baseUnit)}.`;
}

export function lineDocumentFactor(line: SalesOrderLine | PurchaseOrderLine) {
  return line.documentUnit?.factorToBase ?? 1;
}

export function lineDocumentUnitName(state: OperationsState, line: SalesOrderLine | PurchaseOrderLine) {
  return line.documentUnit?.unitName ?? productBaseUnit(state, line.productUnitId);
}

export function salesLineQuantityText(state: OperationsState, line: SalesOrderLine, delivered = false) {
  const baseQuantity = delivered ? line.deliveredQuantity : line.quantity;
  const documentQuantity = baseQuantity / lineDocumentFactor(line);
  return `${formatQuantity(documentQuantity)} ${displayUnitName(lineDocumentUnitName(state, line))}`;
}

export function purchaseLineProgressText(state: OperationsState, line: PurchaseOrderLine) {
  const factor = lineDocumentFactor(line);
  const unitName = displayUnitName(lineDocumentUnitName(state, line));
  const baseUnit = displayUnitName(productBaseUnit(state, line.productUnitId));
  if (line.documentUnit?.conversionMode === "variable") {
    return `${formatQuantity(line.receivedQuantity)} / ${formatQuantity(line.orderedQuantity)} ${baseUnit} · đơn mua ${formatQuantity(line.documentUnit.quantity)} ${unitName}`;
  }
  const progress = `${formatQuantity(line.receivedQuantity / factor)} / ${formatQuantity(line.orderedQuantity / factor)} ${unitName}`;
  return factor === 1 ? progress : `${progress} (${formatQuantity(line.receivedQuantity)} / ${formatQuantity(line.orderedQuantity)} ${baseUnit})`;
}

export function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function defaultAllocationAmounts(
  obligations: Array<{ ledgerEntryId: string; openAmount: number }>,
  availableAmount: number
) {
  const amounts: Record<string, string> = {};
  let remaining = availableAmount;
  for (const obligation of obligations) {
    const amount = Math.min(obligation.openAmount, remaining);
    amounts[obligation.ledgerEntryId] = amount > 0 ? String(amount) : "";
    remaining -= amount;
  }
  return amounts;
}

export function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function filterRows<T>(rows: T[], searchTerm: string, getValues: (row: T) => Array<string | number | undefined>) {
  const query = normalizeSearch(searchTerm);
  if (!query) {
    return rows;
  }
  return rows.filter((row) => getValues(row).some((value) => normalizeSearch(String(value ?? "")).includes(query)));
}

export function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

export function statusText(value: string | undefined) {
  const dictionary: Record<string, string> = {
    active: "Đang dùng",
    adjustment: "Điều chỉnh kiểm kê",
    allocated: "Đã phân bổ",
    approved: "Đã duyệt",
    assigned: "Đã phân công",
    compensated: "Đã tính công",
    confirmed: "Đã xác nhận",
    credit: "Có",
    customer_direct: "Giao thẳng khách",
    debit: "Nợ",
    delivered: "Đã giao",
    draft: "Bản nháp",
    error: "Lỗi",
    failed: "Thất bại",
    fully_received: "Nhận đủ",
    ignored: "Đã bỏ qua",
    inactive: "Ngừng dùng",
    in_transit: "Đang giao",
    issue: "Xuất kho",
    loading: "Đang bốc hàng",
    opening: "Tồn đầu kỳ",
    open: "Chờ nhận",
    ordered: "Đã đặt",
    pending: "Chờ duyệt",
    owner: "Chủ cửa hàng",
    partially_allocated: "Phân bổ một phần",
    partially_delivered: "Giao một phần",
    partially_received: "Nhận một phần",
    paid: "Đã thanh toán",
    posted: "Đã ghi nhận",
    receipt: "Nhập kho",
    reverse: "Đảo kho",
    resolved: "Đã xử lý",
    rejected: "Đã từ chối",
    reversed: "Đã đảo",
    submitted: "Chờ duyệt",
    transfer_in: "Nhập chuyển kho",
    transfer_out: "Xuất chuyển kho",
    warning: "Cảnh báo",
    warehouse: "Kho cửa hàng"
  };

  return value ? dictionary[value] ?? value : "-";
}

export function debtStatusText(value: "open" | "partially_allocated" | "settled") {
  return value === "settled" ? "Đã tất toán" : value === "partially_allocated" ? "Còn một phần" : "Chưa phân bổ";
}

export function roleText(value: string) {
  const dictionary: Record<string, string> = {
    accountant: "Kế toán",
    administrator: "Quản trị hệ thống",
    dispatcher: "Điều phối",
    driver: "Tài xế",
    owner: "Chủ cửa hàng",
    sales: "Bán hàng",
    supervisor: "Giám sát",
    warehouse: "Kho",
    worker: "Thợ",
    viewer: "Chỉ xem"
  };

  return dictionary[value] ?? value;
}

export function sourceText(value: string | undefined) {
  if (value === "warehouse") {
    return "Qua kho";
  }
  if (value === "direct_supplier") {
    return "Giao thẳng";
  }
  return "Chưa phân bổ";
}

export function formatRoleMetricValue(metric: RoleDashboardMetric) {
  if (metric.valueType === "money" && typeof metric.value === "number") {
    return formatMoney(metric.value);
  }
  if (metric.valueType === "quantity" && typeof metric.value === "number") {
    return formatQuantity(metric.value);
  }
  if (metric.valueType === "count" && typeof metric.value === "number") {
    return metric.value.toString();
  }
  return String(metric.value);
}

export function taskStatusClassName(task: RoleDashboardTask) {
  if (task.severity === "success") {
    return "status status-core-ready";
  }
  if (task.severity === "danger") {
    return "status status-danger";
  }
  if (task.severity === "warning") {
    return "status status-hardening-required";
  }
  return "status status-planned";
}

export function taskStatusText(task: RoleDashboardTask) {
  if (task.count === 0) {
    return "Ổn";
  }
  if (task.severity === "danger") {
    return "Cần xử lý";
  }
  if (task.severity === "warning") {
    return "Cần chú ý";
  }
  return "Theo dõi";
}
