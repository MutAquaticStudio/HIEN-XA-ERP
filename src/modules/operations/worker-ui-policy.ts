export type DeliveryLineQuantityInputMode = "server_derived" | "propose_for_approval" | "editable";

/**
 * Field staff never edit a posted or pending-delivery quantity directly.
 * They may only propose a discrepancy, which remains pending approval.
 */
export function deliveryLineQuantityInputMode(role: string, operation: string): DeliveryLineQuantityInputMode {
  const isFieldStaff = role === "worker" || role === "driver";
  if (isFieldStaff && operation === "submitDeliveryCompletion") return "server_derived";
  if (isFieldStaff && operation === "requestDeliveryQuantityChange") return "propose_for_approval";
  return "editable";
}
