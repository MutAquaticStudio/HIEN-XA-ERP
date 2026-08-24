"use client";

import { useContext, useRef, useState, useTransition } from "react";
import { recordInventoryCountLineWithEvidenceAction } from "@/app/actions";
import { MutationIntentRegistry } from "@/components/erp-v2/mutation-intent-registry";
import { formatMoney, formatQuantity } from "@/lib/format";
import { getSelectableProducts, getSelectableWarehouses, productLabel } from "@/modules/operations/selectors";
import type { OperationsState } from "@/modules/operations/types";
import { OperationsActorContext, type OperationHandler } from "./operations-contract";
import { FormField, StatusBadge } from "./operations-shared";

export function InventoryCountSessionPanel({ state, runOperation, isPending }: { state: OperationsState; runOperation: OperationHandler; isPending: boolean }) {
  const actor = useContext(OperationsActorContext);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string }>();
  const countLineIntents = useRef(new MutationIntentRegistry());
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

  function saveCountLine(formData: FormData) {
    const sessionId = String(formData.get("sessionId") ?? "");
    const lineId = String(formData.get("lineId") ?? "");
    const scope = `inventory-count-line:${sessionId}:${lineId}`;
    const attachment = formData.get("attachment");
    const payload = {
      countedQuantity: formData.get("countedQuantity"),
      reason: formData.get("reason"),
      expectedVersion: formData.get("expectedVersion"),
      attachment: attachment instanceof File && attachment.size > 0 ? attachment : undefined
    };
    const intent = countLineIntents.current.begin(scope, payload, () => crypto.randomUUID());
    if (!intent.shouldExecute) return;
    formData.set("idempotencyKey", intent.idempotencyKey);
    setFeedback(undefined);
    startSaving(async () => {
      try {
        const result = await recordInventoryCountLineWithEvidenceAction(formData);
        if (!result.ok) {
          countLineIntents.current.retainForRetry(scope, intent.idempotencyKey);
          setFeedback({ type: "error", text: result.error });
          return;
        }
        countLineIntents.current.complete(scope, intent.idempotencyKey);
        setFeedback({ type: "success", text: result.summary });
      } catch {
        countLineIntents.current.retainForRetry(scope, intent.idempotencyKey);
        setFeedback({ type: "error", text: "Không thể xác nhận kết quả lưu. Hãy thử lại; hệ thống sẽ dùng cùng mã chống ghi trùng." });
      }
    });
  }

  return <section className="panel">
    <div className="panel-header"><div><h3 className="panel-title">Phiếu kiểm kê theo kho</h3><p className="panel-note">Đếm hàng trước, gửi duyệt sau. Chênh lệch chỉ được ghi kho khi đã kiểm tra lại.</p></div></div>
    <div className="panel-body">
      {feedback ? <p className={`feedback feedback-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.text}</p> : null}
      {canCount ? <form className="command-form" onSubmit={(event) => { event.preventDefault(); const warehouseId = String(new FormData(event.currentTarget).get("warehouseId") ?? ""); runOperation("createInventoryCountSession", undefined, { warehouseId }); }}>
        <FormField label="Kho cần kiểm"><select className="input" name="warehouseId" defaultValue={allowedWarehouses[0]?.id ?? ""}>{allowedWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></FormField>
        <button className="button button-primary" type="submit" disabled={isPending || allowedWarehouses.length === 0}>Tạo phiếu kiểm kê</button>
      </form> : <p className="muted">Tài khoản này chỉ được xem phiếu kiểm kê trong phạm vi được cấp.</p>}
      {sessions.length === 0 ? <p className="empty-state">Chưa có phiếu kiểm kê. Tạo phiếu mới để bắt đầu đếm hàng theo kho.</p> : sessions.slice().reverse().map((session) => <section className="entity-panel" key={session.id}>
        <div className="entity-panel-header"><div><strong>{session.documentNo}</strong><p className="muted">{state.warehouses.find((warehouse) => warehouse.id === session.warehouseId)?.name ?? session.warehouseId} · phiên bản {session.version}</p></div><StatusBadge value={session.status} tone={session.status === "posted" ? "success" : "warning"} /></div>
        {["draft", "counting", "needs_recount"].includes(session.status) && canCount ? <form className="command-form" onSubmit={(event) => { event.preventDefault(); const productUnitId = String(new FormData(event.currentTarget).get("productUnitId") ?? ""); runOperation("addInventoryCountLine", session.id, { expectedVersion: session.version, productUnitId }); }}><FormField label="Thêm vật tư chưa có trên sổ"><select className="input" name="productUnitId" disabled={isPending || products.length === 0} defaultValue=""><option value="" disabled>{products.length === 0 ? "Không có vật tư đang hoạt động" : "Chọn vật tư"}</option>{products.filter((product) => !session.lines.some((line) => line.productUnitId === product.id)).map((product) => <option key={product.id} value={product.id}>{productLabel(state, product.id)}</option>)}</select></FormField><button className="button" type="submit" disabled={isPending || products.length === 0}>Thêm dòng kiểm kê</button></form> : null}
        <div className="stack-list">
          {session.lines.map((line) => <article className="workflow-action" key={line.id}>
            <strong>{productLabel(state, line.productUnitId)}</strong><p className="muted">Tồn sổ lúc bắt đầu: {formatQuantity(line.bookQuantity)} · Trạng thái: {line.status}</p>
            {canSeeValue && line.estimatedDifferenceValue !== undefined ? <p className="muted">Giá trị chênh lệch ước tính: {formatMoney(Math.abs(line.estimatedDifferenceValue))}</p> : null}
            {["pending", "needs_recount"].includes(line.status) && ["draft", "counting", "needs_recount"].includes(session.status) && canCount ? <form action={saveCountLine} className="command-form"><input type="hidden" name="sessionId" value={session.id} /><input type="hidden" name="lineId" value={line.id} /><input type="hidden" name="expectedVersion" value={session.version} /><FormField label="Số đếm thực tế"><input className="input" name="countedQuantity" type="number" min="0" step="0.001" required /></FormField><FormField label="Lý do khi có chênh lệch"><textarea className="input" name="reason" rows={2} placeholder="Ví dụ: hàng vỡ khi xếp kho" /></FormField><FormField label="Ảnh hoặc biên bản khi có chênh lệch"><input className="input" name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" /></FormField><button className="button button-primary" type="submit" disabled={isPending || isSaving}>Lưu số đếm</button><button className="button" type="button" disabled={isPending || isSaving} onClick={() => runOperation("recordInventoryCountLine", session.id, { expectedVersion: session.version, productUnitId: line.id, skipCountLine: true })}>Bỏ qua dòng</button></form> : null}
            {line.status === "counted" ? <p className="feedback feedback-success">Đã đếm {formatQuantity(line.countedQuantity ?? 0)}{line.differenceQuantity ? ` · chênh lệch ${line.differenceQuantity > 0 ? "+" : ""}${formatQuantity(line.differenceQuantity)}` : " · khớp tồn sổ"}</p> : null}
          </article>)}
        </div>
        <div className="table-actions">
          {["draft", "counting", "needs_recount"].includes(session.status) && actor.permissions.includes("inventory.submit_count_session") ? <button className="button button-primary" disabled={isPending} onClick={() => runOperation("submitInventoryCountSession", session.id, { expectedVersion: session.version })}>Gửi chờ duyệt</button> : null}
          {session.status === "submitted" && canApprove ? <button className="button button-primary" disabled={isPending} onClick={() => runOperation("approveInventoryCountSession", session.id, { expectedVersion: session.version })}>Duyệt và ghi kho</button> : null}
          {["submitted", "needs_recount"].includes(session.status) && canReject ? <InventoryReasonAction operation="requestInventoryCountRecount" label="Yêu cầu kiểm lại" description="Phiếu chuyển về trạng thái cần kiểm lại; chưa ghi thay đổi vào tồn kho." sessionId={session.id} expectedVersion={session.version} runOperation={runOperation} isPending={isPending} /> : null}
          {["submitted", "needs_recount"].includes(session.status) && canReject ? <InventoryReasonAction operation="rejectInventoryCountSession" label="Từ chối" description="Phiếu bị từ chối và không tạo phát sinh kho." sessionId={session.id} expectedVersion={session.version} runOperation={runOperation} isPending={isPending} danger /> : null}
          {session.status === "posted" && canReverse ? <InventoryReasonAction operation="reverseInventoryCountSession" label="Đảo phiếu" description="Hệ thống tạo phát sinh đảo append-only; không xóa hoặc sửa phát sinh kiểm kê đã ghi." sessionId={session.id} expectedVersion={session.version} runOperation={runOperation} isPending={isPending} danger /> : null}
        </div>
      </section>)}
    </div>
  </section>;
}

function InventoryReasonAction({ operation, label, description, sessionId, expectedVersion, runOperation, isPending, danger = false }: {
  operation: "requestInventoryCountRecount" | "rejectInventoryCountSession" | "reverseInventoryCountSession";
  label: string;
  description: string;
  sessionId: string;
  expectedVersion: number;
  runOperation: OperationHandler;
  isPending: boolean;
  danger?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  if (!expanded) return <button className={`button${danger ? " button-danger" : ""}`} type="button" disabled={isPending} onClick={() => setExpanded(true)}>{label}</button>;
  return <form className="command-form workflow-action" onSubmit={(event) => {
    event.preventDefault();
    if (reason.trim().length < 5) return;
    runOperation(operation, sessionId, { expectedVersion, reason: reason.trim() }, () => { setExpanded(false); setReason(""); });
  }}>
    <p className="panel-note">{description}</p>
    <FormField label={`Lý do ${label.toLocaleLowerCase("vi-VN")}`}><textarea className="input" value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} rows={2} required autoFocus /></FormField>
    <div className="table-actions"><button className={`button${danger ? " button-danger" : " button-primary"}`} type="submit" disabled={isPending || reason.trim().length < 5}>Xác nhận {label.toLocaleLowerCase("vi-VN")}</button><button className="button" type="button" disabled={isPending} onClick={() => { setExpanded(false); setReason(""); }}>Hủy</button></div>
  </form>;
}
