import { RouteLoadingState } from "@/components/erp-v2/route-loading-state";

export default function CatalogLoading() {
  return <RouteLoadingState scope="erp" title="Đang tải danh mục" description="Đang đọc dữ liệu từ snapshot được phân quyền." />;
}
