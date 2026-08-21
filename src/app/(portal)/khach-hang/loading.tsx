import { RouteLoadingState } from "@/components/erp-v2/route-loading-state";

export default function CustomerPortalLoading() {
  return <RouteLoadingState scope="portal" title="Đang tải cổng khách hàng" description="Đang cập nhật đơn hàng và công nợ của tài khoản này." />;
}
