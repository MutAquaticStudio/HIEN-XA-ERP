import { createHash } from "node:crypto";
import type {
  DocumentUnitSnapshot,
  OperationsState,
  ProductUnit,
  PurchaseOrderLine,
  SalesOrderLine
} from "@/modules/operations/types";
import {
  createDeterministicLegacyUuid,
  createLegacyIdMap,
  inspectOperationsStateForCutover,
  type CutoverLegacyIdMap,
  type CutoverSource
} from "./operations-cutover";
import {
  assertOperationsCutoverMappings,
  type CutoverMappingOverrides
} from "./operations-cutover-overrides";

export type CatalogOrderCutoverRow = {
  id: string;
  legacyId: string;
  values: Record<string, unknown>;
};

export type CatalogOrderCutoverBatch = {
  name: string;
  table: string;
  operation: "insert" | "update";
  rows: CatalogOrderCutoverRow[];
};

export type CatalogOrderCutoverPlan = {
  planVersion: 1;
  scope: "catalog_order_delivery";
  isComplete: false;
  source: CutoverSource;
  sourceChecksum: string;
  cutoverDate: string;
  generatedAt: string;
  idMap: CutoverLegacyIdMap[];
  batches: CatalogOrderCutoverBatch[];
  deferredCollections: string[];
  planChecksum: string;
};

export type UnsignedCatalogOrderCutoverPlan = Omit<CatalogOrderCutoverPlan, "planChecksum">;

export type CreateCatalogOrderCutoverPlanInput = {
  namespace: string;
  sourceRevision: number;
  stateSchemaVersion: number;
  cutoverDate: string;
  generatedAt?: string;
  mappingOverrides: CutoverMappingOverrides;
};

type IdResolver = {
  legacy(entityType: string, legacyId: string): string;
  derived(entityType: string, legacyId: string): string;
};

type ProductUnitTarget = {
  id: string;
  legacyId: string;
  productId: string;
  unitId: string;
  unitName: string;
  baseUnitName: string;
  factorToBase: number;
  status: ProductUnit["status"];
};

type CatalogPlanContext = {
  batches: CatalogOrderCutoverBatch[];
  productUnits: Map<string, ProductUnitTarget>;
  purchaseUnitAlternatives: Map<string, ProductUnitTarget>;
};

const DEFERRED_COLLECTIONS = [
  "inventoryMovements",
  "approvalRequests",
  "customerLedgerEntries",
  "supplierLedgerEntries",
  "employeeLedgerEntries",
  "customerPayments",
  "supplierPayments",
  "employeePayments",
  "employeeAdvances",
  "cashTransactions",
  "cashVouchers",
  "bankTransferProofs",
  "workOrders",
  "compensationBatches",
  "importJobs",
  "importIssues",
  "auditLogs",
  "processedOperations"
] as const;

export function createCatalogOrderCutoverPlan(
  state: OperationsState,
  input: CreateCatalogOrderCutoverPlanInput
): CatalogOrderCutoverPlan {
  assertDate(input.cutoverDate, "cutoverDate");
  const manifest = inspectOperationsStateForCutover(state, {
    namespace: input.namespace,
    revision: input.sourceRevision,
    stateSchemaVersion: input.stateSchemaVersion,
    now: input.generatedAt
  });
  if (!manifest.ready) {
    throw new Error(`CUTOVER_STATE_BLOCKED: ${manifest.issues.map((issue) => issue.code).join(", ")}`);
  }
  assertOperationsCutoverMappings(state, input.mappingOverrides);

  const idMap = createLegacyIdMap(state, input.namespace);
  const ids = createIdResolver(idMap, input.namespace);
  const catalog = buildCatalogPlan(state, ids, input);
  const documentBatches = buildOrderAndDeliveryBatches(state, ids, catalog, input);
  const batches = [...catalog.batches, ...documentBatches];
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const unsignedPlan: UnsignedCatalogOrderCutoverPlan = {
    planVersion: 1 as const,
    scope: "catalog_order_delivery" as const,
    isComplete: false as const,
    source: manifest.source,
    sourceChecksum: manifest.sourceChecksum,
    cutoverDate: input.cutoverDate,
    generatedAt,
    idMap,
    batches,
    deferredCollections: [...DEFERRED_COLLECTIONS]
  };

  return {
    ...unsignedPlan,
    planChecksum: calculateCatalogOrderCutoverPlanChecksum(unsignedPlan)
  };
}

export function calculateCatalogOrderCutoverPlanChecksum(
  plan: CatalogOrderCutoverPlan | UnsignedCatalogOrderCutoverPlan
) {
  const { planChecksum: _planChecksum, ...unsignedPlan } = plan as CatalogOrderCutoverPlan;
  return checksum(unsignedPlan);
}

function buildCatalogPlan(
  state: OperationsState,
  ids: IdResolver,
  input: CreateCatalogOrderCutoverPlanInput
): CatalogPlanContext {
  const unitByNormalizedName = new Map<string, { id: string; name: string }>();
  const unitRows = state.unitDefinitions
    .slice()
    .sort(compareId)
    .map((unit) => {
      const normalizedName = normalizeName(unit.name);
      if (!normalizedName || unitByNormalizedName.has(normalizedName)) {
        throw new Error(`CUTOVER_UNIT_NAME_AMBIGUOUS: Unit ${unit.id} has an empty or duplicate normalized name.`);
      }
      const targetId = ids.legacy("unit", unit.id);
      unitByNormalizedName.set(normalizedName, { id: targetId, name: unit.name });
      return row(targetId, unit.id, {
        code: toCode(unit.name, unit.id),
        name: unit.name,
        legacy_runtime_id: unit.id
      });
    });

  const customerRows = state.customers.slice().sort(compareId).map((customer) => row(ids.legacy("customer", customer.id), customer.id, {
    code: customer.code,
    display_name: customer.displayName,
    normalized_name: normalizeName(customer.displayName),
    phone: nullable(customer.phone),
    credit_limit: customer.creditLimit,
    payment_term_days: 0,
    status: customer.status,
    legacy_runtime_id: customer.id
  }));
  const supplierRows = state.suppliers.slice().sort(compareId).map((supplier) => row(ids.legacy("supplier", supplier.id), supplier.id, {
    code: supplier.code,
    display_name: supplier.displayName,
    normalized_name: normalizeName(supplier.displayName),
    phone: nullable(supplier.phone),
    payment_term_days: 0,
    status: supplier.status,
    legacy_runtime_id: supplier.id
  }));
  const employeeRows = state.employees.slice().sort(compareId).map((employee) => row(ids.legacy("employee", employee.id), employee.id, {
    auth_user_id: input.mappingOverrides.identityAliases?.[employee.id] ?? null,
    code: employee.code,
    display_name: employee.displayName,
    normalized_name: normalizeName(employee.displayName),
    role_type: employee.roleType,
    status: employee.status,
    legacy_runtime_id: employee.id
  }));
  const warehouseRows = state.warehouses.slice().sort(compareId).map((warehouse) => row(ids.legacy("warehouse", warehouse.id), warehouse.id, {
    code: warehouse.code,
    name: warehouse.name,
    status: warehouse.status,
    legacy_runtime_id: warehouse.id
  }));
  const vehicleRows = state.vehicles.slice().sort(compareId).map((vehicle) => row(ids.legacy("vehicle", vehicle.id), vehicle.id, {
    code: vehicle.code,
    plate_number: vehicle.plateNumber,
    capacity_tons: vehicle.capacityTons,
    status: vehicle.status,
    legacy_runtime_id: vehicle.id
  }));

  const productGroups = groupBy(state.productUnits.slice().sort(compareId), (productUnit) => productUnit.productCode);
  const productRows: CatalogOrderCutoverRow[] = [];
  const productUnitRows: CatalogOrderCutoverRow[] = [];
  const priceRuleRows: CatalogOrderCutoverRow[] = [];
  const productUnits = new Map<string, ProductUnitTarget>();
  const purchaseUnitAlternatives = new Map<string, ProductUnitTarget>();

  for (const [productCode, runtimeUnits] of [...productGroups].sort(([left], [right]) => left.localeCompare(right))) {
    const productNames = new Set(runtimeUnits.map((unit) => unit.productName));
    if (!productCode.trim() || productNames.size !== 1) {
      throw new Error(`CUTOVER_PRODUCT_AMBIGUOUS: Product code ${productCode || "(empty)"} has inconsistent runtime metadata.`);
    }
    const productId = ids.derived("product", productCode);
    productRows.push(row(productId, productCode, {
      code: productCode,
      name: runtimeUnits[0].productName,
      normalized_name: normalizeName(runtimeUnits[0].productName),
      category_id: null,
      status: runtimeUnits.every((unit) => unit.status === "inactive") ? "inactive" : "active",
      legacy_runtime_id: productCode
    }));

    const baseRuntimeUnit = resolveBaseRuntimeUnit(runtimeUnits, input.mappingOverrides, productCode);
    const baseUnitName = baseRuntimeUnit.unitName;
    const targetUnitsByDbUnitId = new Map<string, ProductUnitTarget>();
    for (const runtimeUnit of runtimeUnits) {
      const unit = unitByNormalizedName.get(normalizeName(runtimeUnit.unitName));
      if (!unit) {
        throw new Error(`CUTOVER_PRODUCT_UNIT_DEFINITION_REQUIRED: Product unit ${runtimeUnit.id} references an unknown unit ${runtimeUnit.unitName}.`);
      }
      const factorToBase = runtimeUnit.id === baseRuntimeUnit.id
        ? 1
        : resolveRuntimeProductUnitFactor(state, baseRuntimeUnit, runtimeUnit, unit.id, ids);
      const target = {
        id: ids.legacy("product_unit", runtimeUnit.id),
        legacyId: runtimeUnit.id,
        productId,
        unitId: unit.id,
        unitName: unit.name,
        baseUnitName,
        factorToBase,
        status: runtimeUnit.status
      } satisfies ProductUnitTarget;
      if (targetUnitsByDbUnitId.has(target.unitId)) {
        throw new Error(`CUTOVER_PRODUCT_UNIT_DUPLICATE: Product ${productCode} contains more than one runtime row for unit ${unit.name}.`);
      }
      targetUnitsByDbUnitId.set(target.unitId, target);
      productUnits.set(runtimeUnit.id, target);
      productUnitRows.push(productUnitRow(target, runtimeUnit.id, runtimeUnit.id === baseRuntimeUnit.id));
      if (runtimeUnit.salePrice !== undefined) {
        priceRuleRows.push(priceRuleRow(ids, target, runtimeUnit, input.cutoverDate));
      }
    }

    for (const conversion of state.purchaseUnitConversions.filter((item) => runtimeUnits.some((unit) => unit.id === item.productUnitId)).sort(compareId)) {
      const baseTarget = productUnits.get(conversion.productUnitId);
      const sourceRuntimeUnit = state.productUnits.find((unit) => unit.id === conversion.productUnitId);
      const destinationUnit = state.unitDefinitions.find((unit) => unit.id === conversion.unitId);
      if (!baseTarget || !sourceRuntimeUnit || !destinationUnit) {
        throw new Error(`CUTOVER_PURCHASE_UNIT_CONVERSION_REFERENCE_INVALID: Conversion ${conversion.id} has an unresolved source or unit.`);
      }
      if (conversion.conversionMode !== "fixed" || conversion.factorToBase === null || conversion.factorToBase <= 0) {
        throw new Error(`CUTOVER_PURCHASE_UNIT_CONVERSION_FIXED_FACTOR_REQUIRED: Conversion ${conversion.id} cannot be loaded as a numeric product unit.`);
      }
      const destination = unitByNormalizedName.get(normalizeName(destinationUnit.name));
      if (!destination) {
        throw new Error(`CUTOVER_PURCHASE_UNIT_CONVERSION_UNIT_REQUIRED: Conversion ${conversion.id} references an unmapped unit.`);
      }
      if (targetUnitsByDbUnitId.has(destination.id)) {
        throw new Error(`CUTOVER_PURCHASE_UNIT_CONVERSION_DUPLICATE: Conversion ${conversion.id} duplicates a product unit for ${destinationUnit.name}.`);
      }
      const target = {
        id: ids.legacy("purchase_unit_conversion", conversion.id),
        legacyId: conversion.id,
        productId,
        unitId: destination.id,
        unitName: destination.name,
        baseUnitName,
        factorToBase: conversion.factorToBase,
        status: sourceRuntimeUnit.status
      } satisfies ProductUnitTarget;
      targetUnitsByDbUnitId.set(target.unitId, target);
      purchaseUnitAlternatives.set(`${conversion.productUnitId}:${conversion.unitId}`, target);
      productUnitRows.push(productUnitRow(target, conversion.id, false));
    }
  }

  return {
    productUnits,
    purchaseUnitAlternatives,
    batches: [
      batch("master.customers", "customers", "insert", customerRows),
      batch("master.suppliers", "suppliers", "insert", supplierRows),
      batch("master.employees", "employees", "insert", employeeRows),
      batch("master.units", "units", "insert", unitRows),
      batch("master.products", "products", "insert", productRows),
      batch("master.product-units", "product_units", "insert", productUnitRows),
      batch("master.price-rules", "price_rules", "insert", priceRuleRows),
      batch("master.warehouses", "warehouses", "insert", warehouseRows),
      batch("master.vehicles", "vehicles", "insert", vehicleRows)
    ]
  };
}

function buildOrderAndDeliveryBatches(
  state: OperationsState,
  ids: IdResolver,
  catalog: CatalogPlanContext,
  input: CreateCatalogOrderCutoverPlanInput
): CatalogOrderCutoverBatch[] {
  const salesOrderRows: CatalogOrderCutoverRow[] = [];
  const salesItemRows: CatalogOrderCutoverRow[] = [];
  const salesItemLinkRows: CatalogOrderCutoverRow[] = [];
  for (const order of state.salesOrders.slice().sort(compareId)) {
    const totals = calculateSalesTotals(order.lines);
    salesOrderRows.push(row(ids.legacy("sales_order", order.id), order.id, {
      document_no: order.documentNo,
      customer_id: ids.legacy("customer", order.customerId),
      order_date: dateOnly(order.orderDate, `salesOrders.${order.id}.orderDate`),
      status: order.status,
      currency: order.currency,
      net_total: totals.net,
      tax_total: totals.tax,
      gross_total: totals.gross,
      version: order.version,
      delivery_address: nullable(order.deliveryAddress),
      customer_note: nullable(order.customerNote),
      payment_method: order.paymentMethod ?? null,
      legacy_runtime_id: order.id
    }));
    for (const line of order.lines.slice().sort(compareId)) {
      const targetUnit = resolveDocumentProductUnit(state, catalog, line.productUnitId, line.documentUnit?.unitName);
      const pricingSnapshot = makePricingSnapshot(line, targetUnit);
      salesItemRows.push(row(ids.legacy("sales_order_item", line.id), line.id, {
        sales_order_id: ids.legacy("sales_order", order.id),
        product_unit_id: targetUnit.id,
        quantity: line.quantity,
        delivered_quantity: line.deliveredQuantity,
        unit_price: line.unitPrice,
        discount_amount: 0,
        tax_rate: line.taxRate,
        net_amount: money(line.quantity * line.unitPrice),
        tax_amount: money(line.quantity * line.unitPrice * line.taxRate),
        gross_amount: money(line.quantity * line.unitPrice * (1 + line.taxRate)),
        pricing_snapshot: pricingSnapshot,
        source_type: line.sourceType ?? null,
        warehouse_id: line.warehouseId ? ids.legacy("warehouse", line.warehouseId) : null,
        purchase_order_item_id: null,
        legacy_runtime_id: line.id
      }));
      if (line.purchaseOrderLineId) {
        salesItemLinkRows.push(row(ids.legacy("sales_order_item", line.id), line.id, {
          purchase_order_item_id: ids.legacy("purchase_order_item", line.purchaseOrderLineId)
        }));
      }
    }
  }

  const purchaseOrderRows: CatalogOrderCutoverRow[] = [];
  const purchaseItemRows: CatalogOrderCutoverRow[] = [];
  const purchaseDestinationRows: CatalogOrderCutoverRow[] = [];
  for (const order of state.purchaseOrders.slice().sort(compareId)) {
    purchaseOrderRows.push(row(ids.legacy("purchase_order", order.id), order.id, {
      document_no: order.documentNo,
      supplier_id: ids.legacy("supplier", order.supplierId),
      order_date: dateOnly(order.orderDate, `purchaseOrders.${order.id}.orderDate`),
      status: order.status,
      version: order.version ?? 1,
      legacy_runtime_id: order.id
    }));
    for (const line of order.lines.slice().sort(compareId)) {
      const targetUnit = resolveDocumentProductUnit(state, catalog, line.productUnitId, line.documentUnit?.unitName);
      purchaseItemRows.push(row(ids.legacy("purchase_order_item", line.id), line.id, {
        purchase_order_id: ids.legacy("purchase_order", order.id),
        product_unit_id: targetUnit.id,
        ordered_quantity: line.orderedQuantity,
        received_quantity: line.receivedQuantity,
        unit_cost: line.unitCost,
        tax_rate: line.taxRate,
        pricing_snapshot: makePricingSnapshot(line, targetUnit),
        legacy_runtime_id: line.id
      }));
      purchaseDestinationRows.push(row(ids.legacy("purchase_destination", line.id), line.id, {
        purchase_order_item_id: ids.legacy("purchase_order_item", line.id),
        destination_type: line.destinationType,
        warehouse_id: line.warehouseId ? ids.legacy("warehouse", line.warehouseId) : null,
        customer_id: line.customerId ? ids.legacy("customer", line.customerId) : null,
        sales_order_item_id: line.salesOrderLineId ? ids.legacy("sales_order_item", line.salesOrderLineId) : null,
        quantity: line.orderedQuantity,
        legacy_runtime_id: line.id
      }));
    }
  }

  const deliveryJobRows: CatalogOrderCutoverRow[] = [];
  const deliveryAssignmentRows: CatalogOrderCutoverRow[] = [];
  const deliveryItemRows: CatalogOrderCutoverRow[] = [];
  const jobsBySalesOrder = groupBy(state.deliveryJobs, (job) => job.salesOrderId);
  for (const job of state.deliveryJobs.slice().sort(compareId)) {
    deliveryJobRows.push(row(ids.legacy("delivery_job", job.id), job.id, {
      document_no: job.documentNo,
      sales_order_id: ids.legacy("sales_order", job.salesOrderId),
      vehicle_id: ids.legacy("vehicle", job.vehicleId),
      driver_id: ids.legacy("employee", job.driverId),
      planned_date: dateOnly(job.plannedDate, `deliveryJobs.${job.id}.plannedDate`),
      status: job.status,
      version: 1,
      recipient_name: nullable(job.recipientName),
      evidence_reference: nullable(job.evidence),
      failure_reason: nullable(job.failureReason),
      confirmed_at: job.confirmedAt ?? null,
      legacy_runtime_id: job.id
    }));
    deliveryAssignmentRows.push(row(ids.derived("delivery_assignment", `${job.id}:${job.driverId}:driver`), `${job.id}:${job.driverId}:driver`, {
      delivery_job_id: ids.legacy("delivery_job", job.id),
      employee_id: ids.legacy("employee", job.driverId),
      assignment_role: "driver",
      legacy_runtime_id: `${job.id}:${job.driverId}:driver`
    }));
    for (const helperId of job.helperIds.slice().sort()) {
      deliveryAssignmentRows.push(row(ids.derived("delivery_assignment", `${job.id}:${helperId}:helper`), `${job.id}:${helperId}:helper`, {
        delivery_job_id: ids.legacy("delivery_job", job.id),
        employee_id: ids.legacy("employee", helperId),
        assignment_role: "helper",
        legacy_runtime_id: `${job.id}:${helperId}:helper`
      }));
    }

    const order = state.salesOrders.find((candidate) => candidate.id === job.salesOrderId);
    if (!order) {
      throw new Error(`CUTOVER_DELIVERY_ORDER_REQUIRED: Delivery job ${job.id} references an unknown sales order.`);
    }
    const jobsForOrder = jobsBySalesOrder.get(job.salesOrderId) ?? [];
    const allocations = jobsForOrder.length > 1
      ? input.mappingOverrides.deliveryLineAllocations?.[job.id] ?? {}
      : Object.fromEntries(order.lines.map((line) => [line.id, line.quantity]));
    for (const line of order.lines.slice().sort(compareId)) {
      const plannedQuantity = allocations[line.id] ?? 0;
      if (plannedQuantity <= 0) continue;
      const deliveredQuantity = job.status === "delivered" ? plannedQuantity : 0;
      deliveryItemRows.push(row(ids.derived("delivery_item", `${job.id}:${line.id}`), `${job.id}:${line.id}`, {
        delivery_job_id: ids.legacy("delivery_job", job.id),
        sales_order_item_id: ids.legacy("sales_order_item", line.id),
        planned_quantity: plannedQuantity,
        delivered_quantity: deliveredQuantity,
        legacy_runtime_id: `${job.id}:${line.id}`
      }));
    }
  }

  return [
    batch("sales.orders", "sales_orders", "insert", salesOrderRows),
    batch("sales.items", "sales_order_items", "insert", salesItemRows),
    batch("procurement.orders", "purchase_orders", "insert", purchaseOrderRows),
    batch("procurement.items", "purchase_order_items", "insert", purchaseItemRows),
    batch("procurement.destinations", "purchase_destinations", "insert", purchaseDestinationRows),
    batch("sales.items.purchase-links", "sales_order_items", "update", salesItemLinkRows),
    batch("delivery.jobs", "delivery_jobs", "insert", deliveryJobRows),
    batch("delivery.assignments", "delivery_assignments", "insert", deliveryAssignmentRows),
    batch("delivery.items", "delivery_items", "insert", deliveryItemRows)
  ];
}

function resolveBaseRuntimeUnit(
  units: ProductUnit[],
  overrides: CutoverMappingOverrides,
  productCode: string
) {
  if (units.length === 1) return units[0];
  const baseUnitId = overrides.productBaseUnits?.[productCode];
  const baseUnit = units.find((unit) => unit.id === baseUnitId);
  if (!baseUnit) {
    throw new Error(`CUTOVER_PRODUCT_BASE_UNIT_REQUIRED: Product ${productCode} needs an explicit runtime base unit.`);
  }
  return baseUnit;
}

function resolveRuntimeProductUnitFactor(
  state: OperationsState,
  baseRuntimeUnit: ProductUnit,
  runtimeUnit: ProductUnit,
  targetUnitId: string,
  ids: IdResolver
) {
  const sourceUnit = state.unitDefinitions.find((unit) => ids.legacy("unit", unit.id) === targetUnitId);
  const conversion = state.purchaseUnitConversions.find((item) => item.productUnitId === baseRuntimeUnit.id && item.unitId === sourceUnit?.id);
  if (!conversion || conversion.conversionMode !== "fixed" || conversion.factorToBase === null || conversion.factorToBase <= 0) {
    throw new Error(`CUTOVER_PRODUCT_UNIT_CONVERSION_REQUIRED: Product unit ${runtimeUnit.id} needs a fixed conversion from base unit ${baseRuntimeUnit.id}.`);
  }
  return conversion.factorToBase;
}

function resolveDocumentProductUnit(
  state: OperationsState,
  catalog: CatalogPlanContext,
  runtimeProductUnitId: string,
  documentUnitName: string | undefined
) {
  const primary = catalog.productUnits.get(runtimeProductUnitId);
  if (!primary) {
    throw new Error(`CUTOVER_DOCUMENT_PRODUCT_UNIT_UNKNOWN: Runtime product unit ${runtimeProductUnitId} is not mapped.`);
  }
  if (!documentUnitName || normalizeName(documentUnitName) === normalizeName(primary.unitName)) return primary;
  const destinationUnit = state.unitDefinitions.find((unit) => normalizeName(unit.name) === normalizeName(documentUnitName));
  const alternative = destinationUnit ? catalog.purchaseUnitAlternatives.get(`${runtimeProductUnitId}:${destinationUnit.id}`) : undefined;
  if (!alternative) {
    throw new Error(`CUTOVER_DOCUMENT_UNIT_CONVERSION_REQUIRED: Product unit ${runtimeProductUnitId} has no fixed target unit for ${documentUnitName}.`);
  }
  return alternative;
}

function productUnitRow(target: ProductUnitTarget, legacyId: string, isBase: boolean) {
  return row(target.id, legacyId, {
    product_id: target.productId,
    unit_id: target.unitId,
    conversion_factor: target.factorToBase,
    is_base: isBase,
    status: target.status,
    legacy_runtime_id: legacyId
  });
}

function priceRuleRow(ids: IdResolver, target: ProductUnitTarget, runtimeUnit: ProductUnit, effectiveFrom: string) {
  return row(ids.derived("price_rule", `${runtimeUnit.id}:${effectiveFrom}`), `${runtimeUnit.id}:${effectiveFrom}`, {
    product_unit_id: target.id,
    unit_price: runtimeUnit.salePrice ?? 0,
    tax_rate: runtimeUnit.saleTaxRate ?? 0,
    effective_from: effectiveFrom,
    effective_to: null,
    status: runtimeUnit.status,
    legacy_runtime_id: runtimeUnit.id
  });
}

function makePricingSnapshot(line: SalesOrderLine | PurchaseOrderLine, target: ProductUnitTarget) {
  const supplied = line.documentUnit;
  const unitAmount = "unitPrice" in line ? line.unitPrice : line.unitCost;
  const snapshot: DocumentUnitSnapshot = supplied ?? {
    unitName: target.unitName,
    baseUnitName: target.baseUnitName,
    factorToBase: target.factorToBase,
    quantity: "quantity" in line ? line.quantity : line.orderedQuantity,
    unitAmount,
    conversionMode: "fixed"
  };
  return {
    source: "runtime_cutover",
    unit_name: snapshot.unitName,
    base_unit_name: snapshot.baseUnitName,
    factor_to_base: snapshot.factorToBase,
    quantity: snapshot.quantity,
    unit_amount: snapshot.unitAmount,
    conversion_mode: snapshot.conversionMode ?? "fixed"
  };
}

function calculateSalesTotals(lines: SalesOrderLine[]) {
  return lines.reduce((totals, line) => {
    const net = money(line.quantity * line.unitPrice);
    const tax = money(net * line.taxRate);
    return {
      net: money(totals.net + net),
      tax: money(totals.tax + tax),
      gross: money(totals.gross + net + tax)
    };
  }, { net: 0, tax: 0, gross: 0 });
}

function createIdResolver(map: CutoverLegacyIdMap[], namespace: string): IdResolver {
  const values = new Map(map.map((entry) => [`${entry.entityType}:${entry.legacyId}`, entry.targetId]));
  return {
    legacy(entityType, legacyId) {
      const targetId = values.get(`${entityType}:${legacyId}`);
      if (!targetId) {
        throw new Error(`CUTOVER_LEGACY_ID_MAPPING_REQUIRED: ${entityType} ${legacyId} has no deterministic target id.`);
      }
      return targetId;
    },
    derived(entityType, legacyId) {
      return createDeterministicLegacyUuid(namespace, entityType, legacyId);
    }
  };
}

function batch(name: string, table: string, operation: "insert" | "update", rows: CatalogOrderCutoverRow[]): CatalogOrderCutoverBatch {
  return { name, table, operation, rows: rows.slice().sort((left, right) => left.id.localeCompare(right.id)) };
}

function row(id: string, legacyId: string, values: Record<string, unknown>): CatalogOrderCutoverRow {
  return { id, legacyId, values };
}

function groupBy<T>(values: T[], getKey: (value: T) => string) {
  const result = new Map<string, T[]>();
  for (const value of values) {
    const key = getKey(value);
    const group = result.get(key) ?? [];
    group.push(value);
    result.set(key, group);
  }
  return result;
}

function compareId<T extends { id: string }>(left: T, right: T) {
  return left.id.localeCompare(right.id);
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toCode(value: string, fallback: string) {
  const normalized = normalizeName(value).replace(/\s+/g, "_").toUpperCase();
  return normalized || `UNIT_${createHash("sha256").update(fallback).digest("hex").slice(0, 12).toUpperCase()}`;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nullable(value: string | undefined) {
  return value?.trim() ? value : null;
}

function dateOnly(value: string, path: string) {
  const date = value.slice(0, 10);
  assertDate(date, path);
  return date;
}

function assertDate(value: string, path: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new Error(`CUTOVER_DATE_INVALID: ${path} must be an ISO calendar date.`);
  }
}

function checksum(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
