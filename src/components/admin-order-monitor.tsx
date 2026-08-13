"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./admin-order-monitor.module.css";

type DeliveryMonitorItem = {
  id: string;
  documentNo: string;
  status: "assigned" | "loading" | "in_transit" | "delivered" | "failed";
  plannedDate: string;
  driverName: string;
  trackingStatus: "active" | "stopped" | "expired" | "not_started";
  lastLocationAt?: string;
};

type OrderMonitorItem = {
  id: string;
  documentNo: string;
  orderDate: string;
  status: "draft" | "confirmed" | "allocated" | "partially_delivered" | "delivered";
  promisedDeliveryDate?: string;
  customer: { displayName: string; phone: string };
  deliveries: DeliveryMonitorItem[];
};

type MonitorResponse = {
  ok: true;
  generatedAt: string;
  orders: OrderMonitorItem[];
};

const orderStatusLabel: Record<OrderMonitorItem["status"], string> = {
  draft: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  allocated: "Đã phân bổ hàng",
  partially_delivered: "Giao một phần",
  delivered: "Đã giao xong"
};

const deliveryStatusLabel: Record<DeliveryMonitorItem["status"], string> = {
  assigned: "Đã phân công",
  loading: "Đang bốc hàng",
  in_transit: "Đang giao",
  delivered: "Đã giao",
  failed: "Giao không thành công"
};

const trackingStatusLabel: Record<DeliveryMonitorItem["trackingStatus"], string> = {
  active: "Đang chia sẻ GPS",
  stopped: "Đã dừng GPS",
  expired: "Phiên GPS đã hết hạn",
  not_started: "Chưa bật GPS"
};

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formatDateTime(value?: string) {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function AdminOrderMonitor() {
  const [orders, setOrders] = useState<OrderMonitorItem[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | OrderMonitorItem["status"]>("all");
  const [lastUpdated, setLastUpdated] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    try {
      setError(undefined);
      const response = await fetch("/api/admin/order-monitoring?limit=100", { cache: "no-store" });
      const payload = await response.json() as MonitorResponse | { error?: string };
      if (!response.ok || !("orders" in payload)) {
        throw new Error("error" in payload ? payload.error : "Không thể tải danh sách đơn hàng.");
      }
      setOrders(payload.orders);
      setLastUpdated(payload.generatedAt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể tải danh sách đơn hàng.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
    const refreshId = window.setInterval(() => void loadOrders(), 15_000);
    return () => window.clearInterval(refreshId);
  }, [loadOrders]);

  const visibleOrders = useMemo(() => {
    const search = normalizeSearch(query.trim());
    return orders.filter((order) => {
      const matchesStatus = status === "all" || order.status === status;
      const searchable = normalizeSearch([
        order.documentNo,
        order.customer.displayName,
        order.customer.phone,
        ...order.deliveries.map((delivery) => `${delivery.documentNo} ${delivery.driverName}`)
      ].join(" "));
      return matchesStatus && (!search || searchable.includes(search));
    });
  }, [orders, query, status]);

  const inTransit = orders.filter((order) => order.deliveries.some((delivery) => delivery.status === "in_transit")).length;
  const awaitingDelivery = orders.filter((order) => ["confirmed", "allocated", "partially_delivered"].includes(order.status)).length;

  return (
    <main className={styles.page}>
      <section className={styles.heading}>
        <p>Điều phối đơn hàng</p>
        <h1>Theo dõi đơn hàng</h1>
        <span>Kiểm tra khách, trạng thái đơn, chuyến giao và lần cập nhật GPS gần nhất tại một nơi.</span>
      </section>

      <section className={styles.summary} aria-label="Tóm tắt đơn hàng">
        <article><strong>{orders.length}</strong><span>Đơn đang theo dõi</span></article>
        <article><strong>{awaitingDelivery}</strong><span>Đơn cần giao hoặc giao tiếp</span></article>
        <article><strong>{inTransit}</strong><span>Đơn đang trên đường</span></article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Danh sách đơn</h2>
            <p aria-live="polite">{lastUpdated ? `Cập nhật lúc ${formatDateTime(lastUpdated)}. Tự làm mới mỗi 15 giây.` : "Đang tải dữ liệu mới nhất."}</p>
          </div>
          <Link className={styles.mapLink} href="/delivery-tracking">Mở bản đồ chuyến giao</Link>
        </div>

        <div className={styles.controls}>
          <label>
            <span>Tìm đơn hoặc khách hàng</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ví dụ: SO-2026 hoặc tên khách" />
          </label>
          <label>
            <span>Lọc theo trạng thái đơn</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="all">Tất cả trạng thái</option>
              {Object.entries(orderStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void loadOrders()} disabled={loading}>Làm mới danh sách</button>
        </div>

        {error ? <div className={styles.error} role="alert"><strong>Chưa tải được dữ liệu.</strong><span>{error}</span><button type="button" onClick={() => void loadOrders()}>Thử lại</button></div> : null}
        {!error && loading ? <p className={styles.state}>Đang tải đơn hàng...</p> : null}
        {!error && !loading && visibleOrders.length === 0 ? <p className={styles.state}>Không có đơn phù hợp với điều kiện đang chọn.</p> : null}

        <div className={styles.orderList}>
          {visibleOrders.map((order) => (
            <article className={styles.orderCard} key={order.id}>
              <div className={styles.orderTopline}>
                <div><span className={styles.documentNo}>{order.documentNo}</span><span className={styles.orderDate}>Lập đơn: {formatDateTime(order.orderDate)}</span></div>
                <span className={`${styles.badge} ${styles[`order_${order.status}`]}`}>{orderStatusLabel[order.status]}</span>
              </div>
              <dl className={styles.customerInfo}>
                <div><dt>Khách hàng</dt><dd>{order.customer.displayName}</dd></div>
                <div><dt>Điện thoại</dt><dd>{order.customer.phone}</dd></div>
                <div><dt>Ngày hẹn giao</dt><dd>{formatDateTime(order.promisedDeliveryDate)}</dd></div>
              </dl>

              {order.deliveries.length === 0 ? <p className={styles.noDelivery}>Chưa lập chuyến giao cho đơn này.</p> : (
                <div className={styles.deliveryList}>
                  {order.deliveries.map((delivery) => (
                    <section className={styles.delivery} key={delivery.id}>
                      <div>
                        <strong>{delivery.documentNo}</strong>
                        <span>{deliveryStatusLabel[delivery.status]}</span>
                      </div>
                      <dl>
                        <div><dt>Tài xế</dt><dd>{delivery.driverName}</dd></div>
                        <div><dt>Dự kiến giao</dt><dd>{formatDateTime(delivery.plannedDate)}</dd></div>
                        <div><dt>GPS</dt><dd className={styles[`tracking_${delivery.trackingStatus}`]}>{trackingStatusLabel[delivery.trackingStatus]}</dd></div>
                        <div><dt>Lần cập nhật cuối</dt><dd>{formatDateTime(delivery.lastLocationAt)}</dd></div>
                      </dl>
                    </section>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
