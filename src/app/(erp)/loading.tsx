import { RouteLoadingState } from "@/components/erp-v2/route-loading-state";

export default function ErpLoading() {
  return <RouteLoadingState scope="erp" title="Đang tải nội dung" description="Dữ liệu đang được đọc theo phạm vi quyền hiện tại." />;
}
