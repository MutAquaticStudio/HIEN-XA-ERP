import Link from "next/link";

export function PartnerPortalNav({ role, activePath }: { role: "customer" | "supplier"; activePath?: string }) {
  const items = role === "customer" ? [
    ["/khach-hang", "Tổng quan"],
    ["/khach-hang/don-hang", "Đơn hàng"],
    ["/dat-hang", "Đặt hàng"],
    ["/khach-hang/theo-doi", "Theo dõi"],
    ["/khach-hang/xac-nhan-giao", "Xác nhận nhận"],
    ["/khach-hang/thanh-toan", "Thanh toán"],
    ["/khach-hang#tin-nhan", "Tin nhắn"]
  ] : [
    ["/nha-cung-cap", "Tổng quan"],
    ["/nha-cung-cap/don-mua", "Đơn mua"],
    ["/nha-cung-cap/giao-hang", "Báo giao hàng"],
    ["/nha-cung-cap/thanh-toan", "Thanh toán"],
    ["/nha-cung-cap#tin-nhan", "Tin nhắn"]
  ];
  return <nav className="partner-portal-nav" aria-label={role === "customer" ? "Điều hướng cổng khách hàng" : "Điều hướng cổng nhà cung cấp"}>
    {items.map(([href, label]) => {
      const path = href.split("#")[0];
      const selected = activePath === path || (path !== (role === "customer" ? "/khach-hang" : "/nha-cung-cap") && activePath?.startsWith(`${path}/`));
      return <Link href={href} className={selected ? "is-active" : undefined} aria-current={selected ? "page" : undefined} key={href}>{label}</Link>;
    })}
  </nav>;
}
