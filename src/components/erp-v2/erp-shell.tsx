import Link from "next/link";
import { Banknote, Boxes, ClipboardCheck, ClipboardList, FileUp, HandCoins, Home, LogOut, MessageCircle, PackageSearch, ReceiptText, ShieldCheck, Truck, UserRoundCog, Users, Warehouse } from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import type { OperationsModuleId } from "@/modules/operations/erp-registry";
import { visibleModulesForRole } from "@/modules/operations/identity";
import type { SafeIdentityUser } from "@/server/identity/types";

type ErpShellProps = {
  user: SafeIdentityUser;
  activePath?: string;
  children: React.ReactNode;
  title?: string;
};

const groups: Array<{ label: string; items: Array<{ href: string; label: string; icon: typeof Home; module?: OperationsModuleId }> }> = [
  { label: "TỔNG QUAN", items: [{ href: "/dashboard", label: "Tổng quan", icon: Home, module: "overview" }] },
  {
    label: "BÁN HÀNG & MUA HÀNG",
    items: [
      { href: "/sales/orders", label: "Bán hàng", icon: ClipboardList, module: "sales" },
      { href: "/procurement/orders", label: "Mua hàng", icon: PackageSearch, module: "procurement" }
    ]
  },
  {
    label: "KHO & GIAO NHẬN",
    items: [
      { href: "/inventory/stock", label: "Tồn kho", icon: Warehouse, module: "inventory" },
      { href: "/inventory/movements", label: "Phát sinh kho", icon: ReceiptText, module: "inventory" },
      { href: "/inventory/counts", label: "Kiểm kê", icon: ClipboardCheck, module: "inventory" },
      { href: "/delivery/jobs", label: "Giao hàng", icon: Truck, module: "delivery" }
    ]
  },
  {
    label: "TÀI CHÍNH & NHÂN CÔNG",
    items: [
      { href: "/receivables", label: "Phải thu", icon: HandCoins, module: "receivables" },
      { href: "/payables", label: "Phải trả", icon: Banknote, module: "payables" },
      { href: "/cash", label: "Quỹ", icon: ReceiptText, module: "cash" },
      { href: "/workforce/orders", label: "Lệnh việc", icon: UserRoundCog, module: "workforce" },
      { href: "/compensation", label: "Tiền công", icon: Users, module: "workforce" }
    ]
  },
  {
    label: "DANH MỤC NỀN",
    items: [
      { href: "/catalog/customers", label: "Khách hàng", icon: Users, module: "masterData" },
      { href: "/catalog/suppliers", label: "Nhà cung cấp", icon: Users, module: "masterData" },
      { href: "/catalog/products", label: "Vật tư", icon: Boxes, module: "masterData" },
      { href: "/catalog/warehouses", label: "Kho / bãi", icon: Warehouse, module: "masterData" },
      { href: "/catalog/vehicles", label: "Phương tiện", icon: Truck, module: "masterData" },
      { href: "/catalog/employees", label: "Nhân sự", icon: Users, module: "masterData" }
    ]
  },
  {
    label: "KIỂM SOÁT & BÁO CÁO",
    items: [
      { href: "/import", label: "Import", icon: FileUp, module: "import" },
      { href: "/audit", label: "Nhật ký", icon: ShieldCheck, module: "audit" },
      { href: "/reporting", label: "Báo cáo", icon: ClipboardList, module: "reporting" },
      { href: "/trao-doi", label: "Tin nhắn", icon: MessageCircle }
    ]
  }
];

export function ErpShell({ user, activePath, children, title }: ErpShellProps) {
  const roleModules = new Set(visibleModulesForRole(user.role));
  const selectedModules = new Set(user.moduleIds);
  selectedModules.add("overview");
  const allowedModules = new Set([...selectedModules].filter((moduleId) => roleModules.has(moduleId)));
  const navigation = groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.module || allowedModules.has(item.module))
  })).filter((group) => group.items.length > 0);
  const renderNavigation = () => navigation.map((group) => (
    <div className="erp-v2-nav-group" key={group.label}>
      <p>{group.label}</p>
      {group.items.map((item) => {
        const Icon = item.icon;
        const selected = activePath === item.href || (activePath?.startsWith(item.href + "/") ?? false);
        return <Link className={selected ? "erp-v2-nav-item is-active" : "erp-v2-nav-item"} href={item.href} key={item.href} aria-current={selected ? "page" : undefined}><Icon aria-hidden="true" /><span>{item.label}</span></Link>;
      })}
    </div>
  ));
  return (
    <div className="erp-v2-shell">
      <aside className="erp-v2-sidebar" aria-label="Điều hướng ERP">
        <Link className="erp-v2-brand" href="/dashboard">
          <span className="erp-v2-brand-mark">HX</span>
          <span><strong>VLXD Hiền Xa</strong><small>ERP V2 · Nội bộ</small></span>
        </Link>
        <nav className="erp-v2-nav erp-v2-nav-desktop">{renderNavigation()}</nav>
        <details className="erp-v2-mobile-menu">
          <summary>Mở menu ERP V2</summary>
          <nav className="erp-v2-nav">{renderNavigation()}</nav>
        </details>
        <div className="erp-v2-sidebar-account">
          <span>{user.displayName}</span>
          <small>{user.username || user.email}</small>
          <form action={logoutAction}><button className="erp-v2-logout" type="submit"><LogOut aria-hidden="true" />Đăng xuất</button></form>
        </div>
      </aside>
      <main className="erp-v2-main">
        {title ? <div className="erp-v2-route-title"><span>ERP V2</span><strong>{title}</strong></div> : null}
        {children}
      </main>
    </div>
  );
}
