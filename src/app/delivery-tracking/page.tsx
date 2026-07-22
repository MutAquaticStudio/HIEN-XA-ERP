import { requirePageIdentityUser } from "@/server/identity/auth-context";
import { DeliveryTrackingMap } from "@/components/delivery-tracking-map";
import styles from "./page.module.css";

export default async function DeliveryTrackingPage() {
  await requirePageIdentityUser();
  return (
    <main className={styles.page}>
      <section className={styles.heading}>
        <p>Điều phối giao hàng</p>
        <h1>Bản đồ theo dõi chuyến giao</h1>
        <span>Vị trí cập nhật gần thời gian thực khi thợ đang bật chia sẻ trên ứng dụng mobile.</span>
      </section>
      <DeliveryTrackingMap endpoint="/api/mobile/tracking" mode="admin" />
    </main>
  );
}
