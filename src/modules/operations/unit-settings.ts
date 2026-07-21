import type { OperationsState, PurchaseUnitConversionMode } from "./types";

export type ConfiguredDocumentUnit = {
  unitId?: string;
  unitName: string;
  conversionMode: PurchaseUnitConversionMode;
  factorToBase: number | null;
  isBase: boolean;
};

export function normalizeUnitName(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

export function configuredPurchaseUnits(state: OperationsState, productUnitId: string): ConfiguredDocumentUnit[] {
  const product = state.productUnits.find((item) => item.id === productUnitId && item.status === "active");
  if (!product) {
    return [];
  }

  const units: ConfiguredDocumentUnit[] = [];
  const seen = new Set<string>();

  for (const conversion of state.purchaseUnitConversions) {
    if (conversion.productUnitId !== productUnitId) {
      continue;
    }
    const unit = state.unitDefinitions.find((item) => item.id === conversion.unitId && item.status === "active");
    if (!unit) {
      continue;
    }
    const normalized = normalizeUnitName(unit.name);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    units.push({
      unitId: unit.id,
      unitName: unit.name,
      conversionMode: conversion.conversionMode,
      factorToBase: conversion.factorToBase,
      isBase: false
    });
  }

  return units;
}

export function configuredPurchaseUnit(
  state: OperationsState,
  productUnitId: string,
  requestedUnitName?: string
) {
  const product = state.productUnits.find((item) => item.id === productUnitId && item.status === "active");
  if (!product) {
    return undefined;
  }
  const requested = requestedUnitName?.trim();
  if (!requested) {
    return undefined;
  }
  return configuredPurchaseUnits(state, productUnitId).find(
    (unit) => normalizeUnitName(unit.unitName) === normalizeUnitName(requested)
  );
}
