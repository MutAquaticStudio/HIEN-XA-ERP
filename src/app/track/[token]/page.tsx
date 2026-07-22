import { notFound } from "next/navigation";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";
import { DeliveryTrackingMap } from "@/components/delivery-tracking-map";
import styles from "./page.module.css";

export default async function CustomerTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tracking = await deliveryTrackingService.getPublicTracking(token);
  if (!tracking) {
    notFound();
  }
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.kicker}>Theo dõi giao hàng</p>
        <h1>{tracking.documentNo}</h1>
        <p className={styles.copy}>Bạn có thể xem vị trí gần nhất của chuyến giao. Liên kết này tự hết hạn sau khi giao hàng.</p>
        <DeliveryTrackingMap endpoint={`/api/tracking/${token}`} mode="customer" />
      </section>
    </main>
  );
}
