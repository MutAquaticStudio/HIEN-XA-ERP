"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  getOperationsSnapshotAction,
  importWorkbookDryRunAction,
  runDemoCreateCommandAction,
  runDemoCreateCommandWithImageAction,
  runDemoOperationAction,
  submitDeliveryCompletionWithImageAction,
  submitGoodsReceiptWithImageAction
} from "@/app/actions";
import type { CreateCommand, OperationName, OperationOptions, OperationsState } from "@/modules/operations/types";
import type { MutatingServerResult, SyncMeta } from "./operations-contract";

const realtimeSyncIntervalMs = 3000;

export function shouldApplyOperationsSnapshot(currentRevision: number, nextRevision: number) {
  return nextRevision >= currentRevision;
}

export function useOperationsRuntime(initialState: OperationsState, initialRevision: number, initialSyncedAt: string) {
  const [state, setState] = useState(initialState);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);
  const [syncMeta, setSyncMeta] = useState<SyncMeta>({ revision: initialRevision, syncedAt: initialSyncedAt, status: "live" });
  const [isPending, startTransition] = useTransition();
  const syncMetaRef = useRef(syncMeta);
  const isPendingRef = useRef(isPending);

  useEffect(() => { syncMetaRef.current = syncMeta; }, [syncMeta]);
  useEffect(() => { isPendingRef.current = isPending; }, [isPending]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const reloadForApplicationUpdate = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === "hx-app-version-changed") window.location.reload();
    };
    navigator.serviceWorker.addEventListener("message", reloadForApplicationUpdate);
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // PWA cache is read-only convenience; posting remains online-only.
    });
    return () => navigator.serviceWorker.removeEventListener("message", reloadForApplicationUpdate);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    async function syncDashboard() {
      if (inFlight || isPendingRef.current) return;
      inFlight = true;
      setSyncMeta((current) => ({ ...current, status: "syncing", error: undefined }));
      try {
        const snapshot = await getOperationsSnapshotAction();
        if (cancelled) return;
        const currentRevision = syncMetaRef.current.revision;
        if (snapshot.revision > currentRevision) {
          setState(snapshot.state);
          setSyncMeta({ revision: snapshot.revision, syncedAt: snapshot.syncedAt, status: "live" });
        } else if (snapshot.revision === currentRevision) {
          setSyncMeta({ revision: currentRevision, syncedAt: snapshot.syncedAt, status: "live" });
        } else {
          setSyncMeta((current) => ({ ...current, status: "live", error: undefined }));
        }
      } catch (error) {
        if (!cancelled) {
          setSyncMeta((current) => ({
            ...current,
            status: "error",
            error: "Không thể cập nhật dữ liệu ngay bây giờ. Hãy tải lại trang nếu lỗi tiếp diễn."
          }));
        }
      } finally {
        inFlight = false;
      }
    }
    const intervalId = window.setInterval(syncDashboard, realtimeSyncIntervalMs);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, []);

  function applyMutationResult(result: MutatingServerResult) {
    const currentRevision = syncMetaRef.current.revision;
    if (!shouldApplyOperationsSnapshot(currentRevision, result.revision)) return;
    setState(result.state);
    setSyncMeta({ revision: result.revision, syncedAt: result.syncedAt, status: "live" });
  }

  function runOperation(operation: OperationName, targetId?: string, options?: OperationOptions, onSuccess?: () => void, attachment?: File) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = operation === "submitGoodsReceipt" && attachment
          ? await (() => {
              const formData = new FormData();
              formData.set("targetId", targetId ?? "");
              formData.set("quantity", String(options?.quantity ?? ""));
              formData.set("receiptImage", attachment);
              return submitGoodsReceiptWithImageAction(formData);
            })()
          : operation === "submitDeliveryCompletion"
            ? await (() => {
                const formData = new FormData();
                formData.set("targetId", targetId ?? "");
                formData.set("recipientName", options?.recipientName ?? "");
                formData.set("evidence", options?.evidence ?? "");
                if (attachment) formData.set("deliveryImage", attachment);
                return submitDeliveryCompletionWithImageAction(formData);
              })()
            : await runDemoOperationAction({ operation, targetId, options, idempotencyKey: crypto.randomUUID() });
        if (!response.ok) { setFeedback({ type: "error", text: response.error }); return; }
        applyMutationResult(response.result);
        setFeedback({ type: response.result.severity, text: response.result.summary });
        onSuccess?.();
      } catch (error) {
        setFeedback({ type: "error", text: error instanceof Error ? error.message : "Không thể thực hiện thao tác." });
      }
    });
  }

  function runCreateCommand(command: CreateCommand, onSuccess?: () => void, attachment?: File) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = await (attachment && (command.type === "createSalesOrderDraft" || command.type === "createPurchaseOrderDraft")
          ? (() => {
              const formData = new FormData();
              formData.set("command", JSON.stringify(command));
              formData.set("idempotencyKey", crypto.randomUUID());
              formData.set("documentImage", attachment);
              return runDemoCreateCommandWithImageAction(formData);
            })()
          : runDemoCreateCommandAction({ command, idempotencyKey: crypto.randomUUID() }));
        if (!response.ok) { setFeedback({ type: "error", text: response.error }); return; }
        applyMutationResult(response.result);
        setFeedback({ type: response.result.severity, text: response.result.summary });
        onSuccess?.();
      } catch (error) {
        setFeedback({ type: "error", text: error instanceof Error ? error.message : "Không thể tạo dữ liệu mới." });
      }
    });
  }

  function runWorkbookDryRun(file: File) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("workbook", file);
        const result = await importWorkbookDryRunAction(formData);
        applyMutationResult(result);
        setFeedback({ type: result.severity, text: result.summary });
      } catch (error) {
        setFeedback({ type: "error", text: error instanceof Error ? error.message : "Không thể chạy thử workbook." });
      }
    });
  }

  return { state, feedback, syncMeta, isPending, runOperation, runCreateCommand, runWorkbookDryRun };
}
