import type {
  CanonicalUnitConversionMode,
  OperationsState,
  ProductUnit,
  PurchaseUnitConversion,
  PurchaseUnitConversionMode,
  UnitConversionContext,
  UnitDensityMetadata,
  UnitDimensionMetadata
} from "./types";

export const unitConversionContexts = ["PURCHASE", "SALES", "INVENTORY_DISPLAY", "PORTAL", "LOGISTICS"] as const;

export type ResolvedProductUnitConversion = PurchaseUnitConversion & {
  canonicalMode: CanonicalUnitConversionMode;
  factorToBase: number | null;
  allowedContexts: UnitConversionContext[];
  status: "active" | "inactive";
};

export function canonicalUnitConversionMode(mode: PurchaseUnitConversionMode): CanonicalUnitConversionMode {
  if (mode === "fixed") return "FIXED_RATIO";
  if (mode === "variable") return "VARIABLE_ACTUAL";
  return mode;
}

export function isVariableActualMode(mode: PurchaseUnitConversionMode) {
  return canonicalUnitConversionMode(mode) === "VARIABLE_ACTUAL";
}

export function isDeterministicConversionMode(mode: PurchaseUnitConversionMode) {
  return !isVariableActualMode(mode);
}

export function defaultAllowedContexts(mode: PurchaseUnitConversionMode): UnitConversionContext[] {
  return isVariableActualMode(mode)
    ? ["PURCHASE", "LOGISTICS"]
    : [...unitConversionContexts];
}

export function normalizedAllowedContexts(conversion: Pick<PurchaseUnitConversion, "conversionMode" | "allowedContexts">) {
  const configured = conversion.allowedContexts ?? defaultAllowedContexts(conversion.conversionMode);
  return unitConversionContexts.filter((context) => configured.includes(context));
}

export function resolveProductUnitConversions(state: OperationsState, productUnitId: string): ResolvedProductUnitConversion[] {
  const product = requireProduct(state, productUnitId);
  const records = state.purchaseUnitConversions.filter((item) => item.productUnitId === product.id);
  assertUniqueRecords(records);
  const recordsByUnitId = new Map(records.map((record) => [record.unitId, record]));
  const baseUnitId = state.unitDefinitions.find(
    (unit) => normalizeUnit(unit.name) === normalizeUnit(product.unitName)
  )?.id;
  const resolvedFactors = new Map<string, number | null>();

  function resolve(record: PurchaseUnitConversion, stack: string[]): number | null {
    if (resolvedFactors.has(record.unitId)) return resolvedFactors.get(record.unitId)!;
    if (stack.includes(record.unitId)) {
      const cycle = [...stack.slice(stack.indexOf(record.unitId)), record.unitId].join(" → ");
      throw new Error(`Chuỗi quy đổi tạo vòng lặp: ${cycle}.`);
    }
    assertConversionShape(product, record);
    const mode = canonicalUnitConversionMode(record.conversionMode);
    if (mode === "VARIABLE_ACTUAL") {
      resolvedFactors.set(record.unitId, null);
      return null;
    }
    let factor: number;
    if (mode === "MULTI_LEVEL") {
      const factorToParent = positive(record.factorToParent, "Hệ số về đơn vị cha");
      const parentUnitId = record.parentUnitId;
      if (!parentUnitId) throw new Error("Quy đổi nhiều cấp phải chọn đơn vị cha.");
      if (parentUnitId === record.unitId) throw new Error("Đơn vị không thể làm đơn vị cha của chính nó.");
      if (parentUnitId === baseUnitId) {
        factor = factorToParent;
      } else {
        const parent = recordsByUnitId.get(parentUnitId);
        if (!parent) throw new Error("Đơn vị cha phải là đơn vị gốc hoặc một quy đổi cùng vật tư.");
        const parentFactor = resolve(parent, [...stack, record.unitId]);
        if (parentFactor === null) throw new Error("Quy đổi nhiều cấp không được đi qua đơn vị theo số thực nhận.");
        factor = factorToParent * parentFactor;
      }
    } else if (mode === "DIMENSION_BASED") {
      factor = dimensionFactor(product, record.dimensionMetadata);
    } else if (mode === "DENSITY_BASED") {
      factor = densityFactor(product, record.densityMetadata);
    } else {
      if (record.parentUnitId) throw new Error("Chỉ quy đổi nhiều cấp mới được khai báo đơn vị cha.");
      factor = positive(record.factorToBase, "Hệ số về đơn vị gốc");
    }
    if (!Number.isFinite(factor) || factor <= 0) throw new Error("Hệ số quy đổi dẫn xuất phải lớn hơn 0.");
    resolvedFactors.set(record.unitId, factor);
    return factor;
  }

  return records.map((record) => {
    const allowedContexts = normalizedAllowedContexts(record);
    assertAllowedContexts(record.conversionMode, allowedContexts);
    return {
      ...record,
      sourceUnitId: record.sourceUnitId ?? record.unitId,
      canonicalMode: canonicalUnitConversionMode(record.conversionMode),
      factorToBase: resolve(record, []),
      allowedContexts,
      status: record.status ?? "active"
    };
  });
}

export function assertValidProductUnitConversionGraph(state: OperationsState, productUnitId: string) {
  resolveProductUnitConversions(state, productUnitId);
}

export function refreshDerivedConversionFactors(state: OperationsState, productUnitId: string, now: string, editedId?: string) {
  const resolved = resolveProductUnitConversions(state, productUnitId);
  for (const item of resolved) {
    const stored = state.purchaseUnitConversions.find((record) => record.id === item.id)!;
    const nextFactor = item.factorToBase;
    if (stored.factorToBase !== nextFactor) {
      stored.factorToBase = nextFactor;
      if (stored.id !== editedId) stored.version += 1;
      stored.updatedAt = now;
    }
  }
}

export function previewProductUnitConversion(
  state: OperationsState,
  candidate: Omit<PurchaseUnitConversion, "id" | "version" | "updatedAt" | "factorToBase"> & { id?: string; factorToBase?: number | null }
) {
  const draft = structuredClone(state);
  const existingIndex = draft.purchaseUnitConversions.findIndex(
    (item) => item.productUnitId === candidate.productUnitId && item.unitId === candidate.unitId
  );
  const record: PurchaseUnitConversion = {
    id: candidate.id ?? (existingIndex >= 0 ? draft.purchaseUnitConversions[existingIndex]!.id : "preview-conversion"),
    version: existingIndex >= 0 ? draft.purchaseUnitConversions[existingIndex]!.version : 1,
    updatedAt: "preview",
    ...candidate,
    factorToBase: candidate.factorToBase ?? null
  };
  if (existingIndex >= 0) draft.purchaseUnitConversions[existingIndex] = record;
  else draft.purchaseUnitConversions.push(record);
  return resolveProductUnitConversions(draft, candidate.productUnitId).find((item) => item.unitId === candidate.unitId)!;
}

function assertUniqueRecords(records: PurchaseUnitConversion[]) {
  const unitIds = new Set<string>();
  for (const record of records) {
    if (unitIds.has(record.unitId)) throw new Error("Một vật tư không được có hai đường quy đổi cho cùng một đơn vị.");
    unitIds.add(record.unitId);
  }
}

function assertConversionShape(product: ProductUnit, record: PurchaseUnitConversion) {
  if (record.sourceUnitId && record.sourceUnitId !== record.unitId) {
    throw new Error("Đơn vị nguồn phải trùng đơn vị đang được cấu hình.");
  }
  const mode = canonicalUnitConversionMode(record.conversionMode);
  if (record.allowedContexts && new Set(record.allowedContexts).size !== record.allowedContexts.length) {
    throw new Error("Ngữ cảnh quy đổi không được lặp.");
  }
  if (mode === "VARIABLE_ACTUAL") {
    if (record.factorToBase !== null && record.factorToBase !== undefined) {
      throw new Error("Đơn vị theo số thực nhận không lưu hệ số cố định.");
    }
    if (record.parentUnitId || record.factorToParent !== undefined || record.dimensionMetadata || record.densityMetadata) {
      throw new Error("Đơn vị theo số thực nhận không được khai báo công thức xác định.");
    }
  }
  if (mode !== "MULTI_LEVEL" && record.factorToParent !== undefined) {
    throw new Error("Hệ số về đơn vị cha chỉ dùng cho quy đổi nhiều cấp.");
  }
  if (mode !== "DIMENSION_BASED" && record.dimensionMetadata) {
    throw new Error("Kích thước chỉ dùng cho quy đổi theo kích thước.");
  }
  if (mode !== "DENSITY_BASED" && record.densityMetadata) {
    throw new Error("Dữ liệu khối lượng riêng chỉ dùng cho quy đổi khối lượng-thể tích.");
  }
}

function assertAllowedContexts(mode: PurchaseUnitConversionMode, contexts: UnitConversionContext[]) {
  const configured = new Set(contexts);
  if (contexts.length === 0) throw new Error("Quy đổi phải được cho phép trong ít nhất một ngữ cảnh.");
  if (configured.size !== contexts.length) throw new Error("Ngữ cảnh quy đổi không được lặp.");
  if (isVariableActualMode(mode) && contexts.some((context) => context !== "PURCHASE" && context !== "LOGISTICS")) {
    throw new Error("Đơn vị theo số thực nhận chỉ được dùng cho mua hàng hoặc logistics.");
  }
}

function dimensionFactor(product: ProductUnit, metadata: UnitDimensionMetadata | undefined) {
  if (!metadata) throw new Error("Quy đổi theo kích thước cần thông số kích thước.");
  if (metadata.sourceDimension !== "COUNT" || metadata.targetDimension !== product.inventoryDimension) {
    throw new Error("Chiều đo quy đổi không khớp đơn vị tồn kho gốc của vật tư.");
  }
  const length = positive(metadata.lengthMeters, "Chiều dài");
  if (metadata.targetDimension === "LENGTH") {
    if (metadata.widthMeters !== undefined || metadata.heightMeters !== undefined) throw new Error("Quy đổi chiều dài không dùng chiều rộng hoặc chiều dày.");
    return length;
  }
  const width = positive(metadata.widthMeters, "Chiều rộng");
  if (metadata.targetDimension === "AREA") {
    if (metadata.heightMeters !== undefined) throw new Error("Quy đổi diện tích không dùng chiều dày.");
    return length * width;
  }
  if (metadata.targetDimension !== "VOLUME") throw new Error("Quy đổi kích thước chỉ hỗ trợ chiều dài, diện tích hoặc thể tích.");
  return length * width * positive(metadata.heightMeters, "Chiều dày/cao");
}

function densityFactor(product: ProductUnit, metadata: UnitDensityMetadata | undefined) {
  if (!metadata) throw new Error("Quy đổi theo khối lượng riêng cần metadata khối lượng-thể tích.");
  const density = positive(product.densityKgPerLiter, "Khối lượng riêng kg/L");
  if (metadata.sourceDimension === metadata.targetDimension) throw new Error("Quy đổi khối lượng riêng phải nối khối lượng với thể tích.");
  if (metadata.targetDimension !== product.inventoryDimension || !["MASS", "VOLUME"].includes(metadata.targetDimension)) {
    throw new Error("Chiều đích khối lượng-thể tích không khớp đơn vị tồn kho gốc.");
  }
  const sourceScale = positive(metadata.sourceToMetricFactor, "Hệ số đơn vị nguồn sang kg/L");
  const baseScale = positive(metadata.baseToMetricFactor, "Hệ số đơn vị gốc sang kg/L");
  return metadata.sourceDimension === "VOLUME"
    ? sourceScale * density / baseScale
    : sourceScale / density / baseScale;
}

function requireProduct(state: OperationsState, productUnitId: string) {
  const product = state.productUnits.find((item) => item.id === productUnitId);
  if (!product) throw new Error("Vật tư cấu hình quy đổi không tồn tại.");
  return product;
}

function positive(value: number | null | undefined, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${label} phải lớn hơn 0.`);
  return value;
}

function normalizeUnit(value: string) {
  return value.trim().toLocaleLowerCase("vi-VN").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}
