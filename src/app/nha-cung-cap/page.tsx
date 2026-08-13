import { redirect } from "next/navigation";
import { SupplierAccountPortal } from "@/components/supplier-account-portal";
import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { supplierBalance } from "@/modules/operations/selectors";
import { getCurrentIdentityUser } from "@/server/identity/auth-context";

export const dynamic = "force-dynamic";

export default async function SupplierPortalPage() {
  const user = await getCurrentIdentityUser();
  if (!user) redirect("/nha-cung-cap/dang-nhap");
  if (user.role !== "supplier") redirect("/");
  if (!user.supplierId) return <Unavailable />;

  const snapshot = await getDemoOperationsSnapshot();
  const supplier = snapshot.state.suppliers.find((candidate) => candidate.id === user.supplierId && candidate.status === "active");
  if (!supplier) return <Unavailable />;

  const orders = snapshot.state.purchaseOrders
    .filter((order) => order.supplierId === supplier.id)
    .sort((left, right) => right.orderDate.localeCompare(left.orderDate))
    .slice(0, 12)
    .map((order) => ({
      id: order.id,
      documentNo: order.documentNo,
      orderDate: order.orderDate,
      status: order.status,
      responseCount: order.supplierAcknowledgements?.length ?? 0,
      noticeCount: order.supplierDeliveryNotices?.length ?? 0,
      lines: order.lines.map((line) => ({
        id: line.id,
        name: snapshot.state.productUnits.find((product) => product.id === line.productUnitId)?.productName ?? line.productUnitId,
        unitName: line.documentUnit?.unitName ?? snapshot.state.productUnits.find((product) => product.id === line.productUnitId)?.unitName ?? "đơn vị",
        orderedQuantity: line.orderedQuantity,
        receivedQuantity: line.receivedQuantity,
        unitCost: line.unitCost,
        taxRate: line.taxRate,
        destination: line.destinationType === "warehouse"
          ? `Nhận tại ${snapshot.state.warehouses.find((warehouse) => warehouse.id === line.warehouseId)?.name ?? "kho cửa hàng"}`
          : `Giao thẳng cho ${snapshot.state.customers.find((customer) => customer.id === line.customerId)?.displayName ?? "khách hàng"}`
      }))
    }));
  const entries = snapshot.state.supplierLedgerEntries
    .filter((entry) => entry.supplierId === supplier.id && !entry.reversedById)
    .sort((left, right) => right.postingDate.localeCompare(left.postingDate))
    .filter((entry) => entry.direction === "debit")
    .slice(0, 8)
    .map((entry) => ({ id: entry.id, documentNo: entry.sourceDocument, date: entry.postingDate, direction: entry.direction, amount: entry.amount }));

  return <SupplierAccountPortal supplierName={supplier.displayName} supplierId={supplier.id} orders={orders} balance={supplierBalance(snapshot.state.supplierLedgerEntries, supplier.id)} entries={entries} />;
}

function Unavailable() {
  return <main className="auth-page customer-login-page"><section className="auth-panel customer-login-panel"><h1>Chưa thể mở cổng đối tác</h1><p className="customer-login-help">Tài khoản chưa được liên kết với hồ sơ nhà cung cấp đang hoạt động. Vui lòng liên hệ cửa hàng.</p></section></main>;
}
