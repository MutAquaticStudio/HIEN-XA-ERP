export function canShowTrackingTab(role?: string) {
  return role === "driver" || role === "worker" || role === "dispatcher" || role === "owner" || role === "administrator";
}

export function canViewAssignedDeliveryRoute(role: string | undefined, canManage: boolean) {
  return canManage || role === "worker" || role === "driver";
}
