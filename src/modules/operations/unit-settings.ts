import type { OperationsState, PurchaseUnitConversionMode } from "./types";

export type ConfiguredDocumentUnit = {
  unitId?: string;
  unitName: string;
  conversionMode: PurchaseUnitConversionMode;
  factorToBase: number | null;
  isBase: boolean;
};

export type DocumentUnitContext = "purchase" | "sales" | "customer_portal";

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

  const baseUnitName = product.unitName;
  const normalizedBaseUnit = normalizeUnitName(baseUnitName);
  if (!seen.has(normalizedBaseUnit)) {
    const baseUnit = state.unitDefinitions.find(
      (item) => item.status === "active" && normalizeUnitName(item.name) === normalizedBaseUnit
    );
    units.push({
      unitId: baseUnit?.id,
      unitName: baseUnitName,
      conversionMode: "fixed",
      factorToBase: 1,
      isBase: true
    });
  }

  return units;
}

/**
 * One authoritative selector for document units. Purchase may use fixed or
 * variable conversions; sales and the customer portal only receive fixed
 * conversions because their quantities must be known before fulfillment.
 */
export function configuredDocumentUnits(
  state: OperationsState,
  productUnitId: string,
  context: DocumentUnitContext
): ConfiguredDocumentUnit[] {
  const units = configuredPurchaseUnits(state, productUnitId)
    .filter((unit) => context === "purchase" || unit.conversionMode === "fixed");
  return context === "purchase"
    ? units
    : units.slice().sort((left, right) => Number(right.isBase) - Number(left.isBase));
}

export function configuredDocumentUnit(
  state: OperationsState,
  productUnitId: string,
  requestedUnitName: string | undefined,
  context: DocumentUnitContext
) {
  const requested = requestedUnitName?.trim();
  if (!requested) return undefined;
  return configuredDocumentUnits(state, productUnitId, context).find(
    (unit) => normalizeUnitName(unit.unitName) === normalizeUnitName(requested)
  );
}

export function configuredPurchaseUnit(
  state: OperationsState,
  productUnitId: string,
  requestedUnitName?: string
) {
  return configuredDocumentUnit(state, productUnitId, requestedUnitName, "purchase");
}

export function getProductBaseUnitChangeBlockers(state: OperationsState, productUnitId: string) {
  const blockers: string[] = [];
  if (state.salesOrders.some((order) => order.lines.some((line) => line.productUnitId === productUnitId))) {
    blockers.push("vật tư đã có chứng từ bán hoặc ảnh chụp đơn vị bán");
  }
  if (state.purchaseOrders.some((order) => order.lines.some((line) => line.productUnitId === productUnitId))) {
    blockers.push("vật tư đã có chứng từ mua hoặc ảnh chụp đơn vị mua");
  }
  if (state.inventoryMovements.some((movement) => movement.productUnitId === productUnitId)) {
    blockers.push("vật tư đã có phát sinh kho");
  }
  if (state.inventoryCountSessions?.some((session) => session.lines.some((line) => line.productUnitId === productUnitId))) {
    blockers.push("vật tư đã có phiếu kiểm kê");
  }
  const product = state.productUnits.find((item) => item.id === productUnitId);
  if ((product?.reorderPolicies?.length ?? 0) > 0) {
    blockers.push("vật tư đang có ngưỡng tồn kho");
  }
  if (state.purchaseUnitConversions.some((conversion) => conversion.productUnitId === productUnitId)) {
    blockers.push("vật tư đang có quy đổi đơn vị");
  }
  return blockers;
}
