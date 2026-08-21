import { createBoundedContextHandler } from "./bounded-context-handler";

export const financeCommandHandler = createBoundedContextHandler("finance", [
  "assignCustomerCollectionOwner",
  "recordCustomerCollectionFollowUp",
  "confirmCustomerPayment",
  "allocateCustomerPayment",
  "reverseCustomerPayment",
  "confirmSupplierPayment",
  "allocateSupplierPayment",
  "reverseSupplierPayment",
  "confirmCashVoucher",
  "reverseCashVoucher",
  "payEmployee",
  "reverseEmployeePayment",
  "confirmEmployeeAdvance",
  "reverseEmployeeAdvance"
]);
