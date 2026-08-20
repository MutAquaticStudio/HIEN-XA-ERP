"use client";

import { useContext, useState, useTransition } from "react";
import { recordInventoryCountLineWithEvidenceAction } from "@/app/actions";
import { formatMoney, formatQuantity } from "@/lib/format";
import { getSelectableProducts, getSelectableWarehouses, productLabel } from "@/modules/operations/selectors";
import type { OperationsState } from "@/modules/operations/types";
import { OperationsActorContext, type OperationHandler } from "./operations-contract";
import { FormField, StatusBadge } from "./operations-shared";

export function InventoryCountSessionPanel({ state, runOperation, isPending }: { state: OperationsState; runOperation: OperationHandler; isPending: boolean }) {
  const actor = useContext(OperationsActorContext);
  const [message, setMessage] = useState<string | undefined>();
  const [isSaving, startSaving] = useTransition();
  const allowedWarehouses = getSelectableWarehouses(state, actor);
  const products = getSelectableProducts(state);
  const allowedWarehouseIds = new Set(allowedWarehouses.map((warehouse) => warehouse.id));
  const sessions = (state.inventoryCountSessions ?? []).filter((session) => allowedWarehouseIds.has(session.warehouseId));
  const canCount = (actor.permissions.includes("inventory.create_count_session") || actor.permissions.includes("inventory.record_count_line")) && products.length > 0;
  const canApprove = actor.permissions.includes("inventory.approve_count_session");
  const canReject = actor.permissions.includes("inventory.reject_count_session");
  const canReverse = actor.permissions.includes("inventory.reverse_count_session");
  const canSeeValue = ["owner", "administrator", "accountant"].includes(actor.role);

  return <section className="panel">
    <div className="panel-header"><div><h3 className="panel-title">Phiếu kiểm kê theo kho</h3><p className="panel-note">Đếm hàng trước, gửi duyệt sau. Chênh lệch chỉ được ghi kho khi đã kiểm tra lại.</p></div></div>
    <div className="panel-body">
      {message ? <p className="feedback feedback-success" role="status">{message}</p> : null}
      {canCount ? <form className="command-form" onSubmit={(event) => { event.preventDefault(); const warehouseId = String(new FormData(event.currentTarget).get("warehouseId") ?? ""); runOperation("createInventoryCountSession", undefined, { warehouseId }); }}>
        <FormField label="Kho cần kiểm"><select className="input" name="warehouseId" defaultValue={allowedWarehouses[0]?.id ?? ""}>{allowedWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></FormField>
        <button className="button button-primary" type="submit" disabled={isPending || allowedWarehouses.length === 0}>Tạo phiếu kiểm kê</button>
      </form> : <p className="muted">Tài khoản này chỉ được xem phiếu kiểm kê trong phạm vi được cấp.</p>}
      {sessions.length === 0 ? <p className="empty-state">Chưa có phiếu kiểm kê. Tạo phiếu mới để bắt đầu đếm hàng theo kho.</p> : sessions.slice().reverse().map((session) => <section className="entity-panel" key={session.id}>
        <div className="entity-panel-header"><div><strong>{session.documentNo}</strong><p className="muted">{state.warehouses.find((warehouse) => warehouse.id === session.warehouseId)?.name ?? session.warehouseId} · phiên bản {session.version}</p></div><StatusBadge value={session.status} tone={session.status === "posted" ? "success" : "warning"} /></div>
        {["draft", "counting", "needs_recount"].includes(session.status) && canCount ? <form className="command-form" onSubmit={(event) => { event.preventDefault(); const productUnitId = String(new FormData(event.currentTarget).get("productUnitId") ?? ""); runOperation("addInventoryCountLine", session.id, { expectedVersion: session.version, productUnitId }); }}><FormField label="Thêm vật tư chưa có trên sổ"><select className="input" name="productUnitId" defaultValue=""><option value="" disabled>Chọn vật tư</option>{state.productUnits.filter((product) => !session.lines.some((line) => line.productUnitId === product.id)).map((product) => <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>)}</select></FormField><button className="button" type="submit" disabled={isPending}>Thêm dòng kiểm kê</button></form> : null}
        <div className="stack-list">
          {session.lines.map((line) => <article className="workflow-action" key={line.id}>
            <strong>{productLabel(state, line.productUnitId)}</strong><p className="muted">Tồn sổ lúc bắt đầu: {formatQuantity(line.bookQuantity)} · Trạng thái: {line.status}</p>
            {canSeeValue && line.estimatedDifferenceValue !== undefined ? <p className="muted">Giá trị chênh lệch ước tính: {formatMoney(Math.abs(line.estimatedDifferenceValue))}</p> : null}
            {["pending", "needs_recount"].includes(line.status) && ["draft", "counting", "needs_recount"].includes(session.status) && canCount ? <form action={(formData) => startSaving(async () => { const result = await recordInventoryCountLineWithEvidenceAction(formData); setMessage(result.ok ? result.summary : result.error); })} className="command-form"><input type="hidden" name="sessionId" value={session.id} /><input type="hidden" name="lineId" value={line.id} /><input type="hidden" name="expectedVersion" value={session.version} /><input type="hidden" name="idempotencyKey" value={`count-line-${crypto.randomUUID()}`} /><FormField label="Số đếm thực tế"><input className="input" name="countedQuantity" type="number" min="0" step="0.001" required /></FormField><FormField label="Lý do khi có chênh lệch"><textarea className="input" name="reason" rows={2} placeholder="Ví dụ: hàng vỡ khi xếp kho" /></FormField><FormField label="Ảnh hoặc biên bản khi có chênh lệch"><input className="input" name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" /></FormField><button className="button button-primary" type="submit" disabled={isPending || isSaving}>Lưu số đếm</button><button className="button" type="button" disabled={isPending || isSaving} onClick={() => runOperation("recordInventoryCountLine", session.id, { expectedVersion: session.version, productUnitId: line.id, skipCountLine: true })}>Bỏ qua dòng</button></form> : null}
            {line.status === "counted" ? <p className="feedback feedback-success">Đã đếm {formatQuantity(line.countedQuantity ?? 0)}{line.differenceQuantity ? ` · chênh lệch ${line.differenceQuantity > 0 ? "+" : ""}${formatQuantity(line.differenceQuantity)}` : " · khớp tồn sổ"}</p> : null}
          </article>)}
        </div>
        <div className="table-actions">
          {["draft", "counting", "needs_recount"].includes(session.status) && actor.permissions.includes("inventory.submit_count_session") ? <button className="button button-primary" disabled={isPending} onClick={() => runOperation("submitInventoryCountSession", session.id, { expectedVersion: session.version })}>Gửi chờ duyệt</button> : null}
          {session.status === "submitted" && canApprove ? <button className="button button-primary" disabled={isPending} onClick={() => runOperation("approveInventoryCountSession", session.id, { expectedVersion: session.version })}>Duyệt và ghi kho</button> : null}
          {["submitted", "needs_recount"].includes(session.status) && canReject ? <button className="button" disabled={isPending} onClick={() => runOperation("requestInventoryCountRecount", session.id, { expectedVersion: session.version, reason: "Cần kiểm lại số đếm và bằng chứng." })}>Yêu cầu kiểm lại</button> : null}
          {["submitted", "needs_recount"].includes(session.status) && canReject ? <button className="button button-danger" disabled={isPending} onClick={() => runOperation("rejectInventoryCountSession", session.id, { expectedVersion: session.version, reason: "Phiếu chưa đủ bằng chứng để duyệt." })}>Từ chối</button> : null}
          {session.status === "posted" && canReverse ? <button className="button button-danger" disabled={isPending} onClick={() => runOperation("reverseInventoryCountSession", session.id, { expectedVersion: session.version, reason: "Đảo phiếu kiểm kê theo yêu cầu kiểm soát." })}>Đảo phiếu</button> : null}
        </div>
      </section>)}
    </div>
  </section>;
}
