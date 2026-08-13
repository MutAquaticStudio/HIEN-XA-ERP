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

export function DeliveryView({
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
  return (
    <div className="workbench-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Chuyến giao hôm nay</h3>
            <p className="panel-note">Tài xế/thợ chỉ thấy thông tin cần để hoàn thành việc.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Chuyến", "Đơn bán", "Tài xế", "Xe", "Phụ xe/thợ", "Trạng thái", "Hành động"]}
            rows={state.deliveryJobs.map((job) => [
              job.documentNo,
              state.salesOrders.find((order) => order.id === job.salesOrderId)?.documentNo ?? job.salesOrderId,
              partyName(state, job.driverId),
              state.vehicles.find((vehicle) => vehicle.id === job.vehicleId)?.plateNumber ?? job.vehicleId,
              job.helperIds.map((id) => partyName(state, id)).join(", "),
              statusText(job.status),
              job.status === "assigned" ? (
                <div key="actions" className="table-actions">
                  <WorkflowActionButton operation="startDeliveryLoading" state={state} runOperation={runOperation} isPending={isPending} label="Bốc hàng" targetId={job.id} />
                  <WorkflowActionButton operation="failDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Thất bại" targetId={job.id} />
                </div>
              ) : job.status === "loading" ? (
                <div key="actions" className="table-actions">
                  <WorkflowActionButton operation="dispatchDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Xuất bến" targetId={job.id} />
                  <WorkflowActionButton operation="failDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Thất bại" targetId={job.id} />
                </div>
              ) : job.status === "in_transit" ? (
                <div key="actions" className="table-actions">
                  {state.approvalRequests.some((request) => request.type === "delivery_completion" && request.status === "pending" && request.targetId === job.id) ? (
                    actor.role === "owner" || actor.role === "accountant" ? (
                      <>
                        <ApprovalAttachmentPreview attachments={state.approvalRequests.find((request) => request.type === "delivery_completion" && request.status === "pending" && request.targetId === job.id)?.attachments} />
                        <WorkflowActionButton operation="approveDeliveryCompletion" state={state} runOperation={runOperation} isPending={isPending} label="Duyệt giao" targetId={state.approvalRequests.find((request) => request.type === "delivery_completion" && request.status === "pending" && request.targetId === job.id)?.id} />
                        <WorkflowActionButton operation="rejectDeliveryCompletion" state={state} runOperation={runOperation} isPending={isPending} label="Từ chối" targetId={state.approvalRequests.find((request) => request.type === "delivery_completion" && request.status === "pending" && request.targetId === job.id)?.id} />
                      </>
                    ) : (
                      <span className="muted">Chờ Chủ cửa hàng/Kế toán duyệt</span>
                    )
                  ) : actor.role === "worker" ? (
                    <WorkflowActionButton operation="submitDeliveryCompletion" state={state} runOperation={runOperation} isPending={isPending} label="Xác nhận đã giao" targetId={job.id} />
                  ) : (
                    <WorkflowActionButton operation="completeDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Hoàn tất giao" targetId={job.id} />
                  )}
                  <WorkflowActionButton operation="failDelivery" state={state} runOperation={runOperation} isPending={isPending} label="Thất bại" targetId={job.id} />
                </div>
              ) : job.status === "delivered" ? (
                <div key="done" className="table-actions"><ApprovalAttachmentPreview attachments={job.completionAttachments} emptyText="" /><span className="muted">Đã hoàn tất</span></div>
              ) : (
                <span key="failed" className="muted">Cần điều phối lại</span>
              )
            ])}
          />
        </div>
      </section>
      <div className="side-stack">
        <DeliveryJobForm state={state} createCommand={createCommand} isPending={isPending} />
      </div>
    </div>
  );
}
export function WorkerDeliveryView({
  state,
  runOperation,
  isPending
}: {
  state: OperationsState;
  runOperation: OperationHandler;
  isPending: boolean;
}) {
  const rows = state.deliveryJobs.map((job) => {
    const order = state.salesOrders.find((item) => item.id === job.salesOrderId);
    const pendingCompletion = state.approvalRequests.some((request) =>
      request.type === "delivery_completion" && request.status === "pending" && request.targetId === job.id
    );
    const materials = order?.lines.map((line) => `${productLabel(state, line.productUnitId)} · ${formatQuantity(line.quantity)}`).join("; ") || "Thông tin hàng giao đang cập nhật";
    const action = job.status !== "in_transit"
      ? <span key={`${job.id}-status`} className="muted">{
          job.status === "assigned"
            ? "Chờ tài xế bốc hàng và xuất bến"
            : job.status === "loading"
              ? "Tài xế đang bốc hàng"
              : job.status === "delivered"
                ? "Đã hoàn tất"
                : "Chờ điều phối cập nhật chuyến"
        }</span>
      : job.quantityChangeRequest?.status === "pending"
        ? <span key={`${job.id}-difference`} className="muted">Đã báo chênh lệch, chờ duyệt</span>
        : pendingCompletion
          ? <span key={`${job.id}-completion`} className="muted">Đã gửi xác nhận giao, chờ duyệt</span>
          : <div key={`${job.id}-actions`} className="table-actions">
              <WorkflowActionButton operation="requestDeliveryQuantityChange" state={state} runOperation={runOperation} isPending={isPending} label="Báo chênh lệch" targetId={job.id} />
              <WorkflowActionButton operation="submitDeliveryCompletion" state={state} runOperation={runOperation} isPending={isPending} label="Chụp ảnh xác nhận giao" targetId={job.id} />
            </div>;
    return [
      job.documentNo,
      state.vehicles.find((vehicle) => vehicle.id === job.vehicleId)?.plateNumber ?? "Xe được phân công",
      materials,
      statusText(job.status),
      action
    ];
  });

  return <div className="workbench-grid">
    <section className="panel span-12">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Chuyến giao của tôi</h3>
          <p className="panel-note">Số lượng do cửa hàng duyệt. Nếu hàng thiếu hoặc thừa, bấm “Báo chênh lệch”. Không tự sửa số lượng.</p>
        </div>
        <Link className="button button-small" href="/giao-hang/theo-doi">Xem hành trình</Link>
      </div>
      <div className="panel-body">
        <DataTable
          headers={["Chuyến", "Xe", "Hàng cần giao", "Trạng thái", "Thao tác"]}
          rows={rows}
          emptyText="Bạn chưa được phân công chuyến giao nào."
        />
      </div>
    </section>
  </div>;
}


export function DeliveryJobForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const drivers = state.employees.filter((employee) => employee.roleType === "driver" && employee.status === "active");
  const vehicles = state.vehicles.filter((vehicle) => vehicle.status === "active");
  const eligibleOrders = state.salesOrders.filter((order) =>
    (order.status === "allocated" || order.status === "partially_delivered") &&
    order.lines.some((line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity) &&
    !state.deliveryJobs.some((job) => job.salesOrderId === order.id && ["assigned", "loading", "in_transit"].includes(job.status))
  );
  const { register, handleSubmit, reset } = useForm<{ salesOrderId: string; driverId: string; vehicleId: string; plannedDate: string }>({
    defaultValues: {
      salesOrderId: eligibleOrders[0]?.id ?? "",
      driverId: drivers[0]?.id ?? "",
      vehicleId: vehicles[0]?.id ?? "",
      plannedDate: localDateValue()
    }
  });
  const disabled = isPending || eligibleOrders.length === 0 || drivers.length === 0 || vehicles.length === 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Tạo chuyến giao</h3>
          <p className="panel-note">Chuyến mới ở trạng thái đã phân công, chưa ghi xuất kho.</p>
        </div>
      </div>
      <div className="panel-body">
        <form
          className="command-form"
          noValidate
          onSubmit={handleSubmit((values) => {
            createCommand({ type: "createDeliveryJob", ...values });
            reset({ salesOrderId: values.salesOrderId, driverId: values.driverId, vehicleId: values.vehicleId, plannedDate: values.plannedDate });
          })}
        >
          <FormField label="Đơn bán">
            <select className="input" {...register("salesOrderId", { required: true })}>
              {eligibleOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.documentNo} · {partyName(state, order.customerId)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Tài xế">
            <select className="input" {...register("driverId", { required: true })}>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Xe giao hàng">
            <select className="input" {...register("vehicleId", { required: true })}>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.code} · {vehicle.plateNumber} · {formatQuantity(vehicle.capacityTons)} tấn
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Ngày giao">
            <input className="input" type="date" {...register("plannedDate", { required: true })} />
          </FormField>
          <SubmitButton label="Tạo chuyến" command="createDeliveryJob" isPending={isPending} disabled={disabled} />
        </form>
      </div>
    </section>
  );
}
