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
  getSelectableEmployees,
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

export function WorkforceView({
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
      {actor.role === "worker" ? (
        <OpenWorkOrderClaimPanel state={state} runOperation={runOperation} isPending={isPending} />
      ) : null}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Sản lượng và tiền công</h3>
            <p className="panel-note">Output đã compensated không được tính lại.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={["Phiếu", "Công việc", "Sản lượng", "Duyệt", "Trạng thái", "Hành động"]}
            rows={state.workOrders.flatMap((order) =>
              order.outputs.map((output) => [
                order.documentNo,
                order.workType,
                `${formatQuantity(output.actualQuantity)} ${productLabel(state, output.productUnitId)}`,
                formatQuantity(output.approvedQuantity),
                statusText(order.status),
                order.status === "submitted" ? (
                  <WorkflowActionButton key="approve" operation="approveWorkOutput" state={state} runOperation={runOperation} isPending={isPending} label="Duyệt" targetId={order.id} />
                ) : order.status === "approved" ? (
                  <WorkflowActionButton key="post" operation="postCompensation" state={state} runOperation={runOperation} isPending={isPending} label="Ghi công" targetId={order.id} />
                ) : (
                  <span key="done" className="muted">Đã xử lý</span>
                )
              ])
            )}
          />
          <h4 className="section-heading">Sổ tiền công nhân viên</h4>
          <DataTable
            headers={["Nhân viên", "Chứng từ", "Tăng phải trả", "Giảm phải trả", "Số dư"]}
            rows={state.employeeLedgerEntries.map((entry) => [
              partyName(state, entry.employeeId),
              entry.sourceDocument,
              entry.direction === "credit" ? formatMoney(entry.amount) : "",
              entry.direction === "debit" ? formatMoney(entry.amount) : "",
              formatMoney(employeeBalance(state, entry.employeeId))
            ])}
            emptyText="Chưa có dòng tiền công. Duyệt sản lượng và ghi nhận bảng công để phát sinh."
          />
          <h4 className="section-heading">Phiếu thanh toán nhân viên</h4>
          <DataTable
            headers={["Phiếu", "Nhân viên", "Số tiền", "Trạng thái", "Hành động"]}
            rows={state.employeePayments.map((payment) => [
              payment.documentNo,
              partyName(state, payment.employeeId),
              formatMoney(payment.amount),
              statusText(payment.status),
              payment.status === "draft" ? (
                <WorkflowActionButton key="pay" operation="payEmployee" state={state} runOperation={runOperation} isPending={isPending} label="Thanh toán" targetId={payment.id} />
              ) : payment.status === "confirmed" ? (
                <div key="actions" className="table-actions">
                  <span className="muted">Đã thanh toán</span>
                  <WorkflowActionButton operation="reverseEmployeePayment" state={state} runOperation={runOperation} isPending={isPending} label="Đảo phiếu" targetId={payment.id} />
                </div>
              ) : (
                <span key="done" className="muted">Đã đảo</span>
              )
            ])}
          />
          <h4 className="section-heading">Phiếu tạm ứng nhân viên</h4>
          <DataTable
            headers={["Phiếu", "Nhân viên", "Mục đích", "Số tiền", "Trạng thái", "Hành động"]}
            rows={state.employeeAdvances.map((advance) => [
              advance.documentNo,
              partyName(state, advance.employeeId),
              advance.purpose,
              formatMoney(advance.amount),
              statusText(advance.status),
              advance.status === "draft" ? (
                <WorkflowActionButton key="confirm" operation="confirmEmployeeAdvance" state={state} runOperation={runOperation} isPending={isPending} label="Xác nhận" targetId={advance.id} />
              ) : advance.status === "confirmed" ? (
                <WorkflowActionButton key="reverse" operation="reverseEmployeeAdvance" state={state} runOperation={runOperation} isPending={isPending} label="Đảo phiếu" targetId={advance.id} />
              ) : (
                <span key="done" className="muted">Đã đảo</span>
              )
            ])}
            emptyText="Chưa có phiếu tạm ứng nhân viên."
          />
        </div>
      </section>
      <div className="side-stack">
        <WorkOrderDraftForm state={state} createCommand={createCommand} isPending={isPending} />
        <EmployeePaymentDraftForm state={state} createCommand={createCommand} isPending={isPending} />
        <EmployeeAdvanceDraftForm state={state} createCommand={createCommand} isPending={isPending} />
      </div>
    </div>
  );
}

export function OpenWorkOrderClaimPanel({
  state,
  runOperation,
  isPending
}: {
  state: OperationsState;
  runOperation: OperationHandler;
  isPending: boolean;
}) {
  const openOrders = state.workOrders.filter((order) => order.status === "open" && Boolean(order.salesOrderId));
  const assignedOrders = state.workOrders.filter((order) => order.status === "assigned" && Boolean(order.salesOrderId));

  return (
    <>
      <section className="panel span-12">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Việc mới</h3>
            <p className="panel-note">Người bấm nhận trước sẽ được giao việc.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={['Mã việc', 'Mã đơn', 'Việc cần làm', 'Ngày', 'Tình trạng', 'Thao tác']}
            rows={openOrders.map((order) => [
              order.documentNo,
              order.sourceDocument,
              salesOrderWorkType(order),
              order.workDate,
              statusText(order.status),
              <WorkflowActionButton
                key={order.id}
                operation="claimOpenSalesWorkOrder"
                state={state}
                runOperation={runOperation}
                isPending={isPending}
                label="Nhận việc"
                targetId={order.id}
              />
            ])}
            emptyText="Chưa có việc mới. Khi có việc, danh sách sẽ tự hiện."
          />
        </div>
      </section>
      <section className="panel span-12">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Việc của tôi</h3>
            <p className="panel-note">Chỉ hiện những việc bạn đang làm.</p>
          </div>
        </div>
        <div className="panel-body">
          <DataTable
            headers={['Mã việc', 'Mã đơn', 'Việc cần làm', 'Ngày', 'Tình trạng', 'Thao tác']}
            rows={assignedOrders.map((order) => [
              order.documentNo,
              order.sourceDocument,
              salesOrderWorkType(order),
              order.workDate,
              statusText(order.status),
              <WorkflowActionButton
                key={`${order.id}-location`}
                operation="recordWorkOrderLocation"
                state={state}
                runOperation={runOperation}
                isPending={isPending}
                label="Gửi vị trí"
                targetId={order.id}
              />
            ])}
            emptyText="Bạn chưa có việc nào."
          />
        </div>
      </section>
    </>
  );
}

export function salesOrderWorkType(order: { salesOrderId?: string; workType: string }) {
  return order.salesOrderId
    ? "\u004e\u0068\u1ead\u006e \u0076\u00e0 \u0063\u0068\u0075\u1ea9\u006e \u0062\u1ecb \u0111\u01a1\u006e \u0067\u0069\u0061\u006f \u0068\u00e0\u006e\u0067"
    : order.workType;
}

export function EmployeePaymentDraftForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const employees = getSelectableEmployees(state, actor);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<{ employeeId: string; amount: number }>({
    defaultValues: { employeeId: employees[0]?.id ?? "", amount: 0 }
  });
  const employeeId = watch("employeeId");
  const payable = employeeId ? employeeBalance(state, employeeId) : 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Phiếu thanh toán nhân viên</h3>
          <p className="panel-note">Công còn phải trả: {formatMoney(payable)}. Phiếu nháp chưa giảm quỹ.</p>
        </div>
      </div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => {
          createCommand({ type: "createEmployeePaymentDraft", employeeId: values.employeeId, amount: values.amount });
          reset({ employeeId: values.employeeId, amount: 0 });
        })}>
          <FormField label="Nhân viên">
            <select className="input" {...register("employeeId", { required: "Chọn nhân viên." })}>
              {employees.length === 0 ? <option value="" disabled>Không có nhân viên đủ điều kiện</option> : null}
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.code} · {employee.displayName}</option>)}
            </select>
          </FormField>
          <FormField label="Số tiền" error={errors.amount?.message}>
            <input className="input" type="number" min="1" step="1000" {...register("amount", {
              valueAsNumber: true,
              min: { value: 1, message: "Số tiền phải lớn hơn 0." }
            })} />
          </FormField>
          <SubmitButton label="Tạo phiếu thanh toán" command="createEmployeePaymentDraft" isPending={isPending} disabled={isPending || employees.length === 0} />
        </form>
      </div>
    </section>
  );
}

export function EmployeeAdvanceDraftForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const employees = getSelectableEmployees(state, actor);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    employeeId: string;
    purpose: string;
    amount: number;
  }>({ defaultValues: { employeeId: employees[0]?.id ?? "", purpose: "", amount: 0 } });

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Phiếu tạm ứng nhân viên</h3>
          <p className="panel-note">Phiếu nháp chưa làm giảm quỹ; khi xác nhận sẽ khấu trừ vào số dư sổ nhân viên.</p>
        </div>
      </div>
      <div className="panel-body">
        <form className="command-form" noValidate onSubmit={handleSubmit((values) => {
          createCommand({ type: "createEmployeeAdvanceDraft", ...values });
          reset({ employeeId: values.employeeId, purpose: "", amount: 0 });
        })}>
          <FormField label="Nhân viên">
            <select className="input" {...register("employeeId", { required: "Chọn nhân viên." })}>
              {employees.length === 0 ? <option value="" disabled>Không có nhân viên đủ điều kiện</option> : null}
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.code} · {employee.displayName}</option>)}
            </select>
          </FormField>
          <FormField label="Mục đích" error={errors.purpose?.message}>
            <input className="input" {...register("purpose", { required: "Nhập mục đích tạm ứng." })} />
          </FormField>
          <FormField label="Số tiền" error={errors.amount?.message}>
            <input className="input" type="number" min="1" step="1000" {...register("amount", {
              valueAsNumber: true,
              min: { value: 1, message: "Số tiền phải lớn hơn 0." }
            })} />
          </FormField>
          <SubmitButton label="Tạo phiếu tạm ứng" command="createEmployeeAdvanceDraft" isPending={isPending} disabled={isPending || employees.length === 0} />
        </form>
      </div>
    </section>
  );
}


export function WorkerWorkforceView({
  state,
  runOperation,
  isPending
}: {
  state: OperationsState;
  runOperation: OperationHandler;
  isPending: boolean;
}) {
  const assignedWorkOrders = state.workOrders.filter((order) => order.status !== "open");
  return <div className="workbench-grid">
    <OpenWorkOrderClaimPanel state={state} runOperation={runOperation} isPending={isPending} />
    <section className="panel span-12">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Công việc đang thực hiện</h3>
          <p className="panel-note">Chỉ hiện việc của bạn. Vị trí chỉ được gửi khi bạn bấm nút.</p>
        </div>
      </div>
      <div className="panel-body">
        <DataTable
          headers={["Mã việc", "Công việc", "Ngày", "Trạng thái", "Thao tác"]}
          rows={assignedWorkOrders.map((order) => [
            order.documentNo,
            salesOrderWorkType(order),
            order.workDate,
            statusText(order.status),
            order.status === "assigned"
              ? <WorkflowActionButton key={`${order.id}-location`} operation="recordWorkOrderLocation" state={state} runOperation={runOperation} isPending={isPending} label="Ghi vị trí hiện tại" targetId={order.id} />
              : <span key={`${order.id}-locked`} className="muted">Đã ghi nhận</span>
          ])}
          emptyText="Bạn chưa có công việc đang thực hiện."
        />
      </div>
    </section>
    <section className="panel span-12">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Công và thanh toán của tôi</h3>
          <p className="panel-note">Tiền công chỉ được tính sau khi cửa hàng duyệt số lượng bạn đã làm.</p>
        </div>
      </div>
      <div className="panel-body">
        <DataTable
          headers={["Phiếu tính công", "Công việc", "Tiền công của tôi", "Trạng thái"]}
          rows={state.compensationBatches.map((batch) => [
            batch.documentNo,
            state.workOrders.find((order) => order.id === batch.workOrderId)?.workType ?? batch.workOrderId,
            formatMoney(batch.totalAmount),
            statusText(batch.status)
          ])}
          emptyText="Chưa có bảng công nào được duyệt cho bạn."
        />
        <h4 className="section-heading">Tạm ứng và thanh toán</h4>
        <DataTable
          headers={["Chứng từ", "Loại", "Số tiền", "Trạng thái"]}
          rows={[
            ...state.employeeAdvances.map((advance) => [advance.documentNo, "Tạm ứng", formatMoney(advance.amount), statusText(advance.status)]),
            ...state.employeePayments.map((payment) => [payment.documentNo, "Thanh toán công", formatMoney(payment.amount), statusText(payment.status)])
          ]}
          emptyText="Chưa có phiếu tạm ứng hoặc thanh toán nào của bạn."
        />
      </div>
    </section>
  </div>;
}


export function WorkOrderDraftForm({
  state,
  createCommand,
  isPending
}: {
  state: OperationsState;
  createCommand: CreateCommandHandler;
  isPending: boolean;
}) {
  const actor = useContext(OperationsActorContext);
  const activeEmployees = getSelectableEmployees(state, actor);
  const products = getSelectableProducts(state);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors }
  } = useForm<{ employeeId: string; productUnitId: string; actualQuantity: number; totalAmount: number }>({
    defaultValues: {
      employeeId: activeEmployees[0]?.id ?? "",
      productUnitId: products[0]?.id ?? "",
      actualQuantity: 1,
      totalAmount: 0
    }
  });
  const selectedProductUnitId = watch("productUnitId");
  const disabled = isPending || activeEmployees.length === 0 || products.length === 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Tạo phiếu công</h3>
          <p className="panel-note">Sản lượng phải được duyệt trước khi ghi nhận bảng công.</p>
        </div>
      </div>
      <div className="panel-body">
        <form
          className="command-form"
          noValidate
          onSubmit={handleSubmit((values) => {
            createCommand({
              type: "createWorkOrderDraft",
              employeeId: values.employeeId,
              productUnitId: values.productUnitId,
              actualQuantity: values.actualQuantity,
              totalAmount: values.totalAmount
            });
            reset({
              employeeId: values.employeeId,
              productUnitId: values.productUnitId,
              actualQuantity: 1,
              totalAmount: 0
            });
          })}
        >
          <FormField label="Nhân viên">
            <select className="input" {...register("employeeId", { required: true })}>
              {activeEmployees.length === 0 ? <option value="" disabled>Không có nhân viên đủ điều kiện</option> : null}
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.displayName} · {roleText(employee.roleType)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Sản lượng">
            <select className="input" {...register("productUnitId", { required: true })}>
              {products.length === 0 ? <option value="" disabled>Không có vật tư đang hoạt động</option> : null}
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {productLabel(state, product.id)}
                </option>
              ))}
            </select>
          </FormField>
          <ProductCatalogPreview state={state} productUnitId={selectedProductUnitId} />
          <FormField label="Số lượng thực tế" error={errors.actualQuantity?.message}>
            <input
              className="input"
              type="number"
              min="0.001"
              step="0.001"
              {...register("actualQuantity", {
                valueAsNumber: true,
                min: { value: 0.001, message: "Sản lượng phải lớn hơn 0." }
              })}
            />
          </FormField>
          <FormField label="Tổng tiền công" error={errors.totalAmount?.message}>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              {...register("totalAmount", {
                valueAsNumber: true,
                min: { value: 1, message: "Tổng tiền công phải lớn hơn 0." }
              })}
            />
          </FormField>
          <SubmitButton label="Tạo phiếu công" command="createWorkOrderDraft" isPending={isPending} disabled={disabled} />
        </form>
      </div>
    </section>
  );
}


