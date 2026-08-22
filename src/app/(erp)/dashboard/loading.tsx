import { RouteLoadingState } from "@/components/erp-v2/route-loading-state";

export default function DashboardLoading() {
  return <RouteLoadingState scope="erp" title="Đang tải tổng quan" description="Đang tổng hợp số liệu từ các sổ ghi nhận." />;
}
