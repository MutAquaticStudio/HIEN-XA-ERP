import { RouteLoadingState } from "@/components/erp-v2/route-loading-state";

export default function Loading() {
  return <RouteLoadingState scope="public" title="Đang tải nội dung" description="Dữ liệu đang được chuẩn bị." />;
}
