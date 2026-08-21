import { RouteLoadingState } from "@/components/erp-v2/route-loading-state";

export default function SupplierPortalLoading() {
  return <RouteLoadingState scope="portal" title="Đang tải cổng nhà cung cấp" description="Đang cập nhật đơn mua và các lần báo giao của tài khoản này." />;
}
