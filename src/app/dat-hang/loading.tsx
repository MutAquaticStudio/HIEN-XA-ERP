import { RouteLoadingState } from "@/components/erp-v2/route-loading-state";

export default function CustomerOrderLoading() {
  return <RouteLoadingState scope="public" title="Đang tải bảng giá" description="Đang đọc danh mục được phép đặt hàng." />;
}
