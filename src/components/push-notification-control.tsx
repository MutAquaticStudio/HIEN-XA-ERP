"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Send } from "lucide-react";

type VapidResponse = { ok: boolean; publicKey: string | null };
type SubscriptionResponse = { ok?: boolean; error?: string; removed?: boolean };

export function canTogglePushSubscription(input: {
  configured: boolean;
  registrationReady: boolean;
  subscribed: boolean;
  pending: boolean;
}) {
  return input.registrationReady && !input.pending && (input.subscribed || input.configured);
}

export function PushNotificationControl() {
  const [supported, setSupported] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [registrationReady, setRegistrationReady] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setSupported(false);
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      setRegistrationReady(true);
      setSubscribed(Boolean(await registration.pushManager.getSubscription()));
    } catch {
      setRegistrationReady(false);
      setMessage("Trình duyệt này chưa thể khởi tạo thông báo. Hãy mở bằng Chrome hoặc Edge, rồi cài ứng dụng nếu được hỏi.");
      return;
    }

    try {
      const response = await fetch("/api/notifications/vapid-key", { cache: "no-store" });
      const payload = await response.json() as VapidResponse;
      setConfigured(Boolean(response.ok && payload.publicKey));
    } catch {
      setConfigured(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const toggleSubscription = async () => {
    if (!registrationReady || pending) return;
    setPending(true);
    setMessage(undefined);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        const deleteResponse = await fetch("/api/notifications/subscription", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ channel: "web", endpoint: existing.endpoint })
        });
        const deleted = await deleteResponse.json().catch(() => null) as SubscriptionResponse | null;
        if (!deleteResponse.ok || deleted?.ok !== true) {
          throw new Error(deleted?.error || "Chưa thể tắt thông báo. Vui lòng thử lại.");
        }
        const unsubscribed = await existing.unsubscribe();
        if (!unsubscribed) {
          await refresh();
          setMessage("Đã gỡ đăng ký khỏi tài khoản, nhưng trình duyệt chưa tắt được. Vui lòng thử lại.");
          return;
        }
        await refresh();
        setMessage("Đã tắt thông báo trên trình duyệt này.");
        return;
      }
      if (!configured) {
        setMessage("Cửa hàng chưa hoàn tất cấu hình gửi thông báo. Bạn vẫn có thể ẩn nhắc này trong phiên hiện tại.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Bạn chưa cho phép nhận thông báo. Có thể bật lại trong phần cài đặt của trình duyệt.");
        return;
      }
      const keyResponse = await fetch("/api/notifications/vapid-key", { cache: "no-store" });
      const keyPayload = await keyResponse.json() as VapidResponse;
      if (!keyPayload.publicKey) {
        setConfigured(false);
        setMessage("Cửa hàng chưa cấu hình máy chủ gửi thông báo.");
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(keyPayload.publicKey)
      });
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) throw new Error("Thiết bị không trả về khóa đăng ký hợp lệ.");
      const saveResponse = await fetch("/api/notifications/subscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel: "web",
          endpoint: subscription.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }
        })
      });
      const saved = await saveResponse.json() as { ok?: boolean; error?: string };
      if (!saveResponse.ok || !saved.ok) throw new Error(saved.error || "Không thể lưu đăng ký thông báo.");
      setSubscribed(true);
      setMessage("Đã bật thông báo trên trình duyệt này.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật thông báo.");
    } finally {
      setPending(false);
    }
  };

  const sendTest = async () => {
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/notifications/test", { method: "POST" });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Không thể gửi thông báo thử.");
      setMessage("Đã gửi thông báo thử. Nếu chưa thấy, kiểm tra quyền thông báo của trình duyệt.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể gửi thông báo thử.");
    } finally {
      setPending(false);
    }
  };

  if (!supported) return null;
  const canToggle = canTogglePushSubscription({ configured, registrationReady, subscribed, pending });

  return (
    <section className="push-notification-control" aria-live="polite" aria-labelledby="push-setting-title">
      <div>
        <strong id="push-setting-title">{subscribed ? "Thông báo đang bật" : "Thông báo công việc"}</strong>
        <span>{configured
          ? registrationReady
            ? "Cập nhật công việc và giao hàng, không kèm số tiền."
            : "Máy chủ đã sẵn sàng. Hãy dùng Chrome hoặc Edge trên thiết bị này để bật thông báo."
          : "Cửa hàng đang hoàn tất cấu hình máy chủ gửi."}</span>
      </div>
      <div className="push-notification-actions">
        <button className="button" type="button" onClick={() => void toggleSubscription()} disabled={!canToggle}>
          {subscribed ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}
          {subscribed ? "Tắt" : "Bật"}
        </button>
        {subscribed ? <button className="button button-primary" type="button" onClick={() => void sendTest()} disabled={pending}><Send aria-hidden="true" />Gửi thử</button> : null}
      </div>
      {message ? <p>{message}</p> : null}
    </section>
  );
}

function base64UrlToUint8Array(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
