import { getErpV2Snapshot } from "@/server/erp-v2/runtime";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";
import type { SafeIdentityUser } from "@/server/identity/types";
import { PublicApiError } from "@/server/shared/public-api-error";

export async function getMobileCatalogOverview(user: SafeIdentityUser) {
  if (!["owner", "administrator", "accountant", "sales", "warehouse", "dispatcher", "supervisor", "viewer"].includes(user.role)) {
    throw new PublicApiError(403, "Tài khoản này không có quyền xem danh mục trên điện thoại.");
  }
  const snapshot = projectOperationsSnapshot(await getErpV2Snapshot(), user);
  return {
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    customers: snapshot.state.customers.map((item) => ({ id: item.id, displayName: item.displayName, phone: item.phone, status: item.status })),
    suppliers: snapshot.state.suppliers.map((item) => ({ id: item.id, displayName: item.displayName, phone: item.phone, status: item.status })),
    products: snapshot.state.productUnits.map((item) => ({ id: item.id, productCode: item.productCode, productName: item.productName, unitName: item.unitName, status: item.status, salePrice: item.salePrice, saleTaxRate: item.saleTaxRate })),
    warehouses: snapshot.state.warehouses.map((item) => ({ id: item.id, code: item.code, name: item.name })),
    vehicles: snapshot.state.vehicles.map((item) => ({ id: item.id, code: item.code, plateNumber: item.plateNumber, capacityTons: item.capacityTons })),
    employees: snapshot.state.employees.map((item) => ({ id: item.id, displayName: item.displayName, roleType: item.roleType }))
  };
}
