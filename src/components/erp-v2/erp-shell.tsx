import Link from "next/link";
import { Boxes, ClipboardList, Home, LogOut, PackageSearch, Truck, Users, Warehouse } from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import type { OperationsModuleId } from "@/modules/operations/erp-registry";
import type { SafeIdentityUser } from "@/server/identity/types";
import { visibleModulesForIdentity } from "@/server/identity/auth-context";

type ErpShellProps = {
  user: SafeIdentityUser;
  activePath?: string;
  children: React.ReactNode;
  title?: string;
};

const groups: Array<{ label: string; items: Array<{ href: string; label: string; icon: typeof Home; module?: OperationsModuleId }> }> = [
  { label: "TỔNG QUAN", items: [{ href: "/dashboard", label: "Tổng quan V2", icon: Home, module: "overview" }, { href: "/", label: "Màn hình vận hành cũ", icon: ClipboardList, module: "overview" }] },
  {
    label: "DANH MỤC",
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
    label: "VẬN HÀNH",
    items: [
      { href: "/?module=sales", label: "Đơn bán", icon: ClipboardList, module: "sales" },
      { href: "/?module=procurement", label: "Đơn mua", icon: PackageSearch, module: "procurement" },
      { href: "/?module=inventory", label: "Tồn kho", icon: Warehouse, module: "inventory" },
      { href: "/?module=reporting", label: "Báo cáo", icon: ClipboardList, module: "reporting" }
    ]
  }
];

export function ErpShell({ user, activePath, children, title }: ErpShellProps) {
  const allowedModules = new Set(visibleModulesForIdentity(user));
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
        <Link className="erp-v2-brand" href="/">
          <span className="erp-v2-brand-mark">HX</span>
          <span><strong>VLXD Hiền Xa</strong><small>ERP vận hành</small></span>
        </Link>
        <nav className="erp-v2-nav erp-v2-nav-desktop">{renderNavigation()}</nav>
        <details className="erp-v2-mobile-menu">
          <summary>Danh mục &amp; menu</summary>
          <nav className="erp-v2-nav">{renderNavigation()}</nav>
        </details>
        <div className="erp-v2-sidebar-account">
          <span>{user.displayName}</span>
          <small>{user.username || user.email}</small>
          <form action={logoutAction}><button className="erp-v2-logout" type="submit"><LogOut aria-hidden="true" />Đăng xuất</button></form>
        </div>
      </aside>
      <main className="erp-v2-main">
        {title ? <div className="erp-v2-route-title"><span>ERP vận hành</span><strong>{title}</strong></div> : null}
        {children}
      </main>
    </div>
  );
}
