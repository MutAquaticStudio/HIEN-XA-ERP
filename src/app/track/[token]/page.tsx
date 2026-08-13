import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";
import { DeliveryTrackingMap } from "@/components/delivery-tracking-map";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function CustomerTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tracking = await deliveryTrackingService.getPublicTracking(token);
  if (!tracking) notFound();
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.kicker}>Theo dõi giao hàng</p>
        <h1>{tracking.documentNo}</h1>
        <p className={styles.copy}>Bạn đang xem vị trí gần đúng của chuyến giao. Liên kết này có thời hạn và tự tắt khi chuyến kết thúc.</p>
        <DeliveryTrackingMap endpoint={`/api/tracking/${token}`} mode="customer" />
      </section>
    </main>
  );
}
