import { redirect } from "next/navigation";
import { DeliveryTrackingMap } from "@/components/delivery-tracking-map";
import { getCurrentIdentityUser } from "@/server/identity/auth-context";
import styles from "../../../track/[token]/page.module.css";

export const dynamic = "force-dynamic";

export default async function CustomerDeliveryTrackingPage() {
  const user = await getCurrentIdentityUser();
  if (!user) redirect("/khach-hang/dang-nhap");
  if (user.role !== "customer" || !user.customerId) redirect("/khach-hang");
  return <div className={styles.page}>
      <section className={styles.card}>
        <p className={styles.kicker}>Đơn hàng của bạn</p>
        <h1>Theo dõi chuyến giao</h1>
        <p className={styles.copy}>Chỉ các chuyến đang giao cho hồ sơ của bạn mới hiển thị tại đây. Vị trí được làm mờ để bảo vệ riêng tư của tài xế.</p>
        <DeliveryTrackingMap endpoint="/api/tracking/customer" mode="customer" />
      </section>
    </div>;
}
