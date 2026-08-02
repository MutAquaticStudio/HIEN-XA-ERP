import type {
  CommercialDiscountInput,
  CommercialDiscountSnapshot,
  CommercialTermsSnapshot,
  PurchaseFreightAllocation,
} from "./types";

const MONEY_PRECISION = 100;

export class CommercialPricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommercialPricingError";
  }
}

export type FreightAllocationLine = {
  purchaseOrderLineId: string;
  quantity: number;
  unitCost: number;
  discountAmount?: number;
};

export type LatestPurchaseCostCandidate = {
  productUnitId: string;
  sourceDocument: string;
  sourceLineId: string;
  receivedAt: string;
  receivedQuantity: number;
  unitPurchasePrice: number;
  lineDiscountAmount?: number;
  freightAllocatedAmount?: number;
  status: "draft" | "posted" | "reversed";
};

export type LatestLandedCost = {
  productUnitId: string;
  sourceDocument: string;
  sourceLineId: string;
  receivedAt: string;
  unitPurchasePrice: number;
  lineDiscountAmount: number;
  freightAllocatedAmount: number;
  landedUnitCost: number;
};

export type SalePriceRecommendation = {
  landedUnitCost: number;
  targetMarginRate: number;
  suggestedNetUnitPrice: number;
};

export function normalizeCommercialDiscount(
  input: CommercialDiscountInput | undefined,
  unitPrice: number,
  quantity: number,
): CommercialDiscountSnapshot | undefined {
  if (!input) return undefined;
  assertNonNegative(unitPrice, "Unit price");
  assertPositive(quantity, "Quantity");
  assertNonNegative(input.value, "Discount value");

  const baseAmount = roundMoney(unitPrice * quantity);
  const amount = input.kind === "percentage"
    ? roundMoney(baseAmount * (input.value / 100))
    : roundMoney(input.value);

  if (input.kind === "percentage" && input.value > 100) {
    throw new CommercialPricingError("Discount percentage cannot exceed 100%.");
  }
  if (amount > baseAmount) {
    throw new CommercialPricingError("Discount cannot exceed the line net amount.");
  }

  return {
    kind: input.kind,
    value: input.value,
    amount,
    baseAmount,
  };
}

export function allocateInboundFreightByNetValue(
  lines: readonly FreightAllocationLine[],
  freightNetAmount: number,
): PurchaseFreightAllocation[] {
  assertNonNegative(freightNetAmount, "Freight net amount");
  if (lines.length === 0) {
    if (freightNetAmount === 0) return [];
    throw new CommercialPricingError("Freight cannot be allocated without purchase lines.");
  }

  const seenLineIds = new Set<string>();
  const weightedLines = lines.map((line) => {
    if (!line.purchaseOrderLineId.trim() || !seenLineIds.add(line.purchaseOrderLineId)) {
      throw new CommercialPricingError("Each purchase line must have one unique freight allocation key.");
    }
    assertPositive(line.quantity, "Purchase quantity");
    assertNonNegative(line.unitCost, "Purchase unit cost");
    const netValue = roundMoney(line.quantity * line.unitCost - (line.discountAmount ?? 0));
    if (netValue < 0) {
      throw new CommercialPricingError("Purchase discount cannot exceed the purchase line net amount.");
    }
    return { ...line, netValue };
  });

  const totalNetValue = roundMoney(weightedLines.reduce((total, line) => total + line.netValue, 0));
  if (freightNetAmount > 0 && totalNetValue <= 0) {
    throw new CommercialPricingError("Freight needs a positive purchase net value for value-based allocation.");
  }

  const sorted = [...weightedLines].sort((left, right) =>
    left.purchaseOrderLineId.localeCompare(right.purchaseOrderLineId),
  );
  let remaining = roundMoney(freightNetAmount);

  return sorted.map((line, index) => {
    const allocatedNetAmount = index === sorted.length - 1
      ? remaining
      : roundMoney(freightNetAmount * (line.netValue / totalNetValue));
    remaining = roundMoney(remaining - allocatedNetAmount);
    return { purchaseOrderLineId: line.purchaseOrderLineId, allocatedNetAmount };
  });
}

export function findLatestPostedLandedCost(
  candidates: readonly LatestPurchaseCostCandidate[],
  productUnitId: string,
): LatestLandedCost | undefined {
  const latest = candidates
    .filter((candidate) => candidate.productUnitId === productUnitId && candidate.status === "posted")
    .sort((left, right) => {
      const occurredAt = right.receivedAt.localeCompare(left.receivedAt);
      return occurredAt || right.sourceLineId.localeCompare(left.sourceLineId);
    })[0];

  if (!latest) return undefined;
  assertTimestamp(latest.receivedAt, "Latest purchase receipt date");
  assertPositive(latest.receivedQuantity, "Received quantity");
  assertNonNegative(latest.unitPurchasePrice, "Purchase unit price");
  assertNonNegative(latest.lineDiscountAmount ?? 0, "Purchase line discount");
  assertNonNegative(latest.freightAllocatedAmount ?? 0, "Allocated freight");

  const purchaseNet = roundMoney(
    latest.unitPurchasePrice * latest.receivedQuantity - (latest.lineDiscountAmount ?? 0),
  );
  if (purchaseNet < 0) {
    throw new CommercialPricingError("Purchase discount cannot exceed the received goods value.");
  }

  return {
    productUnitId: latest.productUnitId,
    sourceDocument: latest.sourceDocument,
    sourceLineId: latest.sourceLineId,
    receivedAt: latest.receivedAt,
    unitPurchasePrice: latest.unitPurchasePrice,
    lineDiscountAmount: latest.lineDiscountAmount ?? 0,
    freightAllocatedAmount: latest.freightAllocatedAmount ?? 0,
    landedUnitCost: roundMoney(
      (purchaseNet + (latest.freightAllocatedAmount ?? 0)) / latest.receivedQuantity,
    ),
  };
}

export function recommendSalePrice(
  landedUnitCost: number,
  targetMarginRate: number,
): SalePriceRecommendation {
  assertNonNegative(landedUnitCost, "Landed unit cost");
  if (!Number.isFinite(targetMarginRate) || targetMarginRate < 0 || targetMarginRate >= 1) {
    throw new CommercialPricingError("Target margin rate must be greater than or equal to 0 and less than 1.");
  }

  return {
    landedUnitCost: roundMoney(landedUnitCost),
    targetMarginRate,
    suggestedNetUnitPrice: roundMoney(landedUnitCost / (1 - targetMarginRate)),
  };
}

export function calculateMarginAfterDiscount(
  landedUnitCost: number,
  unitSalePrice: number,
  quantity: number,
  discount: CommercialDiscountSnapshot | undefined,
): number {
  assertNonNegative(landedUnitCost, "Landed unit cost");
  assertNonNegative(unitSalePrice, "Sale unit price");
  assertPositive(quantity, "Sale quantity");
  const netSaleAmount = roundMoney(unitSalePrice * quantity - (discount?.amount ?? 0));
  if (netSaleAmount <= 0) {
    throw new CommercialPricingError("Margin cannot be calculated for a zero net sale amount.");
  }
  const costAmount = roundMoney(landedUnitCost * quantity);
  return (netSaleAmount - costAmount) / netSaleAmount;
}

export function requiresMarginOverride(
  actualMarginRate: number,
  targetMarginRate: number,
): boolean {
  if (!Number.isFinite(actualMarginRate) || !Number.isFinite(targetMarginRate)) {
    throw new CommercialPricingError("Margin values must be finite numbers.");
  }
  return actualMarginRate + Number.EPSILON < targetMarginRate;
}

export function createCommercialTermsSnapshot(input: {
  paymentTermDays?: number;
  paymentTermsNote?: string;
  capturedAt: string;
}): CommercialTermsSnapshot {
  const paymentTermDays = input.paymentTermDays ?? 0;
  if (!Number.isInteger(paymentTermDays) || paymentTermDays < 0 || paymentTermDays > 3650) {
    throw new CommercialPricingError("Payment term days must be a whole number between 0 and 3650.");
  }
  assertTimestamp(input.capturedAt, "Commercial terms capture time");
  const paymentTermsNote = input.paymentTermsNote?.trim();
  if (paymentTermsNote && paymentTermsNote.length > 500) {
    throw new CommercialPricingError("Payment terms note cannot exceed 500 characters.");
  }
  return {
    paymentTermDays,
    paymentTermsNote: paymentTermsNote || undefined,
    dueDateBasis: "fulfillment",
    capturedAt: input.capturedAt,
  };
}

export function deriveFulfillmentDueDate(
  fulfilledOn: string,
  terms: CommercialTermsSnapshot,
): string {
  const fulfilledAt = parseCalendarDate(fulfilledOn, "Fulfillment date");
  const dueAt = new Date(Date.UTC(
    fulfilledAt.getUTCFullYear(),
    fulfilledAt.getUTCMonth(),
    fulfilledAt.getUTCDate() + terms.paymentTermDays,
  ));
  return dueAt.toISOString().slice(0, 10);
}

export function derivePromisedDeliveryDate(
  orderDate: string,
  leadTimeDays: number | undefined,
): string | undefined {
  if (leadTimeDays === undefined) return undefined;
  if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 3650) {
    throw new CommercialPricingError("Lead time days must be a whole number between 0 and 3650.");
  }
  const orderAt = parseCalendarDate(orderDate, "Order date");
  const promisedAt = new Date(Date.UTC(
    orderAt.getUTCFullYear(),
    orderAt.getUTCMonth(),
    orderAt.getUTCDate() + leadTimeDays,
  ));
  return promisedAt.toISOString().slice(0, 10);
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new CommercialPricingError(`${label} must be greater than zero.`);
  }
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new CommercialPricingError(`${label} must be a non-negative finite number.`);
  }
}

function assertTimestamp(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new CommercialPricingError(`${label} must be a valid timestamp.`);
  }
}

function parseCalendarDate(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CommercialPricingError(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new CommercialPricingError(`${label} is invalid.`);
  }
  return parsed;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_PRECISION) / MONEY_PRECISION;
}
