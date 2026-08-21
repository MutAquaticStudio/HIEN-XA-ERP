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
  "createInventoryCountSession",
  "addInventoryCountLine",
  "recordInventoryCountLine",
  "submitInventoryCountSession",
  "requestInventoryCountRecount",
  "approveInventoryCountSession",
  "rejectInventoryCountSession",
  "reverseInventoryCountSession"
]);
