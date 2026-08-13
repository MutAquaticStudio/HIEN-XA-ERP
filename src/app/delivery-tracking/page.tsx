import Link from "next/link";
import { requirePageIdentityUser } from "@/server/identity/auth-context";
import { DeliveryTrackingMap } from "@/components/delivery-tracking-map";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function DeliveryTrackingPage() {
  await requirePageIdentityUser();
  return (
    <main className={styles.page}>
      <section className={styles.heading}>
        <p>Điều phối giao hàng</p>
        <h1>Bản đồ theo dõi chuyến giao</h1>
        <span>Vị trí chỉ cập nhật khi tài xế đang chủ động chia sẻ trong ứng dụng hoặc trình duyệt web.</span>
        <Link className={styles.monitorLink} href="/admin/theo-doi-don-hang">Theo dõi đơn hàng</Link>
      </section>
      <DeliveryTrackingMap endpoint="/api/tracking/web" mode="admin" enableShare />
    </main>
  );
}
