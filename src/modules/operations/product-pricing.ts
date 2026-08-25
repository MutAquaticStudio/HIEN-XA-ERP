export type ProductPricing = {
  purchasePrice?: number;
  markupRate?: number;
  salePrice?: number;
};

export type CompleteProductPricing = Required<ProductPricing>;

const MONEY_SCALE = 100;
const RATE_SCALE = 1_000_000;
const MONEY_TOLERANCE = 0.01;

/** Markup is a percentage uplift on purchase price, not gross margin. */
export function calculateSalePrice(purchasePrice: number, markupRate: number) {
  assertFiniteNonNegative(purchasePrice, "Giá nhập");
  assertFiniteNonNegative(markupRate, "% lãi");
  return roundTo(purchasePrice * (1 + markupRate / 100), MONEY_SCALE);
}

/** A zero purchase price has no mathematically meaningful reverse markup. */
export function calculateMarkupRate(purchasePrice: number, salePrice: number): number | undefined {
  assertFiniteNonNegative(purchasePrice, "Giá nhập");
  assertFiniteNonNegative(salePrice, "Giá bán");
  if (purchasePrice === 0) return undefined;
  return roundTo(((salePrice - purchasePrice) / purchasePrice) * 100, RATE_SCALE);
}

export function assertCompleteProductPricing(input: ProductPricing): CompleteProductPricing {
  if (input.purchasePrice === undefined) throw new Error("Giá nhập chưa được cấu hình.");
  if (input.markupRate === undefined) throw new Error("% lãi chưa được cấu hình.");
  if (input.salePrice === undefined) throw new Error("Giá bán chưa được cấu hình.");
  assertFiniteNonNegative(input.purchasePrice, "Giá nhập");
  assertFiniteNonNegative(input.markupRate, "% lãi");
  assertFiniteNonNegative(input.salePrice, "Giá bán");

  const authoritativeSalePrice = calculateSalePrice(input.purchasePrice, input.markupRate);
  if (input.purchasePrice === 0 && input.salePrice !== 0) {
    throw new Error("Khi giá nhập bằng 0, giá bán phải bằng 0 vì không thể tính ngược % lãi an toàn.");
  }
  if (Math.abs(input.salePrice - authoritativeSalePrice) > MONEY_TOLERANCE) {
    throw new Error(`Giá bán phải khớp giá nhập và % lãi; giá máy chủ tính là ${authoritativeSalePrice}.`);
  }
  return {
    purchasePrice: input.purchasePrice,
    markupRate: input.markupRate,
    salePrice: authoritativeSalePrice
  };
}

export function productProfitAmount(input: ProductPricing): number | undefined {
  if (input.purchasePrice === undefined || input.salePrice === undefined) return undefined;
  assertFiniteNonNegative(input.purchasePrice, "Giá nhập");
  assertFiniteNonNegative(input.salePrice, "Giá bán");
  return roundTo(input.salePrice - input.purchasePrice, MONEY_SCALE);
}

export function priceForDocumentUnit(
  input: ProductPricing,
  conversion: { conversionMode: PurchaseUnitConversionMode; factorToBase?: number | null }
): { purchasePrice: number; salePrice: number } | undefined {
  if (isVariableActualMode(conversion.conversionMode)) return undefined;
  const pricing = assertCompleteProductPricing(input);
  const factor = conversion.factorToBase;
  if (factor === undefined || factor === null || !Number.isFinite(factor) || factor <= 0) {
    throw new Error("Hệ số quy đổi cố định phải lớn hơn 0.");
  }
  return {
    purchasePrice: roundTo(pricing.purchasePrice * factor, MONEY_SCALE),
    salePrice: roundTo(pricing.salePrice * factor, MONEY_SCALE)
  };
}

function assertFiniteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} không được âm.`);
}

function roundTo(value: number, scale: number) {
  return Math.round((value + Number.EPSILON) * scale) / scale;
}
import { isVariableActualMode } from "./advanced-unit-conversion";
import type { PurchaseUnitConversionMode } from "./types";
