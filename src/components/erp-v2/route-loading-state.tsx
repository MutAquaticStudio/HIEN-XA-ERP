"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type RouteLoadingStateProps = {
  scope: "erp" | "portal" | "public";
  title: string;
  description: string;
};

const loadingTimeoutMs = 15000;

export function RouteLoadingState({ scope, title, description }: RouteLoadingStateProps) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const className = scope === "erp" ? "erp-v2-route-loading" : scope === "portal" ? "partner-portal-route-loading" : "customer-order-route-loading";
  const spinnerClassName = scope === "erp" ? "erp-v2-loading-bar" : scope === "portal" ? "partner-portal-loading-bar" : "customer-order-loading-bar";

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setTimedOut(true), loadingTimeoutMs);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (timedOut) {
    return <section className="route-loading-timeout" role="alert" aria-live="assertive">
      <strong>Trang đang mất nhiều thời gian hơn dự kiến</strong>
      <p>Dữ liệu chưa tải xong. Thử lại để tiếp tục, hoặc quay về trang trước.</p>
      <div className="customer-portal-error-actions"><button className="erp-v2-button primary" type="button" onClick={() => { setTimedOut(false); router.refresh(); }}>Thử lại</button><button className="erp-v2-button" type="button" onClick={() => router.back()}>Quay lại</button></div>
    </section>;
  }

  return <section className={className} role="status" aria-live="polite" aria-busy="true"><div className={spinnerClassName} aria-hidden="true" /><div><strong>{title}</strong><p>{description}</p></div></section>;
}

export { loadingTimeoutMs };
