import { NextResponse } from "next/server";
import { z } from "zod";
import { getErpV2Snapshot } from "@/server/erp-v2/runtime";
import { deliveryTrackingService } from "@/server/delivery-tracking/runtime";
import { mobileError, requireMobileContext } from "@/server/mobile/mobile-api";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

export async function GET(request: Request) {
  try {
    const { actor } = await requireMobileContext(request);
    const trackingOverview = await deliveryTrackingService.getOverview(actor);
    if (!trackingOverview.canManage) {
      throw new Error("Bạn không có quyền theo dõi đơn hàng của cửa hàng.");
    }

    const { limit } = querySchema.parse({
      limit: new URL(request.url).searchParams.get("limit") ?? undefined
    });
    const { state } = await getErpV2Snapshot();
    const customersById = new Map(state.customers.map((customer) => [customer.id, customer]));
    const employeesById = new Map(state.employees.map((employee) => [employee.id, employee]));
    const sessionsByDeliveryJob = new Map(
      trackingOverview.sessions.map((session) => [session.deliveryJobId, session])
    );

    const orders = [...state.salesOrders]
      .sort((left, right) => right.orderDate.localeCompare(left.orderDate))
      .slice(0, limit)
      .map((order) => {
        const customer = customersById.get(order.customerId);
        const deliveries = state.deliveryJobs
          .filter((job) => job.salesOrderId === order.id)
          .sort((left, right) => right.plannedDate.localeCompare(left.plannedDate))
          .map((job) => {
            const session = sessionsByDeliveryJob.get(job.id);
            return {
              id: job.id,
              documentNo: job.documentNo,
              status: job.status,
              plannedDate: job.plannedDate,
              driverName: employeesById.get(job.driverId)?.displayName ?? "Chưa phân công",
              trackingStatus: session?.status ?? "not_started",
              lastLocationAt: session?.latestPoint?.recordedAt
            };
          });

        return {
          id: order.id,
          documentNo: order.documentNo,
          orderDate: order.orderDate,
          status: order.status,
          promisedDeliveryDate: order.promisedDeliveryDate,
          customer: {
            displayName: customer?.displayName ?? "Khách hàng chưa xác định",
            phone: customer?.phone ?? "Chưa có số điện thoại"
          },
          deliveries
        };
      });

    return NextResponse.json(
      { ok: true, generatedAt: new Date().toISOString(), orders },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return mobileError(error, "Không thể tải danh sách theo dõi đơn hàng.");
  }
}
