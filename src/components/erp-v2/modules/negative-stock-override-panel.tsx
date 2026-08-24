"use client";

import { useContext, useState } from "react";
import { useForm } from "react-hook-form";
import { getSelectableWarehouses, productLabel } from "@/modules/operations/selectors";
import type { OperationsState } from "@/modules/operations/types";
import { OperationsActorContext, type OperationHandler } from "./operations-contract";
import { DataTable, FormField, StatusBadge } from "./operations-shared";

export function NegativeStockOverridePanel({ state, runOperation, isPending }: { state: OperationsState; runOperation: OperationHandler; isPending: boolean }) {
  const actor = useContext(OperationsActorContext);
  const canRequest = actor.permissions.includes("inventory.request_negative_stock_override");
  const canApprove = actor.role === "owner" && actor.permissions.includes("inventory.approve_negative_stock_override");
  const canReject = actor.role === "owner" && actor.permissions.includes("inventory.reject_negative_stock_override");
  const confirmedOrders = state.salesOrders.filter((order) => order.status === "confirmed");
  const warehouses = getSelectableWarehouses(state, actor);
  const pending = state.approvalRequests.filter((request) => request.type === "negative_stock_override" && request.status === "pending");
  const [rejectingRequestId, setRejectingRequestId] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<{ salesOrderId: string; warehouseId: string; reason: string }>({
    defaultValues: { salesOrderId: confirmedOrders[0]?.id ?? "", warehouseId: warehouses[0]?.id ?? "", reason: "Tồn thực tế đang chờ đối chiếu tại kho" }
  });
  const selectedOrder = state.salesOrders.find((order) => order.id === watch("salesOrderId"));
  if (!canRequest && !canApprove && pending.length === 0) return null;

  return <section className="panel negative-stock-override-panel">
    <div className="panel-header"><div><h3 className="panel-title">Ngoại lệ tồn âm có kiểm soát</h3><p className="panel-note">Request và approval không tạo movement. Chỉ chuyến giao đã duyệt mới được issue âm theo đúng allocation.</p></div></div>
    <div className="panel-body side-stack">
      {canRequest ? <form className="command-form" noValidate onSubmit={handleSubmit((values) => {
        const order = state.salesOrders.find((item) => item.id === values.salesOrderId);
        runOperation("requestNegativeStockOverride", values.salesOrderId, { expectedVersion: order?.version, warehouseId: values.warehouseId, reason: values.reason }, () => reset({ ...values, reason: "Tồn thực tế đang chờ đối chiếu tại kho" }));
      })}>
        <FormField label="Đơn bán chờ nguồn"><select className="input" disabled={isPending || confirmedOrders.length === 0} {...register("salesOrderId", { required: "Chọn đơn bán." })}>{confirmedOrders.length === 0 ? <option value="">Không có đơn chờ phân bổ</option> : confirmedOrders.map((order) => <option value={order.id} key={order.id}>{order.documentNo} · v{order.version}</option>)}</select></FormField>
        <FormField label="Kho chính"><select className="input" disabled={isPending || warehouses.length === 0} {...register("warehouseId", { required: "Chọn kho." })}>{warehouses.length === 0 ? <option value="">Không có kho trong phạm vi</option> : warehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></FormField>
        <FormField label="Lý do" error={errors.reason?.message}><textarea className="input" rows={3} {...register("reason", { required: "Nhập lý do.", minLength: { value: 5, message: "Lý do phải có ít nhất 5 ký tự." } })} /></FormField>
        {selectedOrder ? <p className="panel-note">Server sẽ tính lại phần thiếu cho {selectedOrder.lines.map((line) => productLabel(state, line.productUnitId)).join(", ")} tại revision hiện tại.</p> : null}
        <button className="button button-primary" type="submit" disabled={isPending || !selectedOrder || warehouses.length === 0}>Gửi Owner duyệt</button>
      </form> : null}
      <DataTable headers={["Yêu cầu", "Đơn bán", "Phần thiếu", "Lý do", "Trạng thái", "Hành động"]} emptyText="Không có yêu cầu tồn âm đang chờ duyệt." rows={pending.map((request) => [
        request.documentNo,
        state.salesOrders.find((order) => order.id === request.targetId)?.documentNo ?? request.targetId,
        (request.negativeStockLines ?? []).map((line) => `${productLabel(state, line.productUnitId)}: ${line.quantity}`).join(" · "),
        request.reason ?? "—",
        <StatusBadge key="status" value="Chờ Owner" tone="warning" />,
        canApprove || canReject ? <div className="table-actions" key="actions">
          {canApprove ? <button className="button button-small button-primary" type="button" disabled={isPending} onClick={() => runOperation("approveNegativeStockOverride", request.id)}>Duyệt</button> : null}
          {canReject && rejectingRequestId !== request.id ? <button className="button button-small" type="button" disabled={isPending} onClick={() => { setRejectingRequestId(request.id); setRejectionReason(""); }}>Từ chối</button> : null}
          {canReject && rejectingRequestId === request.id ? <form className="command-form workflow-action" aria-label={`Từ chối ${request.documentNo}`} onSubmit={(event) => {
            event.preventDefault();
            if (rejectionReason.trim().length < 5) return;
            runOperation("rejectNegativeStockOverride", request.id, { reason: rejectionReason.trim() }, () => { setRejectingRequestId(""); setRejectionReason(""); });
          }}><label className="form-field"><span>Lý do từ chối</span><textarea className="input" rows={2} minLength={5} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} required autoFocus /></label><div className="table-actions"><button className="button button-small button-danger" type="submit" disabled={isPending || rejectionReason.trim().length < 5}>Xác nhận từ chối</button><button className="button button-small" type="button" disabled={isPending} onClick={() => { setRejectingRequestId(""); setRejectionReason(""); }}>Hủy</button></div></form> : null}
        </div> : <span key="wait" className="muted">Chờ Chủ cửa hàng</span>
      ])} />
    </div>
  </section>;
}
