import { describe, expect, it } from "vitest";
import { createErpRegistry, getErpModuleForCommand } from "../src/erp/framework/registry";
import { createOdooMetadata, toOdooModelName } from "../src/erp/framework/odoo";
import { createOwnerActor } from "../src/modules/operations/service";
import {
  operationSequence,
  operationsByModule,
  operationsErpModules,
  operationsErpRegistry,
  operationsOdooMetadata
} from "../src/modules/operations/erp-registry";
import type { DomainCommandName } from "../src/modules/operations/types";

describe("ERP framework registry", () => {
  it("registers all module commands with permissions and idempotency metadata", () => {
    const registeredCommands = new Set(operationsErpRegistry.commands.map((command) => command.name));
    const expectedCommands = new Set<DomainCommandName>([
      "createCustomer",
      "createCustomerPortalSalesOrder",
      "createSupplier",
      "createProductUnit",
      "updateProductCommercialPolicy",
      "assignCustomerCollectionOwner",
      "recordCustomerCollectionFollowUp",
      "requestDeliveryQuantityChange",
      "approveDeliveryQuantityChange",
      "rejectDeliveryQuantityChange",
      "confirmCustomerDeliveryReceipt",
      "waiveCustomerDeliveryReceipt",
      "createUnitDefinition",
      "deleteUnitDefinition",
      "resetPurchaseUnitSettings",
      "upsertPurchaseUnitConversion",
      "deletePurchaseUnitConversion",
      "createWarehouse",
      "createVehicle",
      "createEmployee",
      "createSalesOrderDraft",
      "updateSalesOrderDraft",
      "createPurchaseOrderDraft",
      "updatePurchaseOrderDraft",
      "createDeliveryJob",
      "createCustomerPaymentDraft",
      "createSupplierPaymentDraft",
      "createCashVoucherDraft",
      "createBankTransferProof",
      "createEmployeePaymentDraft",
      "createEmployeeAdvanceDraft",
      "createWorkOrderDraft",
      "createImportDryRun",
      "createImportIssue",
      "confirmSalesOrder",
      "claimOpenSalesWorkOrder",
      "assignSalesWorkOrder",
      "recordWorkOrderLocation",
      "allocateSalesSources",
      "confirmPurchaseOrder",
      "submitGoodsReceipt",
      "approveGoodsReceipt",
      "rejectGoodsReceipt",
      "postGoodsReceipt",
      "reverseInventoryMovement",
      "postInventoryTransfer",
      "postInventoryCountAdjustment",
      "createInventoryCountSession",
      "addInventoryCountLine",
      "recordInventoryCountLine",
      "submitInventoryCountSession",
      "requestInventoryCountRecount",
      "approveInventoryCountSession",
      "rejectInventoryCountSession",
      "reverseInventoryCountSession",
      "confirmDirectDelivery",
      "reverseDirectDelivery",
      "startDeliveryLoading",
      "submitCustomerPaymentProof",
      "dispatchDelivery",
      "submitDeliveryCompletion",
      "approveDeliveryCompletion",
      "rejectDeliveryCompletion",
      "completeDelivery",
      "failDelivery",
      "confirmCustomerPayment",
      "allocateCustomerPayment",
      "reverseCustomerPayment",
      "confirmSupplierPayment",
      "allocateSupplierPayment",
      "reverseSupplierPayment",
      "reviewCustomerPaymentProof",
      "confirmCashVoucher",
      "reverseCashVoucher",
      "approveWorkOutput",
      "postCompensation",
      "payEmployee",
      "reverseEmployeePayment",
      "confirmEmployeeAdvance",
      "reverseEmployeeAdvance",
      "resolveImportIssue",
      "ignoreImportIssue"
      ,"submitSupplierPurchaseOrderResponse"
      ,"submitSupplierDeliveryNotice"
    ]);

    expect(registeredCommands).toEqual(expectedCommands);
    expect(operationsErpRegistry.commands.every((command) => command.permission.length > 0)).toBe(true);
    expect(operationsErpRegistry.commands.every((command) => command.idempotent)).toBe(true);
  });

  it("derives owner permissions and workflow menus from the registry", () => {
    const actor = createOwnerActor();

    expect(new Set(actor.permissions)).toEqual(operationsErpRegistry.permissionSet);
    expect(operationsByModule.sales).toEqual(["confirmSalesOrder", "allocateSalesSources"]);
    expect(operationsByModule.inventory).toEqual(["postInventoryTransfer", "postInventoryCountAdjustment", "createInventoryCountSession", "addInventoryCountLine", "recordInventoryCountLine", "submitInventoryCountSession", "requestInventoryCountRecount", "approveInventoryCountSession", "rejectInventoryCountSession", "reverseInventoryCountSession", "reverseInventoryMovement"]);
    expect(operationsByModule.delivery).toEqual(["startDeliveryLoading", "dispatchDelivery", "submitDeliveryCompletion", "approveDeliveryCompletion", "rejectDeliveryCompletion", "completeDelivery", "failDelivery"]);
    expect(operationsByModule.receivables).toEqual(["confirmCustomerPayment", "allocateCustomerPayment", "reverseCustomerPayment"]);
    expect(operationsByModule.payables).toEqual(["confirmSupplierPayment", "allocateSupplierPayment", "reverseSupplierPayment"]);
    expect(operationsByModule.cash).toEqual(["confirmCashVoucher", "reverseCashVoucher"]);
    expect(operationSequence.at(0)).toBe("confirmSalesOrder");
  });

  it("can resolve command ownership to the bounded context module", () => {
    expect(getErpModuleForCommand(operationsErpRegistry, "confirmCustomerPayment")?.id).toBe("receivables");
    expect(getErpModuleForCommand(operationsErpRegistry, "postGoodsReceipt")?.id).toBe("procurement");
    expect(getErpModuleForCommand(operationsErpRegistry, "createWorkOrderDraft")?.id).toBe("workforce");
    expect(getErpModuleForCommand(operationsErpRegistry, "claimOpenSalesWorkOrder")?.id).toBe("workforce");
  });

  it("rejects duplicate ERP module and command definitions", () => {
    expect(() => createErpRegistry([...operationsErpModules, operationsErpModules[0]])).toThrow("module id bị trùng");
    expect(() =>
      createErpRegistry([
        operationsErpModules[0],
        {
          ...operationsErpModules[1],
          id: "duplicateCommandModule",
          commands: operationsErpModules[1].commands.map((command) =>
            command.name === "createSupplier" ? { ...command, name: "createCustomer" } : command
          )
        }
      ])
    ).toThrow("command bị trùng");
  });

  it("projects ERP modules into Odoo-style models, menus, actions, groups, and rules", () => {
    expect(toOdooModelName("SalesOrder")).toBe("vlxd.sales.order");
    expect(operationsOdooMetadata.rootMenu.xmlId).toBe("vlxd_operations.menu_root");
    expect(operationsOdooMetadata.modelByEntity.get("Supplier")?.model).toBe("vlxd.supplier");
    expect(operationsOdooMetadata.actionByModuleId.get("procurement")).toMatchObject({
      xmlId: "vlxd_operations.action_procurement",
      resModel: "vlxd.purchase.order",
      viewModes: ["tree", "form", "kanban", "activity"]
    });
    expect(operationsOdooMetadata.menus.some((menu) => menu.xmlId === "vlxd_operations.menu_procurement")).toBe(true);
    expect(operationsOdooMetadata.groups.map((group) => group.xmlId)).toContain("vlxd_operations.group_owner");
    expect(operationsOdooMetadata.recordRules.some((rule) => rule.model === "vlxd.customer.ledger.entry")).toBe(true);
  });

  it("can generate Odoo metadata from any registered module pack", () => {
    const metadata = createOdooMetadata(operationsErpModules.slice(0, 2), "test_addon");

    expect(metadata.actions).toHaveLength(2);
    expect(metadata.rootMenu.xmlId).toBe("test_addon.menu_root");
    expect(metadata.menus[1]?.parentXmlId).toBe("test_addon.menu_root");
  });
});
