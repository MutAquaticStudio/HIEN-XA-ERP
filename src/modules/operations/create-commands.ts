import type { AuditLog, CreateCommand, OperationResult, OperationsActor, OperationsAttachment, OperationsState } from "./types";
import { configuredPurchaseUnit, normalizeUnitName } from "./unit-settings";
import { asOperationInputError } from "./errors";

type RunCreateCommandInput = {
  state: OperationsState;
  command: CreateCommand;
  actor: OperationsActor;
  now: string;
  idempotencyKey: string;
};

const createPermissions: Record<CreateCommand["type"], string> = {
  createCustomer: "parties.create_customer",
  createSupplier: "parties.create_supplier",
  createProductUnit: "catalog.create_product_unit",
  createUnitDefinition: "catalog.manage_purchase_units",
  deleteUnitDefinition: "catalog.manage_purchase_units",
  resetPurchaseUnitSettings: "catalog.manage_purchase_units",
  upsertPurchaseUnitConversion: "catalog.manage_purchase_units",
  deletePurchaseUnitConversion: "catalog.manage_purchase_units",
  createWarehouse: "catalog.create_warehouse",
  createVehicle: "catalog.create_vehicle",
  createEmployee: "parties.create_employee",
  createSalesOrderDraft: "sales.create",
  createPurchaseOrderDraft: "procurement.create",
  createDeliveryJob: "delivery.create",
  createCustomerPaymentDraft: "cash.create_receipt",
  createSupplierPaymentDraft: "cash.create_payment",
  createCashVoucherDraft: "cash.create_voucher",
  createEmployeePaymentDraft: "cash.create_employee_payment",
  createEmployeeAdvanceDraft: "cash.create_employee_advance",
  createWorkOrderDraft: "workforce.create",
  createImportDryRun: "import.create_dry_run",
  createImportIssue: "import.create_issue"
};

export function allCreatePermissions() {
  return Object.values(createPermissions);
}

export function runCreateCommand(input: RunCreateCommandInput): OperationResult {
  try {
    return runCreateCommandInternal(input);
  } catch (error) {
    throw asOperationInputError(error);
  }
}

function runCreateCommandInternal({
  state,
  command,
  actor,
  now,
  idempotencyKey
}: RunCreateCommandInput): OperationResult {
  if (state.processedOperations.some((entry) => entry.idempotencyKey === idempotencyKey)) {
    return {
      state,
      summary: "Yêu cầu này đã được xử lý trước đó, hệ thống không tạo trùng.",
      severity: "warning"
    };
  }

  assertPermission(actor, createPermissions[command.type]);

  const draft = structuredClone(state) as OperationsState;
  const before = createStateCounts(draft);
  const summary = applyCreateCommand(draft, command, now, actor);

  draft.processedOperations.push({
    idempotencyKey,
    operation: command.type,
    summary
  });
  draft.auditLogs.unshift(createAuditLog(
    draft,
    actor,
    command.type,
    now,
    summary,
    createPermissions[command.type],
    idempotencyKey,
    before,
    createStateCounts(draft)
  ));

  return {
    state: draft,
    summary,
    severity: "success"
  };
}

function applyCreateCommand(state: OperationsState, command: CreateCommand, now: string, actor: OperationsActor) {
  switch (command.type) {
    case "createCustomer":
      assertNonEmpty(command.displayName, "Tên khách hàng");
      assertUnique(state.customers.map((item) => item.displayName), command.displayName, "Khách hàng đã tồn tại.");
      state.customers.push({
        id: nextId("cus", state.customers.length),
        code: nextCode("KH", state.customers.length),
        displayName: command.displayName.trim(),
        phone: command.phone.trim(),
        creditLimit: assertNonNegative(command.creditLimit, "Hạn mức nợ"),
        status: "active"
      });
      return `Tạo khách hàng ${command.displayName.trim()}.`;

    case "createSupplier":
      assertNonEmpty(command.displayName, "Tên nhà cung cấp");
      assertUnique(state.suppliers.map((item) => item.displayName), command.displayName, "Nhà cung cấp đã tồn tại.");
      state.suppliers.push({
        id: nextId("sup", state.suppliers.length),
        code: nextCode("NCC", state.suppliers.length),
        displayName: command.displayName.trim(),
        phone: command.phone.trim(),
        status: "active"
      });
      return `Tạo nhà cung cấp ${command.displayName.trim()}.`;

    case "createProductUnit": {
      assertNonEmpty(command.productCode, "Mã vật tư");
      assertNonEmpty(command.productName, "Tên vật tư");
      assertNonEmpty(command.unitName, "Đơn vị");
      assertUnique(state.productUnits.map((item) => item.productCode), command.productCode, "Mã vật tư đã tồn tại.");
      const baseUnit = state.unitDefinitions.find(
        (item) => item.status === "active" && normalizeUnitName(item.name) === normalizeUnitName(command.unitName)
      );
      if (!baseUnit) {
        throw new Error("Đơn vị tồn kho chưa có trong danh mục đơn vị.");
      }
      state.productUnits.push({
        id: nextId("pu", state.productUnits.length),
        productCode: command.productCode.trim().toUpperCase(),
        productName: command.productName.trim(),
        unitName: baseUnit.name,
        status: "active"
      });
      return `Tạo vật tư ${command.productName.trim()} (${baseUnit.name}).`;
    }

    case "createUnitDefinition": {
      assertNonEmpty(command.name, "Tên đơn vị");
      assertUnique(state.unitDefinitions.map((item) => item.name), command.name, "Đơn vị đã tồn tại.");
      const unitName = command.name.trim();
      state.unitDefinitions.push({
        id: nextAvailableId("unit", state.unitDefinitions.map((item) => item.id)),
        name: unitName,
        status: "active"
      });
      return `Thêm đơn vị ${unitName} vào danh mục.`;
    }

    case "deleteUnitDefinition": {
      const unitIndex = state.unitDefinitions.findIndex((item) => item.id === command.unitId);
      const unit = state.unitDefinitions[unitIndex];
      if (!unit) {
        throw new Error("Đơn vị cần xóa không tồn tại.");
      }
      const baseProduct = state.productUnits.find(
        (product) => normalizeUnitName(product.unitName) === normalizeUnitName(unit.name)
      );
      if (baseProduct) {
        throw new Error(`Không thể xóa ${unit.name} vì đang là đơn vị tồn kho của ${baseProduct.productName}.`);
      }
      const removedConversions = state.purchaseUnitConversions.filter((item) => item.unitId === unit.id).length;
      state.purchaseUnitConversions = state.purchaseUnitConversions.filter((item) => item.unitId !== unit.id);
      state.unitDefinitions.splice(unitIndex, 1);
      return `Xóa đơn vị ${unit.name} và ${removedConversions} quy đổi hiện tại; chứng từ lịch sử được giữ nguyên.`;
    }

    case "resetPurchaseUnitSettings": {
      const baseUnitNames = new Set(state.productUnits.map((product) => normalizeUnitName(product.unitName)));
      const customUnits = state.unitDefinitions.filter((unit) => !baseUnitNames.has(normalizeUnitName(unit.name)));
      if (
        customUnits.length !== command.expectedCustomUnitCount ||
        state.purchaseUnitConversions.length !== command.expectedConversionCount
      ) {
        throw new Error("Cài đặt đơn vị mua đã thay đổi; tải lại dữ liệu trước khi xóa toàn bộ.");
      }
      const removedConversionCount = state.purchaseUnitConversions.length;
      state.purchaseUnitConversions = [];
      state.unitDefinitions = state.unitDefinitions.filter((unit) => baseUnitNames.has(normalizeUnitName(unit.name)));
      return `Xóa ${customUnits.length} đơn vị mua và ${removedConversionCount} cách tính hiện tại; giữ nguyên đơn vị tồn kho và chứng từ lịch sử.`;
    }

    case "upsertPurchaseUnitConversion": {
      const product = state.productUnits.find((item) => item.id === command.productUnitId && item.status === "active");
      if (!product) {
        throw new Error("Vật tư cấu hình quy đổi không hợp lệ.");
      }
      const unit = state.unitDefinitions.find((item) => item.id === command.unitId && item.status === "active");
      if (!unit) {
        throw new Error("Đơn vị mua không hợp lệ.");
      }
      if (normalizeUnitName(product.unitName) === normalizeUnitName(unit.name)) {
        throw new Error("Đơn vị mua trùng đơn vị tồn kho; hệ số mặc định đã bằng 1.");
      }
      const conversionMode = command.conversionMode;
      const factorToBase = conversionMode === "fixed"
        ? assertPositive(command.factorToBase ?? Number.NaN, "Hệ số quy đổi")
        : null;
      if (conversionMode === "variable" && command.factorToBase !== undefined) {
        throw new Error("Đơn vị theo thực tế không được lưu hệ số quy đổi cố định.");
      }
      const existing = state.purchaseUnitConversions.find(
        (item) => item.productUnitId === product.id && item.unitId === unit.id
      );
      if (existing) {
        if (command.expectedVersion !== existing.version) {
          throw new Error("Quy đổi đã được người khác cập nhật; tải lại dữ liệu trước khi lưu.");
        }
        existing.conversionMode = conversionMode;
        existing.factorToBase = factorToBase;
        existing.version += 1;
        existing.updatedAt = now;
        return conversionMode === "fixed"
          ? `Cập nhật quy đổi 1 ${unit.name} = ${factorToBase} ${product.unitName} cho ${product.productName}.`
          : `Cập nhật ${unit.name} theo số ${product.unitName} thực nhận trên từng đơn mua của ${product.productName}.`;
      }
      if (command.expectedVersion !== undefined && command.expectedVersion !== 0) {
        throw new Error("Phiên bản quy đổi mới không hợp lệ.");
      }
      state.purchaseUnitConversions.push({
        id: nextAvailableId("puc", state.purchaseUnitConversions.map((item) => item.id)),
        productUnitId: product.id,
        unitId: unit.id,
        conversionMode,
        factorToBase,
        version: 1,
        updatedAt: now
      });
      return conversionMode === "fixed"
        ? `Cài quy đổi 1 ${unit.name} = ${factorToBase} ${product.unitName} cho ${product.productName}.`
        : `Cài ${unit.name} theo số ${product.unitName} thực nhận trên từng đơn mua của ${product.productName}.`;
    }

    case "deletePurchaseUnitConversion": {
      const conversionIndex = state.purchaseUnitConversions.findIndex((item) => item.id === command.conversionId);
      const conversion = state.purchaseUnitConversions[conversionIndex];
      if (!conversion) {
        throw new Error("Quy đổi cần xóa không tồn tại.");
      }
      if (conversion.version !== command.expectedVersion) {
        throw new Error("Quy đổi đã được người khác cập nhật; tải lại dữ liệu trước khi xóa.");
      }
      const product = state.productUnits.find((item) => item.id === conversion.productUnitId);
      const unit = state.unitDefinitions.find((item) => item.id === conversion.unitId);
      state.purchaseUnitConversions.splice(conversionIndex, 1);
      return `Xóa quy đổi ${unit?.name ?? conversion.unitId} của ${product?.productName ?? conversion.productUnitId}; chứng từ lịch sử được giữ nguyên.`;
    }

    case "createWarehouse":
      assertNonEmpty(command.code, "Mã kho");
      assertNonEmpty(command.name, "Tên kho");
      assertUnique(state.warehouses.map((item) => item.code), command.code, "Mã kho đã tồn tại.");
      state.warehouses.push({
        id: nextId("wh", state.warehouses.length),
        code: command.code.trim().toUpperCase(),
        name: command.name.trim(),
        status: "active"
      });
      return `Tạo kho ${command.name.trim()}.`;

    case "createVehicle":
      assertNonEmpty(command.code, "Mã xe");
      assertNonEmpty(command.plateNumber, "Biển số xe");
      assertUnique(state.vehicles.map((item) => item.code), command.code, "Mã xe đã tồn tại.");
      assertUnique(state.vehicles.map((item) => item.plateNumber), command.plateNumber, "Biển số xe đã tồn tại.");
      state.vehicles.push({
        id: nextId("vehicle", state.vehicles.length),
        code: command.code.trim().toUpperCase(),
        plateNumber: command.plateNumber.trim().toUpperCase(),
        capacityTons: assertPositive(command.capacityTons, "Tải trọng xe"),
        status: "active"
      });
      return `Tạo xe ${command.code.trim().toUpperCase()} · ${command.plateNumber.trim().toUpperCase()}.`;

    case "createEmployee":
      assertNonEmpty(command.displayName, "Tên nhân viên");
      state.employees.push({
        id: nextId("emp", state.employees.length),
        code: nextCode("NV", state.employees.length),
        displayName: command.displayName.trim(),
        roleType: command.roleType,
        status: "active"
      });
      return `Tạo nhân viên ${command.displayName.trim()}.`;

    case "createSalesOrderDraft": {
      const customer = state.customers.find((item) => item.id === command.customerId && item.status === "active");
      if (!customer) {
        throw new Error("Khách hàng không hợp lệ.");
      }
      const inputLines = command.lines ?? [
        {
          productUnitId: command.productUnitId ?? "",
          quantity: command.quantity ?? Number.NaN,
          unitPrice: command.unitPrice ?? Number.NaN,
          taxRate: command.taxRate ?? Number.NaN
        }
      ];
      if (inputLines.length === 0) {
        throw new Error("Đơn bán phải có ít nhất một dòng vật tư.");
      }
      const attachments = validateDocumentAttachments(command.attachments, actor);
      const orderId = nextId("so", state.salesOrders.length);
      state.salesOrders.push({
        id: orderId,
        documentNo: nextDocumentNo("SO", state.salesOrders.length),
        customerId: customer.id,
        orderDate: today(now),
        status: "draft",
        version: 1,
        currency: "VND",
        ...(attachments ? { attachments } : {}),
        lines: inputLines.map((inputLine, index) => {
          const product = state.productUnits.find((item) => item.id === inputLine.productUnitId && item.status === "active");
          if (!product) {
            throw new Error(`Vật tư dòng ${index + 1} không hợp lệ.`);
          }
          const quantity = assertPositive(inputLine.quantity, `Số lượng dòng ${index + 1}`);
          const unitPrice = assertNonNegative(inputLine.unitPrice, `Đơn giá dòng ${index + 1}`);
          const converted = convertDocumentUnit(product.unitName, quantity, unitPrice, inputLine.unitName, inputLine.unitFactor, index);
          return {
            id: `${orderId}-line-${index + 1}`,
            productUnitId: product.id,
            quantity: converted.baseQuantity,
            deliveredQuantity: 0,
            unitPrice: converted.baseUnitAmount,
            taxRate: assertTaxRate(inputLine.taxRate),
            documentUnit: converted.snapshot
          };
        })
      });
      return `Tạo đơn bán nháp ${inputLines.length} dòng cho ${customer.displayName}.`;
    }

    case "createPurchaseOrderDraft": {
      const supplier = state.suppliers.find((item) => item.id === command.supplierId && item.status === "active");
      if (!supplier) {
        throw new Error("Nhà cung cấp không hợp lệ.");
      }
      const inputLines = command.lines ?? [
        {
          productUnitId: command.productUnitId ?? "",
          orderedQuantity: command.orderedQuantity ?? Number.NaN,
          unitCost: command.unitCost ?? Number.NaN,
          taxRate: command.taxRate ?? Number.NaN,
          destinationType: command.destinationType ?? "warehouse",
          customerId: command.customerId
        }
      ];
      if (inputLines.length === 0) {
        throw new Error("Đơn mua phải có ít nhất một dòng vật tư.");
      }
      const attachments = validateDocumentAttachments(command.attachments, actor);
      const orderId = nextId("po", state.purchaseOrders.length);
      state.purchaseOrders.push({
        id: orderId,
        documentNo: nextDocumentNo("PO", state.purchaseOrders.length),
        supplierId: supplier.id,
        orderDate: today(now),
        status: "draft",
        ...(attachments ? { attachments } : {}),
        lines: inputLines.map((inputLine, index) => {
          const product = state.productUnits.find((item) => item.id === inputLine.productUnitId && item.status === "active");
          if (!product) {
            throw new Error(`Vật tư dòng ${index + 1} không hợp lệ.`);
          }
          if (inputLine.destinationType === "customer_direct") {
            const customer = state.customers.find((item) => item.id === inputLine.customerId && item.status === "active");
            if (!customer) {
              throw new Error(`Dòng ${index + 1} giao thẳng cần chọn khách hàng nhận hợp lệ.`);
            }
          }
          const quantity = assertPositive(inputLine.orderedQuantity, `Số lượng mua dòng ${index + 1}`);
          const unitCost = assertNonNegative(inputLine.unitCost, `Giá mua dòng ${index + 1}`);
          const requestedUnitName = inputLine.unitName?.trim();
          if (!requestedUnitName) {
            throw new Error(`Dòng ${index + 1} chưa chọn đơn vị mua.`);
          }
          const configuredUnit = configuredPurchaseUnit(state, product.id, requestedUnitName);
          if (!configuredUnit) {
            throw new Error(`Đơn vị mua dòng ${index + 1} chưa được cấu hình cho ${product.productName}.`);
          }
          let factorToBase: number;
          if (configuredUnit.conversionMode === "variable") {
            if (inputLine.unitFactor !== undefined) {
              throw new Error(`Đơn vị mua dòng ${index + 1} tính theo thực tế, không nhận hệ số cố định.`);
            }
            const actualBaseQuantity = assertPositive(
              inputLine.actualBaseQuantity ?? Number.NaN,
              `Số ${product.unitName} thực nhận dòng ${index + 1}`
            );
            factorToBase = actualBaseQuantity / quantity;
          } else {
            if (inputLine.actualBaseQuantity !== undefined) {
              throw new Error(`Đơn vị mua dòng ${index + 1} dùng quy đổi cố định, không nhập số lượng thực tế riêng.`);
            }
            factorToBase = assertPositive(
              configuredUnit.factorToBase ?? Number.NaN,
              `Hệ số quy đổi dòng ${index + 1}`
            );
            if (
              inputLine.unitFactor !== undefined &&
              Math.abs(inputLine.unitFactor - factorToBase) > 0.000001
            ) {
              throw new Error(`Hệ số quy đổi dòng ${index + 1} không khớp cấu hình hiện tại.`);
            }
          }
          const converted = convertDocumentUnit(
            product.unitName,
            quantity,
            unitCost,
            configuredUnit.unitName,
            factorToBase,
            index,
            configuredUnit.conversionMode
          );
          return {
            id: `${orderId}-line-${index + 1}`,
            productUnitId: product.id,
            orderedQuantity: converted.baseQuantity,
            receivedQuantity: 0,
            unitCost: converted.baseUnitAmount,
            taxRate: assertTaxRate(inputLine.taxRate),
            documentUnit: converted.snapshot,
            destinationType: inputLine.destinationType,
            warehouseId: inputLine.destinationType === "warehouse" ? "wh-main" : undefined,
            customerId: inputLine.destinationType === "customer_direct" ? inputLine.customerId : undefined
          };
        })
      });
      return `Tạo đơn mua nháp ${inputLines.length} dòng từ ${supplier.displayName}.`;
    }

    case "createDeliveryJob": {
      const salesOrder = state.salesOrders.find((item) => item.id === command.salesOrderId);
      const driver = state.employees.find((item) => item.id === command.driverId && item.roleType === "driver");
      const vehicle = state.vehicles.find((item) => item.id === command.vehicleId && item.status === "active");
      if (!salesOrder) {
        throw new Error("Đơn bán không hợp lệ.");
      }
      if (salesOrder.status !== "allocated" && salesOrder.status !== "partially_delivered") {
        throw new Error("Chỉ tạo chuyến sau khi đơn bán đã phân bổ nguồn.");
      }
      if (!salesOrder.lines.some((line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity)) {
        throw new Error("Đơn bán không còn phần hàng qua kho cần giao.");
      }
      if (state.deliveryJobs.some((job) => job.salesOrderId === salesOrder.id && ["assigned", "loading", "in_transit"].includes(job.status))) {
        throw new Error("Đơn bán đang có chuyến giao hoạt động, không được phân công trùng.");
      }
      if (!driver) {
        throw new Error("Tài xế không hợp lệ.");
      }
      if (!vehicle) {
        throw new Error("Xe giao hàng không hợp lệ.");
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(command.plannedDate)) {
        throw new Error("Ngày giao không hợp lệ.");
      }
      const claimedWorkOrder = state.workOrders.find((workOrder) =>
        workOrder.salesOrderId === salesOrder.id &&
        workOrder.status === "assigned" &&
        workOrder.participants.length === 1 &&
        Boolean(workOrder.claimedByEmployeeId)
      );
      const claimedWorkerId = claimedWorkOrder?.claimedByEmployeeId;
      if (claimedWorkerId && !state.employees.some((employee) => employee.id === claimedWorkerId && employee.roleType === "worker" && employee.status === "active")) {
        throw new Error("Thợ đã nhận đơn không còn hoạt động.");
      }
      const overlappingJob = state.deliveryJobs.find((job) =>
        ["assigned", "loading", "in_transit"].includes(job.status) &&
        job.plannedDate === command.plannedDate &&
        (job.driverId === driver.id || job.vehicleId === vehicle.id)
      );
      if (overlappingJob) {
        throw new Error(
          overlappingJob.driverId === driver.id
            ? `Tài xế đã có chuyến ${overlappingJob.documentNo} trong ngày này.`
            : `Xe đã được xếp cho chuyến ${overlappingJob.documentNo} trong ngày này.`
        );
      }
      state.deliveryJobs.push({
        id: nextId("dj", state.deliveryJobs.length),
        documentNo: nextDocumentNo("GH", state.deliveryJobs.length),
        salesOrderId: salesOrder.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        helperIds: claimedWorkerId ? [claimedWorkerId] : [],
        plannedDate: command.plannedDate || today(now),
        status: "assigned"
      });
      return `Tạo chuyến giao cho ${salesOrder.documentNo}.`;
    }

    case "createCustomerPaymentDraft": {
      const customer = state.customers.find((item) => item.id === command.customerId && item.status === "active");
      if (!customer) {
        throw new Error("Khách hàng không hợp lệ.");
      }
      state.customerPayments.push({
        id: nextId("cp", state.customerPayments.length),
        documentNo: nextDocumentNo("PT", state.customerPayments.length),
        customerId: customer.id,
        amount: assertPositive(command.amount, "Số tiền thu"),
        status: "draft",
        allocations: []
      });
      return `Tạo phiếu thu nháp cho ${customer.displayName}.`;
    }

    case "createSupplierPaymentDraft": {
      const supplier = state.suppliers.find((item) => item.id === command.supplierId && item.status === "active");
      if (!supplier) {
        throw new Error("Nhà cung cấp không hợp lệ.");
      }
      state.supplierPayments.push({
        id: nextId("sp", state.supplierPayments.length),
        documentNo: nextDocumentNo("PC-NCC", state.supplierPayments.length),
        supplierId: supplier.id,
        amount: assertPositive(command.amount, "Số tiền chi"),
        status: "draft",
        allocations: []
      });
      return `Tạo phiếu chi nhà cung cấp ${supplier.displayName}.`;
    }

    case "createCashVoucherDraft": {
      assertNonEmpty(command.category, "Nhóm thu chi");
      assertNonEmpty(command.description, "Diễn giải");
      state.cashVouchers.push({
        id: nextId("cv", state.cashVouchers.length),
        documentNo: nextDocumentNo(command.direction === "in" ? "PT-NB" : "PC-NB", state.cashVouchers.length),
        accountName: "Tiền mặt cửa hàng",
        direction: command.direction,
        category: command.category.trim(),
        description: command.description.trim(),
        amount: assertPositive(command.amount, "Số tiền"),
        status: "draft"
      });
      return `Tạo phiếu ${command.direction === "in" ? "thu" : "chi"} nội bộ nháp.`;
    }

    case "createEmployeePaymentDraft": {
      const employee = state.employees.find((item) => item.id === command.employeeId && item.status === "active");
      if (!employee) {
        throw new Error("Nhân viên không hợp lệ.");
      }
      state.employeePayments.push({
        id: nextId("ep", state.employeePayments.length),
        documentNo: nextDocumentNo("PC-NV", state.employeePayments.length),
        employeeId: employee.id,
        amount: assertPositive(command.amount, "Số tiền thanh toán"),
        status: "draft"
      });
      return `Tạo phiếu thanh toán nhân viên ${employee.displayName}.`;
    }

    case "createEmployeeAdvanceDraft": {
      const employee = state.employees.find((item) => item.id === command.employeeId && item.status === "active");
      if (!employee) {
        throw new Error("Nhân viên không hợp lệ.");
      }
      assertNonEmpty(command.purpose, "Mục đích tạm ứng");
      state.employeeAdvances.push({
        id: nextId("ea", state.employeeAdvances.length),
        documentNo: nextDocumentNo("TU-NV", state.employeeAdvances.length),
        employeeId: employee.id,
        purpose: command.purpose.trim(),
        amount: assertPositive(command.amount, "Số tiền tạm ứng"),
        status: "draft"
      });
      return `Tạo phiếu tạm ứng nháp cho ${employee.displayName}.`;
    }

    case "createWorkOrderDraft": {
      const employee = state.employees.find((item) => item.id === command.employeeId && item.status === "active");
      const product = state.productUnits.find((item) => item.id === command.productUnitId && item.status === "active");
      if (!employee) {
        throw new Error("Nhân viên không hợp lệ.");
      }
      if (!product) {
        throw new Error("Vật tư không hợp lệ.");
      }
      const workOrderId = nextId("wo", state.workOrders.length);
      state.workOrders.push({
        id: workOrderId,
        documentNo: nextDocumentNo("CV", state.workOrders.length),
        sourceDocument: "Tạo thủ công",
        workType: "Sản lượng thủ công",
        workDate: today(now),
        status: "submitted",
        outputs: [
          {
            id: `${workOrderId}-output-1`,
            productUnitId: product.id,
            actualQuantity: assertPositive(command.actualQuantity, "Sản lượng"),
            approvedQuantity: 0,
            status: "submitted"
          }
        ],
        participants: [
          {
            employeeId: employee.id,
            shareFactor: 1
          }
        ]
      });
      state.compensationBatches.push({
        id: nextId("cb", state.compensationBatches.length),
        documentNo: nextDocumentNo("LC", state.compensationBatches.length),
        workOrderId,
        status: "draft",
        totalAmount: assertPositive(command.totalAmount, "Tổng tiền công"),
        lines: []
      });
      return `Tạo phiếu công chờ duyệt cho ${employee.displayName}.`;
    }

    case "createImportIssue":
      assertNonEmpty(command.sourceSheet, "Tên trang tính");
      assertNonEmpty(command.message, "Nội dung vấn đề");
      state.importIssues.push({
        id: nextId("imp", state.importIssues.length),
        sourceSheet: command.sourceSheet.trim(),
        rowNumber: Math.trunc(assertPositive(command.rowNumber, "Số dòng")),
        severity: command.severity,
        message: command.message.trim(),
        status: "open"
      });
      return `Tạo vấn đề import trang tính ${command.sourceSheet.trim()} dòng ${command.rowNumber}.`;

    case "createImportDryRun": {
      assertNonEmpty(command.fileName, "Tên file import");
      assertNonEmpty(command.fileHash, "Mã kiểm tra file import");
      if (state.importJobs.some((job) => job.fileHash === command.fileHash)) {
        throw new Error("Workbook này đã được chạy thử trước đó, hệ thống không tạo batch trùng.");
      }
      if (!Number.isInteger(command.rowCount) || command.rowCount < 0) {
        throw new Error("Số dòng import không hợp lệ.");
      }
      const jobId = nextId("import-job", state.importJobs.length);
      state.importJobs.push({
        id: jobId,
        fileName: command.fileName.trim(),
        fileHash: command.fileHash,
        sheetNames: command.sheetNames,
        rowCount: command.rowCount,
        issueCount: command.issues.length,
        status: command.issues.length > 0 ? "dry_run" : "reviewed",
        createdAt: now
      });
      for (const [index, issue] of command.issues.entries()) {
        assertNonEmpty(issue.sourceSheet, "Tên trang tính");
        assertNonEmpty(issue.message, "Nội dung vấn đề");
        state.importIssues.push({
          id: `${jobId}-issue-${index + 1}`,
          importJobId: jobId,
          sourceSheet: issue.sourceSheet.trim(),
          rowNumber: Math.trunc(assertPositive(issue.rowNumber, "Số dòng")),
          severity: issue.severity,
          message: issue.message.trim(),
          status: "open"
        });
      }
      return `Chạy thử ${command.fileName}: ${command.rowCount} dòng, phát hiện ${command.issues.length} vấn đề; chưa post giao dịch.`;
    }
  }
}

function validateDocumentAttachments(attachments: OperationsAttachment[] | undefined, actor: OperationsActor) {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }
  if (attachments.length > 3) {
    throw new Error("Chứng từ chỉ được đính kèm tối đa 3 ảnh.");
  }
  for (const attachment of attachments) {
    if (
      attachment.uploadedBy !== actor.id ||
      !attachment.id.trim() ||
      !attachment.fileName.trim() ||
      attachment.size <= 0 ||
      attachment.size > 8 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/i.test(attachment.sha256) ||
      !["image/jpeg", "image/png", "image/webp"].includes(attachment.contentType)
    ) {
      throw new Error("Ảnh đính kèm không hợp lệ hoặc không thuộc người gửi.");
    }
  }
  return attachments;
}

function assertPermission(actor: OperationsActor, permission: string) {
  if (!actor.permissions.includes(permission)) {
    throw new Error("Người dùng không có quyền thực hiện thao tác này.");
  }
}

function assertNonEmpty(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} không được để trống.`);
  }
}

function assertUnique(existingValues: string[], value: string, message: string) {
  const normalized = normalize(value);
  if (existingValues.some((item) => normalize(item) === normalized)) {
    throw new Error(message);
  }
}

function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} phải lớn hơn 0.`);
  }
  return value;
}

function assertNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} không được âm.`);
  }
  return value;
}

function assertTaxRate(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("VAT phải từ 0 đến 100%.");
  }
  return value;
}

function convertDocumentUnit(
  baseUnitName: string,
  quantity: number,
  unitAmount: number,
  requestedUnitName: string | undefined,
  requestedFactor: number | undefined,
  lineIndex: number,
  conversionMode: "fixed" | "variable" = "fixed"
) {
  const unitName = requestedUnitName?.trim() || baseUnitName;
  const usesBaseUnit = normalize(unitName) === normalize(baseUnitName);
  const factorToBase = usesBaseUnit
    ? 1
    : assertPositive(requestedFactor ?? Number.NaN, `Hệ số quy đổi dòng ${lineIndex + 1}`);

  if (usesBaseUnit && requestedFactor !== undefined && requestedFactor !== 1) {
    throw new Error(`Đơn vị gốc dòng ${lineIndex + 1} phải có hệ số quy đổi bằng 1.`);
  }

  return {
    baseQuantity: quantity * factorToBase,
    baseUnitAmount: unitAmount / factorToBase,
    snapshot: {
      unitName,
      baseUnitName,
      factorToBase,
      quantity,
      unitAmount,
      conversionMode
    }
  };
}

function createAuditLog(
  state: OperationsState,
  actor: OperationsActor,
  action: string,
  now: string,
  summary: string,
  permission?: string,
  correlationId?: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>
): AuditLog {
  return {
    id: nextId("audit", state.auditLogs.length),
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    action,
    entityType: "operations_workspace",
    entityId: "full_erp",
    permission,
    correlationId,
    before,
    after,
    occurredAt: now,
    summary
  };
}

function createStateCounts(state: OperationsState): Record<string, unknown> {
  return {
    customers: state.customers.length,
    suppliers: state.suppliers.length,
    employees: state.employees.length,
    productUnits: state.productUnits.length,
    unitDefinitions: state.unitDefinitions.length,
    purchaseUnitConversions: state.purchaseUnitConversions.length,
    warehouses: state.warehouses.length,
    vehicles: state.vehicles.length,
    salesOrders: state.salesOrders.length,
    purchaseOrders: state.purchaseOrders.length,
    deliveryJobs: state.deliveryJobs.length,
    cashVouchers: state.cashVouchers.length,
    employeeAdvances: state.employeeAdvances.length,
    workOrders: state.workOrders.length,
    importJobs: state.importJobs.length,
    importIssues: state.importIssues.length
  };
}

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function nextAvailableId(prefix: string, existingIds: string[]) {
  const existing = new Set(existingIds);
  let sequence = existingIds.length + 1;
  while (existing.has(`${prefix}-${String(sequence).padStart(4, "0")}`)) {
    sequence += 1;
  }
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

function today(value: string) {
  return value.slice(0, 10);
}

function nextId(prefix: string, count: number) {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

function nextCode(prefix: string, count: number) {
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

function nextDocumentNo(prefix: string, count: number) {
  return `${prefix}-2026-${String(count + 1).padStart(4, "0")}`;
}
