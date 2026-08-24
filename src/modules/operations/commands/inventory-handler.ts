import { createBoundedContextHandler } from "./bounded-context-handler";

export const inventoryCommandHandler = createBoundedContextHandler("inventory", [
  "requestNegativeStockOverride",
  "approveNegativeStockOverride",
  "rejectNegativeStockOverride",
  "submitGoodsReceipt",
  "approveGoodsReceipt",
  "rejectGoodsReceipt",
  "postGoodsReceipt",
  "reverseInventoryMovement",
  "postOpeningInventory",
  "postInventoryTransfer",
  "postInventoryCountAdjustment",
  "submitQuickInventoryCount",
  "createInventoryCountSession",
  "addInventoryCountLine",
  "recordInventoryCountLine",
  "submitInventoryCountSession",
  "requestInventoryCountRecount",
  "approveInventoryCountSession",
  "rejectInventoryCountSession",
  "reverseInventoryCountSession"
]);
