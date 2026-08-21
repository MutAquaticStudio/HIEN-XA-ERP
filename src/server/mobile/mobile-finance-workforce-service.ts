import { z } from "zod";
import {
  getCustomerDebtAlerts,
  getCustomerDebtObligations,
  getCustomerDebtSummaries,
  getSupplierDebtObligations,
  getSupplierDebtSummaries,
  paymentAllocatedAmount,
  paymentUnallocatedAmount
} from "@/modules/operations/debt-reconciliation";
import { getErpV2Snapshot, runErpV2CreateCommand, runErpV2Operation } from "@/server/erp-v2/runtime";
import type {
  CustomerPayment,
  OperationsActor,
  OperationsState,
  SupplierPayment,
  WorkOrder
} from "@/modules/operations/types";
import { visibleModulesForIdentity } from "@/server/identity/auth-context";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";
import type { SafeIdentityUser } from "@/server/identity/types";
import {
  removeOperationsTransferProofDocument,
  saveOperationsTransferProofDocument
} from "@/server/infrastructure/operations-attachment-store";
import { PublicApiError } from "@/server/shared/public-api-error";
import {
  claimMobileWorkOrder,
  mobileIdempotencySchema,
  type MobileRouteFormData
} from "./mobile-portal-service";

const identifierSchema = z.string().trim().min(1).max(128);
const moneySchema = z.number().finite().positive().max(1_000_000_000_000);
const nonNegativeMoneySchema = z.number().finite().min(0).max(1_000_000_000_000);
const quantitySchema = z.number().finite().positive().max(1_000_000);
const reasonSchema = z.string().trim().min(5).max(1_000);
const expectedVersionSchema = z.number().int().positive();
const dateTimeSchema = z.string().datetime({ offset: true });

const mutationControl = {
  idempotencyKey: mobileIdempotencySchema.optional(),
  review: z.literal(true).optional(),
  confirm: z.literal(true).optional()
};

const allocationSchema = z.object({
  ledgerEntryId: identifierSchema,
  amount: moneySchema
}).strict();

const receivablesActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createPaymentDraft"),
    customerId: identifierSchema,
    amount: moneySchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("confirmPayment"),
    paymentId: identifierSchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("allocatePayment"),
    paymentId: identifierSchema,
    allocations: z.array(allocationSchema).min(1).max(100),
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("reversePayment"),
    paymentId: identifierSchema,
    reason: reasonSchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("assignCollectionOwner"),
    customerId: identifierSchema,
    employeeId: identifierSchema,
    idempotencyKey: mobileIdempotencySchema
  }).strict(),
  z.object({
    action: z.literal("recordCollectionFollowUp"),
    customerId: identifierSchema,
    status: z.enum(["pending", "contacted", "promised_payment", "escalated"]),
    note: reasonSchema,
    idempotencyKey: mobileIdempotencySchema
  }).strict()
]);

const payablesActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createPaymentDraft"),
    supplierId: identifierSchema,
    amount: moneySchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("confirmPayment"),
    paymentId: identifierSchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("allocatePayment"),
    paymentId: identifierSchema,
    allocations: z.array(allocationSchema).min(1).max(100),
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("reversePayment"),
    paymentId: identifierSchema,
    reason: reasonSchema,
    ...mutationControl
  }).strict()
]);

const cashActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createVoucherDraft"),
    direction: z.enum(["in", "out"]),
    category: z.string().trim().min(2).max(160),
    description: z.string().trim().min(2).max(1_000),
    amount: moneySchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("confirmVoucher"),
    voucherId: identifierSchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("reverseVoucher"),
    voucherId: identifierSchema,
    reason: reasonSchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("createEmployeePaymentDraft"),
    employeeId: identifierSchema,
    amount: moneySchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("payEmployee"),
    paymentId: identifierSchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("reverseEmployeePayment"),
    paymentId: identifierSchema,
    reason: reasonSchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("createEmployeeAdvanceDraft"),
    employeeId: identifierSchema,
    purpose: z.string().trim().min(2).max(500),
    amount: moneySchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("confirmEmployeeAdvance"),
    advanceId: identifierSchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("reverseEmployeeAdvance"),
    advanceId: identifierSchema,
    reason: reasonSchema,
    ...mutationControl
  }).strict()
]);

const workforceActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createWorkOrderDraft"),
    employeeId: identifierSchema,
    productUnitId: identifierSchema,
    actualQuantity: quantitySchema,
    totalAmount: nonNegativeMoneySchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("claim"),
    workOrderId: identifierSchema,
    expectedVersion: expectedVersionSchema,
    idempotencyKey: mobileIdempotencySchema
  }).strict(),
  z.object({
    action: z.literal("approveOutput"),
    workOrderId: identifierSchema,
    expectedVersion: expectedVersionSchema,
    ...mutationControl
  }).strict(),
  z.object({
    action: z.literal("postCompensation"),
    workOrderId: identifierSchema,
    expectedVersion: expectedVersionSchema,
    ...mutationControl
  }).strict()
]);

const transferProofSchema = z.object({
  action: z.literal("archiveTransferProof"),
  direction: z.enum(["in", "out"]),
  amount: z.coerce.number().finite().positive().max(1_000_000_000_000),
  counterpartyName: z.string().trim().min(2).max(200),
  transactionReference: z.string().trim().min(2).max(200),
  transferredAt: dateTimeSchema,
  relatedDocumentNo: z.string().trim().max(160).optional(),
  note: z.string().trim().max(1_000).optional(),
  idempotencyKey: mobileIdempotencySchema
}).strict();

export async function getMobileReceivablesOverview(user: SafeIdentityUser) {
  requireReceivablesView(user);
  const rawSnapshot = await getErpV2Snapshot();
  const snapshot = projectOperationsSnapshot(rawSnapshot, user);
  const customerIds = receivablesCustomerScope(rawSnapshot.state, snapshot.state, user);
  const names = new Map(snapshot.state.customers.map((customer) => [customer.id, customer.displayName]));
  const summaries = getCustomerDebtSummaries(snapshot.state)
    .filter((item) => customerIds.has(item.partyId))
    .map((item) => ({ ...item, partyName: names.get(item.partyId) ?? item.partyName }));
  const obligations = getCustomerDebtObligations(snapshot.state)
    .filter((item) => customerIds.has(item.partyId))
    .map(toDebtObligation);
  const alerts = getCustomerDebtAlerts(snapshot.state, new Date().toISOString())
    .filter((item) => customerIds.has(item.customerId))
    .map((item) => ({
      ledgerEntryId: item.ledgerEntryId,
      customerId: item.customerId,
      customerName: names.get(item.customerId) ?? item.customerName,
      dueDate: item.dueDate,
      openAmount: item.openAmount,
      status: item.status
    }));

  return {
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    summaries,
    obligations,
    alerts,
    payments: snapshot.state.customerPayments
      .filter((payment) => customerIds.has(payment.customerId))
      .map((payment) => customerPaymentSummary(payment, names.get(payment.customerId))),
    collectionQueue: snapshot.state.customers
      .filter((customer) => customerIds.has(customer.id))
      .map((customer) => ({
        customerId: customer.id,
        customerName: customer.displayName,
        collectionOwnerEmployeeId: customer.collectionOwnerEmployeeId,
        followUps: (customer.collectionFollowUps ?? []).map((followUp) => ({
          id: followUp.id,
          status: followUp.status,
          note: followUp.note,
          recordedAt: followUp.recordedAt
        }))
      })),
    reviewPolicy: "Phiếu thu, phân bổ và đảo phiếu phải được xem lại trước khi xác nhận. Số dư được tính từ sổ phụ."
  };
}

export async function runMobileReceivablesAction(
  user: SafeIdentityUser,
  actor: OperationsActor,
  input: unknown
) {
  requireReceivablesView(user);
  const value = receivablesActionSchema.parse(input);
  const snapshot = await getErpV2Snapshot();

  switch (value.action) {
    case "createPaymentDraft": {
      requireReceivablesPaymentWrite(user);
      assertKnownCustomer(snapshot.state, value.customerId);
      const review = customerPaymentDraftReview(snapshot.state, value.customerId, value.amount);
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2CreateCommand({
          type: "createCustomerPaymentDraft",
          customerId: value.customerId,
          amount: value.amount
        }, idempotencyKey, actor),
        "Không thể tạo phiếu thu nháp."
      ));
    }
    case "confirmPayment": {
      requireReceivablesSettlementWrite(user);
      const payment = requireCustomerPayment(snapshot.state, value.paymentId);
      const review = paymentReview("confirmCustomerPayment", payment, "Xác nhận phiếu thu sẽ tăng quỹ và ghi bút toán giảm phải thu.");
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("confirmCustomerPayment", idempotencyKey, payment.id, actor),
        "Không thể xác nhận phiếu thu ở trạng thái hiện tại."
      ));
    }
    case "allocatePayment": {
      requireReceivablesSettlementWrite(user);
      const payment = requireCustomerPayment(snapshot.state, value.paymentId);
      const review = allocationReview(
        payment,
        value.allocations,
        getCustomerDebtObligations(snapshot.state).filter((item) => item.partyId === payment.customerId),
        "Phân bổ chỉ khớp phiếu thu với nghĩa vụ phải thu của đúng khách hàng; không tạo tiền mới."
      );
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("allocateCustomerPayment", idempotencyKey, payment.id, actor, { allocations: value.allocations }),
        "Không thể phân bổ phiếu thu ở trạng thái hiện tại."
      ));
    }
    case "reversePayment": {
      requireReceivablesSettlementWrite(user);
      const payment = requireCustomerPayment(snapshot.state, value.paymentId);
      const review = paymentReview("reverseCustomerPayment", payment, "Đảo phiếu thu sẽ ghi giảm quỹ và mở lại nghĩa vụ bằng bút toán ngược.");
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("reverseCustomerPayment", idempotencyKey, payment.id, actor, { reason: value.reason }),
        "Không thể đảo phiếu thu ở trạng thái hiện tại."
      ));
    }
    case "assignCollectionOwner": {
      requireCollectionAdministration(user);
      assertKnownCustomer(snapshot.state, value.customerId);
      assertKnownEmployee(snapshot.state, value.employeeId);
      const replay = idempotentReplay(snapshot, value.idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("assignCustomerCollectionOwner", value.idempotencyKey, value.customerId, actor, {
          employeeId: value.employeeId
        }),
        "Không thể giao người phụ trách thu hồi."
      ));
    }
    case "recordCollectionFollowUp": {
      requireCollectionFollowUpWrite(user);
      assertCustomerCollectionScope(snapshot.state, user, value.customerId);
      const replay = idempotentReplay(snapshot, value.idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("recordCustomerCollectionFollowUp", value.idempotencyKey, value.customerId, actor, {
          followUpStatus: value.status,
          reason: value.note
        }),
        "Không thể lưu nhật ký thu hồi công nợ."
      ));
    }
  }
}

export async function getMobilePayablesOverview(user: SafeIdentityUser) {
  requirePayablesView(user);
  const snapshot = projectOperationsSnapshot(await getErpV2Snapshot(), user);
  const supplierIds = new Set(snapshot.state.suppliers.map((supplier) => supplier.id));
  const names = new Map(snapshot.state.suppliers.map((supplier) => [supplier.id, supplier.displayName]));

  return {
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    summaries: getSupplierDebtSummaries(snapshot.state)
      .filter((item) => supplierIds.has(item.partyId))
      .map((item) => ({ ...item, partyName: names.get(item.partyId) ?? item.partyName })),
    obligations: getSupplierDebtObligations(snapshot.state)
      .filter((item) => supplierIds.has(item.partyId))
      .map(toDebtObligation),
    payments: snapshot.state.supplierPayments
      .filter((payment) => supplierIds.has(payment.supplierId))
      .map((payment) => supplierPaymentSummary(payment, names.get(payment.supplierId))),
    reviewPolicy: "Phiếu chi và phân bổ được đối chiếu theo nghĩa vụ phải trả của đúng nhà cung cấp."
  };
}

export async function runMobilePayablesAction(
  user: SafeIdentityUser,
  actor: OperationsActor,
  input: unknown
) {
  requirePayablesWrite(user);
  const value = payablesActionSchema.parse(input);
  const snapshot = await getErpV2Snapshot();

  switch (value.action) {
    case "createPaymentDraft": {
      assertKnownSupplier(snapshot.state, value.supplierId);
      const review = supplierPaymentDraftReview(snapshot.state, value.supplierId, value.amount);
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2CreateCommand({
          type: "createSupplierPaymentDraft",
          supplierId: value.supplierId,
          amount: value.amount
        }, idempotencyKey, actor),
        "Không thể tạo phiếu chi nhà cung cấp nháp."
      ));
    }
    case "confirmPayment": {
      const payment = requireSupplierPayment(snapshot.state, value.paymentId);
      const review = paymentReview("confirmSupplierPayment", payment, "Xác nhận phiếu chi sẽ giảm quỹ và ghi bút toán giảm phải trả.");
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("confirmSupplierPayment", idempotencyKey, payment.id, actor),
        "Không thể xác nhận phiếu chi nhà cung cấp ở trạng thái hiện tại."
      ));
    }
    case "allocatePayment": {
      const payment = requireSupplierPayment(snapshot.state, value.paymentId);
      const review = allocationReview(
        payment,
        value.allocations,
        getSupplierDebtObligations(snapshot.state).filter((item) => item.partyId === payment.supplierId),
        "Phân bổ chỉ khớp phiếu chi với nghĩa vụ phải trả của đúng nhà cung cấp; không tạo tiền mới."
      );
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("allocateSupplierPayment", idempotencyKey, payment.id, actor, { allocations: value.allocations }),
        "Không thể phân bổ phiếu chi nhà cung cấp ở trạng thái hiện tại."
      ));
    }
    case "reversePayment": {
      const payment = requireSupplierPayment(snapshot.state, value.paymentId);
      const review = paymentReview("reverseSupplierPayment", payment, "Đảo phiếu chi sẽ tăng lại quỹ và mở lại nghĩa vụ bằng bút toán ngược.");
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("reverseSupplierPayment", idempotencyKey, payment.id, actor, { reason: value.reason }),
        "Không thể đảo phiếu chi nhà cung cấp ở trạng thái hiện tại."
      ));
    }
  }
}

export async function getMobileCashOverview(user: SafeIdentityUser) {
  requireCashView(user);
  const snapshot = projectOperationsSnapshot(await getErpV2Snapshot(), user);
  const balances = new Map<string, number>();
  for (const transaction of snapshot.state.cashTransactions) {
    const current = balances.get(transaction.accountName) ?? 0;
    balances.set(transaction.accountName, current + (transaction.direction === "in" ? transaction.amount : -transaction.amount));
  }
  const employeeNames = new Map(snapshot.state.employees.map((employee) => [employee.id, employee.displayName]));

  return {
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    accounts: [...balances.entries()].map(([accountName, balance]) => ({ accountName, balance })),
    vouchers: snapshot.state.cashVouchers.map((voucher) => ({
      id: voucher.id,
      documentNo: voucher.documentNo,
      accountName: voucher.accountName,
      direction: voucher.direction,
      category: voucher.category,
      description: voucher.description,
      amount: voucher.amount,
      status: voucher.status
    })),
    bankTransferProofs: snapshot.state.bankTransferProofs.map((proof) => ({
      id: proof.id,
      documentNo: proof.documentNo,
      direction: proof.direction,
      amount: proof.amount,
      counterpartyName: proof.counterpartyName,
      transactionReference: proof.transactionReference,
      transferredAt: proof.transferredAt,
      relatedDocumentNo: proof.relatedDocumentNo,
      attachmentCount: proof.attachments.length
    })),
    customerPaymentProofRequests: (snapshot.state.customerPaymentProofRequests ?? []).map((proof) => ({
      id: proof.id,
      referenceDocument: proof.salesOrderId,
      customerId: proof.customerId,
      salesOrderId: proof.salesOrderId,
      amount: proof.amount,
      status: proof.status,
      attachmentCount: proof.attachments.length
    })),
    employeePayments: snapshot.state.employeePayments.map((payment) => ({
      id: payment.id,
      documentNo: payment.documentNo,
      employeeId: payment.employeeId,
      employeeName: employeeNames.get(payment.employeeId) ?? "Nhân sự không xác định",
      amount: payment.amount,
      status: payment.status
    })),
    employeeAdvances: snapshot.state.employeeAdvances.map((advance) => ({
      id: advance.id,
      documentNo: advance.documentNo,
      employeeId: advance.employeeId,
      employeeName: employeeNames.get(advance.employeeId) ?? "Nhân sự không xác định",
      purpose: advance.purpose,
      amount: advance.amount,
      status: advance.status
    })),
    reviewPolicy: "Mọi xác nhận hoặc đảo phiếu đều tính lại số dư quỹ và tạo bút toán append-only trên máy chủ."
  };
}

export async function runMobileCashAction(
  user: SafeIdentityUser,
  actor: OperationsActor,
  input: unknown
) {
  requireCashWrite(user);
  const value = cashActionSchema.parse(input);
  const snapshot = await getErpV2Snapshot();

  switch (value.action) {
    case "createVoucherDraft": {
      const review = voucherDraftReview(value.direction, value.category, value.description, value.amount);
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2CreateCommand({
          type: "createCashVoucherDraft",
          direction: value.direction,
          category: value.category,
          description: value.description,
          amount: value.amount
        }, idempotencyKey, actor),
        "Không thể tạo phiếu quỹ nháp."
      ));
    }
    case "confirmVoucher": {
      const voucher = requireCashVoucher(snapshot.state, value.voucherId);
      const review = voucherReview(voucher, "Xác nhận phiếu quỹ sẽ cập nhật số dư quỹ bằng giao dịch append-only.");
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("confirmCashVoucher", idempotencyKey, voucher.id, actor),
        "Không thể xác nhận phiếu quỹ ở trạng thái hiện tại."
      ));
    }
    case "reverseVoucher": {
      const voucher = requireCashVoucher(snapshot.state, value.voucherId);
      const review = voucherReview(voucher, "Đảo phiếu quỹ sẽ tạo giao dịch ngược chiều, không sửa giao dịch gốc.");
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("reverseCashVoucher", idempotencyKey, voucher.id, actor, { reason: value.reason }),
        "Không thể đảo phiếu quỹ ở trạng thái hiện tại."
      ));
    }
    case "createEmployeePaymentDraft": {
      assertKnownEmployee(snapshot.state, value.employeeId);
      const review = employeeCashDraftReview(snapshot.state, value.employeeId, value.amount, "payment");
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2CreateCommand({
          type: "createEmployeePaymentDraft",
          employeeId: value.employeeId,
          amount: value.amount
        }, idempotencyKey, actor),
        "Không thể tạo phiếu thanh toán nhân viên nháp."
      ));
    }
    case "payEmployee": {
      const payment = requireEmployeePayment(snapshot.state, value.paymentId);
      const review = employeePaymentReview(payment, "Xác nhận sẽ giảm quỹ và giảm tiền công còn phải trả của nhân sự.");
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("payEmployee", idempotencyKey, payment.id, actor),
        "Không thể thanh toán nhân viên ở trạng thái hiện tại."
      ));
    }
    case "reverseEmployeePayment": {
      const payment = requireEmployeePayment(snapshot.state, value.paymentId);
      const review = employeePaymentReview(payment, "Đảo thanh toán sẽ tăng lại quỹ và mở lại tiền công còn phải trả.");
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("reverseEmployeePayment", idempotencyKey, payment.id, actor, { reason: value.reason }),
        "Không thể đảo thanh toán nhân viên ở trạng thái hiện tại."
      ));
    }
    case "createEmployeeAdvanceDraft": {
      assertKnownEmployee(snapshot.state, value.employeeId);
      const review = employeeCashDraftReview(snapshot.state, value.employeeId, value.amount, "advance", value.purpose);
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2CreateCommand({
          type: "createEmployeeAdvanceDraft",
          employeeId: value.employeeId,
          purpose: value.purpose,
          amount: value.amount
        }, idempotencyKey, actor),
        "Không thể tạo phiếu tạm ứng nháp."
      ));
    }
    case "confirmEmployeeAdvance": {
      const advance = requireEmployeeAdvance(snapshot.state, value.advanceId);
      const review = employeeAdvanceReview(advance, "Xác nhận sẽ giảm quỹ và ghi tạm ứng riêng, không ghi nhầm thành tiền công.");
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("confirmEmployeeAdvance", idempotencyKey, advance.id, actor),
        "Không thể xác nhận tạm ứng ở trạng thái hiện tại."
      ));
    }
    case "reverseEmployeeAdvance": {
      const advance = requireEmployeeAdvance(snapshot.state, value.advanceId);
      const review = employeeAdvanceReview(advance, "Đảo tạm ứng sẽ tạo giao dịch quỹ và bút toán nhân viên ngược chiều.");
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("reverseEmployeeAdvance", idempotencyKey, advance.id, actor, { reason: value.reason }),
        "Không thể đảo tạm ứng ở trạng thái hiện tại."
      ));
    }
  }
}

export async function archiveMobileBankTransferProof(
  user: SafeIdentityUser,
  actor: OperationsActor,
  formData: MobileRouteFormData
) {
  requireCashWrite(user);
  const value = transferProofSchema.parse({
    action: formData.get("action"),
    direction: formData.get("direction"),
    amount: formData.get("amount"),
    counterpartyName: formData.get("counterpartyName"),
    transactionReference: formData.get("transactionReference"),
    transferredAt: formData.get("transferredAt"),
    relatedDocumentNo: formData.get("relatedDocumentNo") || undefined,
    note: formData.get("note") || undefined,
    idempotencyKey: formData.get("idempotencyKey")
  });
  const snapshot = await getErpV2Snapshot();
  const replay = idempotentReplay(snapshot, value.idempotencyKey);
  if (replay) return replay;
  const files = Array.from(formData.entries())
    .filter(([key, entry]) => key === "attachment" && entry instanceof File && entry.size > 0)
    .map(([, entry]) => entry as File);
  if (files.length === 0) {
    throw new PublicApiError(400, "Chọn ít nhất một ảnh hoặc PDF minh chứng chuyển khoản.");
  }
  if (files.length > 3) {
    throw new PublicApiError(400, "Mỗi chứng từ chuyển khoản chỉ nhận tối đa 3 tệp.");
  }

  const attachments: Array<Awaited<ReturnType<typeof saveOperationsTransferProofDocument>>> = [];
  try {
    for (const file of files) {
      attachments.push(await saveOperationsTransferProofDocument(file, actor, new Date().toISOString()));
    }
    const result = await runFinanceCommand(
      () => runErpV2CreateCommand({
        type: "createBankTransferProof",
        direction: value.direction,
        amount: value.amount,
        counterpartyName: value.counterpartyName,
        transactionReference: value.transactionReference,
        transferredAt: value.transferredAt,
        relatedDocumentNo: value.relatedDocumentNo,
        note: value.note,
        attachments
      }, value.idempotencyKey, actor),
      "Không thể lưu chứng từ chuyển khoản."
    );
    if (result.severity === "warning") {
      await Promise.all(attachments.map((attachment) => removeOperationsTransferProofDocument(attachment)));
    }
    return operationResponse(result);
  } catch (error) {
    await Promise.all(attachments.map((attachment) => removeOperationsTransferProofDocument(attachment).catch(() => undefined)));
    throw error;
  }
}

export async function getMobileWorkforceOverview(user: SafeIdentityUser) {
  requireWorkforceView(user);
  const snapshot = projectOperationsSnapshot(await getErpV2Snapshot(), user);
  const employeeNames = new Map(snapshot.state.employees.map((employee) => [employee.id, employee.displayName]));
  const isFieldWorker = user.role === "worker";

  return {
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    mode: isFieldWorker ? "field" : "management",
    workOrders: snapshot.state.workOrders.map((workOrder) => workforceWorkOrderSummary(workOrder, employeeNames, isFieldWorker)),
    employees: isFieldWorker
      ? []
      : snapshot.state.employees.map((employee) => ({
        id: employee.id,
        code: employee.code,
        displayName: employee.displayName,
        roleType: employee.roleType,
        status: employee.status
      })),
    compensationBatches: isFieldWorker
      ? []
      : snapshot.state.compensationBatches.map((batch) => ({
        id: batch.id,
        documentNo: batch.documentNo,
        workOrderId: batch.workOrderId,
        status: batch.status,
        totalAmount: batch.totalAmount,
        lineCount: batch.lines.length
      })),
    reviewPolicy: isFieldWorker
      ? "Bạn chỉ thấy công việc được giao hoặc đang mở để nhận. Ứng dụng không hiển thị giá, VAT, tồn kho hoặc dữ liệu sổ."
      : "Duyệt sản lượng và ghi bảng công phải xem lại số lượng, người nhận công và hậu quả bút toán trước khi xác nhận."
  };
}

export async function runMobileWorkforceAction(
  user: SafeIdentityUser,
  actor: OperationsActor,
  input: unknown
) {
  requireWorkforceView(user);
  const value = workforceActionSchema.parse(input);
  const snapshot = await getErpV2Snapshot();

  switch (value.action) {
    case "claim":
      return claimMobileWorkOrder(user, actor, {
        workOrderId: value.workOrderId,
        expectedVersion: value.expectedVersion,
        idempotencyKey: value.idempotencyKey
      });
    case "createWorkOrderDraft": {
      requireWorkforceManagementWrite(user);
      assertKnownEmployee(snapshot.state, value.employeeId);
      assertKnownProduct(snapshot.state, value.productUnitId);
      const review = workOrderDraftReview(snapshot.state, value);
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2CreateCommand({
          type: "createWorkOrderDraft",
          employeeId: value.employeeId,
          productUnitId: value.productUnitId,
          actualQuantity: value.actualQuantity,
          totalAmount: value.totalAmount
        }, idempotencyKey, actor),
        "Không thể tạo phiếu công nháp."
      ));
    }
    case "approveOutput": {
      requireWorkforceManagementWrite(user);
      const workOrder = requireWorkOrder(snapshot.state, value.workOrderId);
      assertExpectedWorkOrderVersion(workOrder, value.expectedVersion);
      const review = workOrderReview(workOrder, "Duyệt sẽ khóa sản lượng, chưa ghi tiền công hoặc quỹ.");
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("approveWorkOutput", idempotencyKey, workOrder.id, actor, {
          expectedVersion: value.expectedVersion
        }),
        "Không thể duyệt sản lượng ở trạng thái hiện tại."
      ));
    }
    case "postCompensation": {
      requireWorkforceManagementWrite(user);
      const workOrder = requireWorkOrder(snapshot.state, value.workOrderId);
      assertExpectedWorkOrderVersion(workOrder, value.expectedVersion);
      const batch = snapshot.state.compensationBatches.find((item) => item.workOrderId === workOrder.id && item.status === "draft");
      const review = workOrderReview(
        workOrder,
        batch
          ? "Ghi bảng công sẽ tạo tiền phải trả nhân viên theo bảng công hiện tại; không ghi quỹ cho đến khi thanh toán."
          : "Không tìm thấy bảng công nháp tương ứng, không thể ghi nhận."
      );
      if (value.review) return { review };
      const idempotencyKey = requireConfirmedMutation(value);
      const replay = idempotentReplay(snapshot, idempotencyKey);
      if (replay) return replay;
      return operationResponse(await runFinanceCommand(
        () => runErpV2Operation("postCompensation", idempotencyKey, workOrder.id, actor, {
          expectedVersion: value.expectedVersion
        }),
        "Không thể ghi bảng công ở trạng thái hiện tại."
      ));
    }
  }
}

function requireReceivablesView(user: SafeIdentityUser) {
  if (user.role === "customer" && user.customerId) return;
  requireModule(user, "receivables", "Tài khoản này không có quyền xem công nợ khách hàng trên điện thoại.");
}

function requirePayablesView(user: SafeIdentityUser) {
  if (user.role === "supplier" && user.supplierId) return;
  requireModule(user, "payables", "Tài khoản này không có quyền xem công nợ nhà cung cấp trên điện thoại.");
}

function requireCashView(user: SafeIdentityUser) {
  requireModule(user, "cash", "Tài khoản này không có quyền xem quỹ và ngân hàng trên điện thoại.");
  if (!["owner", "administrator", "accountant"].includes(user.role)) {
    throw new PublicApiError(403, "Chỉ Chủ cửa hàng, Quản trị hoặc Kế toán được xem quỹ và ngân hàng.");
  }
}

function requireWorkforceView(user: SafeIdentityUser) {
  if (user.role === "worker") return;
  requireModule(user, "workforce", "Tài khoản này không có quyền xem nhân công trên điện thoại.");
  if (!["owner", "administrator", "accountant", "supervisor"].includes(user.role)) {
    throw new PublicApiError(403, "Tài khoản này không có quyền xem nhân công trên điện thoại.");
  }
}

function requireReceivablesPaymentWrite(user: SafeIdentityUser) {
  if (!["owner", "administrator", "accountant", "sales"].includes(user.role)) {
    throw new PublicApiError(403, "Tài khoản này không có quyền tạo phiếu thu nháp.");
  }
}

function requireReceivablesSettlementWrite(user: SafeIdentityUser) {
  if (!["owner", "administrator", "accountant"].includes(user.role)) {
    throw new PublicApiError(403, "Chỉ Chủ cửa hàng, Quản trị hoặc Kế toán được xác nhận, phân bổ hoặc đảo phiếu thu.");
  }
}

function requireCollectionAdministration(user: SafeIdentityUser) {
  if (!["owner", "administrator", "accountant"].includes(user.role)) {
    throw new PublicApiError(403, "Chỉ Chủ cửa hàng, Quản trị hoặc Kế toán được giao người phụ trách thu hồi.");
  }
}

function requireCollectionFollowUpWrite(user: SafeIdentityUser) {
  if (!["owner", "administrator", "accountant", "sales"].includes(user.role)) {
    throw new PublicApiError(403, "Tài khoản này không có quyền ghi nhật ký thu hồi công nợ.");
  }
}

function requirePayablesWrite(user: SafeIdentityUser) {
  requirePayablesView(user);
  if (!["owner", "administrator", "accountant"].includes(user.role)) {
    throw new PublicApiError(403, "Chỉ Chủ cửa hàng, Quản trị hoặc Kế toán được tạo và xử lý phiếu chi nhà cung cấp.");
  }
}

function requireCashWrite(user: SafeIdentityUser) {
  requireCashView(user);
}

function requireWorkforceManagementWrite(user: SafeIdentityUser) {
  if (!["owner", "administrator", "supervisor"].includes(user.role)) {
    throw new PublicApiError(403, "Chỉ Chủ cửa hàng, Quản trị hoặc Giám sát được tạo, duyệt và ghi bảng công.");
  }
}

function requireModule(user: SafeIdentityUser, moduleId: "receivables" | "payables" | "cash" | "workforce", message: string) {
  if (!visibleModulesForIdentity(user).includes(moduleId)) {
    throw new PublicApiError(403, message);
  }
}

function receivablesCustomerScope(rawState: OperationsState, state: OperationsState, user: SafeIdentityUser) {
  if (user.role === "customer" && user.customerId) return new Set([user.customerId]);
  if (user.role !== "sales") return new Set(state.customers.map((customer) => customer.id));
  const employee = user.employeeId
    ? rawState.employees.find((item) =>
      item.id === user.employeeId && item.roleType === "sales" && item.status === "active"
    )
    : undefined;
  return new Set(
    state.customers
      .filter((customer) => customer.collectionOwnerEmployeeId === employee?.id)
      .map((customer) => customer.id)
  );
}

function assertCustomerCollectionScope(state: OperationsState, user: SafeIdentityUser, customerId: string) {
  assertKnownCustomer(state, customerId);
  if (user.role !== "sales") return;
  const employee = user.employeeId
    ? state.employees.find((item) =>
      item.id === user.employeeId && item.roleType === "sales" && item.status === "active"
    )
    : undefined;
  const customer = state.customers.find((item) => item.id === customerId);
  if (!employee || customer?.collectionOwnerEmployeeId !== employee.id) {
    throw new PublicApiError(403, "Bạn chỉ được ghi nhật ký cho khách hàng được giao thu hồi.");
  }
}

function assertKnownCustomer(state: OperationsState, customerId: string) {
  if (!state.customers.some((customer) => customer.id === customerId && customer.status === "active")) {
    throw new PublicApiError(403, "Không tìm thấy khách hàng đang hoạt động trong phạm vi được phép.");
  }
}

function assertKnownSupplier(state: OperationsState, supplierId: string) {
  if (!state.suppliers.some((supplier) => supplier.id === supplierId && supplier.status === "active")) {
    throw new PublicApiError(403, "Không tìm thấy nhà cung cấp đang hoạt động trong phạm vi được phép.");
  }
}

function assertKnownEmployee(state: OperationsState, employeeId: string) {
  if (!state.employees.some((employee) => employee.id === employeeId && employee.status === "active")) {
    throw new PublicApiError(403, "Không tìm thấy nhân sự đang hoạt động trong phạm vi được phép.");
  }
}

function assertKnownProduct(state: OperationsState, productUnitId: string) {
  if (!state.productUnits.some((product) => product.id === productUnitId && product.status === "active")) {
    throw new PublicApiError(400, "Vật tư trong phiếu công không hợp lệ.");
  }
}

function requireCustomerPayment(state: OperationsState, paymentId: string) {
  const payment = state.customerPayments.find((item) => item.id === paymentId);
  if (!payment) throw new PublicApiError(403, "Không tìm thấy phiếu thu trong phạm vi được phép.");
  return payment;
}

function requireSupplierPayment(state: OperationsState, paymentId: string) {
  const payment = state.supplierPayments.find((item) => item.id === paymentId);
  if (!payment) throw new PublicApiError(403, "Không tìm thấy phiếu chi trong phạm vi được phép.");
  return payment;
}

function requireCashVoucher(state: OperationsState, voucherId: string) {
  const voucher = state.cashVouchers.find((item) => item.id === voucherId);
  if (!voucher) throw new PublicApiError(403, "Không tìm thấy phiếu quỹ trong phạm vi được phép.");
  return voucher;
}

function requireEmployeePayment(state: OperationsState, paymentId: string) {
  const payment = state.employeePayments.find((item) => item.id === paymentId);
  if (!payment) throw new PublicApiError(403, "Không tìm thấy phiếu thanh toán nhân viên trong phạm vi được phép.");
  return payment;
}

function requireEmployeeAdvance(state: OperationsState, advanceId: string) {
  const advance = state.employeeAdvances.find((item) => item.id === advanceId);
  if (!advance) throw new PublicApiError(403, "Không tìm thấy phiếu tạm ứng trong phạm vi được phép.");
  return advance;
}

function requireWorkOrder(state: OperationsState, workOrderId: string) {
  const workOrder = state.workOrders.find((item) => item.id === workOrderId);
  if (!workOrder) throw new PublicApiError(403, "Không tìm thấy phiếu công trong phạm vi được phép.");
  return workOrder;
}

function assertExpectedWorkOrderVersion(workOrder: WorkOrder, expectedVersion: number) {
  if ((workOrder.version ?? 1) !== expectedVersion) {
    throw new PublicApiError(409, "Phiếu công đã được cập nhật bởi thao tác khác. Vui lòng tải lại trước khi tiếp tục.");
  }
}

function requireConfirmedMutation(value: { idempotencyKey?: string; confirm?: true }) {
  if (value.confirm !== true) {
    throw new PublicApiError(400, "Hãy xem lại hậu quả nghiệp vụ và xác nhận trước khi ghi sổ.");
  }
  if (!value.idempotencyKey) {
    throw new PublicApiError(400, "Thiếu mã chống ghi trùng cho thao tác này.");
  }
  return value.idempotencyKey;
}

function idempotentReplay(
  snapshot: Awaited<ReturnType<typeof getErpV2Snapshot>>,
  idempotencyKey: string
) {
  if (!snapshot.state.processedOperations.some((entry) => entry.idempotencyKey === idempotencyKey)) {
    return undefined;
  }
  return {
    summary: "Yêu cầu này đã được xử lý trước đó, hệ thống không ghi trùng.",
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt
  };
}

async function runFinanceCommand<T>(run: () => Promise<T>, fallback: string) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PublicApiError || error instanceof z.ZodError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("VERSION_CONFLICT:") || message.includes("ORDER_ALREADY_CLAIMED")) {
      throw new PublicApiError(409, "Dữ liệu đã được thay đổi bởi thao tác khác. Vui lòng tải lại trước khi tiếp tục.");
    }
    if (/quyền|quyen/i.test(message)) {
      throw new PublicApiError(403, "Bạn không có quyền thực hiện thao tác này.");
    }
    throw new PublicApiError(400, fallback);
  }
}

function operationResponse(result: { summary: string; revision: number; syncedAt: string }) {
  return { summary: result.summary, revision: result.revision, syncedAt: result.syncedAt };
}

function toDebtObligation(item: {
  ledgerEntryId: string;
  partyId: string;
  partyName: string;
  sourceDocument: string;
  postingDate: string;
  dueDate?: string;
  originalAmount: number;
  allocatedAmount: number;
  openAmount: number;
  status: string;
}) {
  return {
    ledgerEntryId: item.ledgerEntryId,
    partyId: item.partyId,
    partyName: item.partyName,
    sourceDocument: item.sourceDocument,
    postingDate: item.postingDate,
    dueDate: item.dueDate,
    originalAmount: item.originalAmount,
    allocatedAmount: item.allocatedAmount,
    openAmount: item.openAmount,
    status: item.status
  };
}

function customerPaymentSummary(payment: CustomerPayment, customerName?: string) {
  return {
    id: payment.id,
    documentNo: payment.documentNo,
    customerId: payment.customerId,
    customerName: customerName ?? "Khách hàng không xác định",
    amount: payment.amount,
    status: payment.status,
    allocatedAmount: paymentAllocatedAmount(payment),
    unallocatedAmount: paymentUnallocatedAmount(payment),
    allocationCount: payment.allocations.length
  };
}

function supplierPaymentSummary(payment: SupplierPayment, supplierName?: string) {
  return {
    id: payment.id,
    documentNo: payment.documentNo,
    supplierId: payment.supplierId,
    supplierName: supplierName ?? "Nhà cung cấp không xác định",
    amount: payment.amount,
    status: payment.status,
    allocatedAmount: paymentAllocatedAmount(payment),
    unallocatedAmount: paymentUnallocatedAmount(payment),
    allocationCount: payment.allocations.length
  };
}

function customerPaymentDraftReview(state: OperationsState, customerId: string, amount: number) {
  const customer = state.customers.find((item) => item.id === customerId);
  return {
    title: "Rà soát phiếu thu nháp",
    amount,
    customerName: customer?.displayName ?? "Khách hàng không xác định",
    ledgerEffects: ["Chỉ tạo phiếu thu nháp, chưa tăng quỹ và chưa giảm công nợ."],
    inventoryEffects: [],
    warnings: ["Số tiền sẽ được kiểm tra lại khi xác nhận phiếu thu."]
  };
}

function supplierPaymentDraftReview(state: OperationsState, supplierId: string, amount: number) {
  const supplier = state.suppliers.find((item) => item.id === supplierId);
  return {
    title: "Rà soát phiếu chi nhà cung cấp nháp",
    amount,
    supplierName: supplier?.displayName ?? "Nhà cung cấp không xác định",
    ledgerEffects: ["Chỉ tạo phiếu chi nháp, chưa giảm quỹ và chưa giảm phải trả."],
    inventoryEffects: [],
    warnings: ["Quỹ và số phải trả sẽ được kiểm tra lại khi xác nhận."]
  };
}

function paymentReview(action: string, payment: CustomerPayment | SupplierPayment, effect: string) {
  return {
    action,
    documentNo: payment.documentNo,
    currentStatus: payment.status,
    amount: payment.amount,
    allocatedAmount: paymentAllocatedAmount(payment),
    unallocatedAmount: paymentUnallocatedAmount(payment),
    ledgerEffects: [effect],
    inventoryEffects: [],
    warnings: payment.status === "reversed" ? ["Chứng từ đã đảo, máy chủ sẽ chặn thao tác không hợp lệ."] : []
  };
}

function allocationReview(
  payment: CustomerPayment | SupplierPayment,
  allocations: Array<{ ledgerEntryId: string; amount: number }>,
  obligations: Array<{ ledgerEntryId: string; sourceDocument: string; openAmount: number }>,
  effect: string
) {
  const requestedAmount = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  const outstanding = paymentUnallocatedAmount(payment);
  const obligationById = new Map(obligations.map((item) => [item.ledgerEntryId, item]));
  return {
    title: "Rà soát phân bổ thanh toán",
    documentNo: payment.documentNo,
    currentStatus: payment.status,
    paymentAmount: payment.amount,
    requestedAmount,
    unallocatedAmount: outstanding,
    allocations: allocations.map((allocation) => ({
      ledgerEntryId: allocation.ledgerEntryId,
      sourceDocument: obligationById.get(allocation.ledgerEntryId)?.sourceDocument ?? "Nghĩa vụ không xác định",
      requestedAmount: allocation.amount,
      openAmountBefore: obligationById.get(allocation.ledgerEntryId)?.openAmount
    })),
    ledgerEffects: [effect],
    inventoryEffects: [],
    warnings: requestedAmount > outstanding ? ["Số tiền phân bổ vượt phần chưa phân bổ; máy chủ sẽ từ chối."] : []
  };
}

function voucherDraftReview(direction: "in" | "out", category: string, description: string, amount: number) {
  return {
    title: "Rà soát phiếu quỹ nháp",
    direction,
    category,
    description,
    amount,
    ledgerEffects: ["Chỉ tạo phiếu nháp, chưa thay đổi số dư quỹ."],
    inventoryEffects: [],
    warnings: direction === "out" ? ["Quỹ khả dụng sẽ được kiểm tra lại khi xác nhận."] : []
  };
}

function voucherReview(
  voucher: { documentNo: string; status: string; direction: "in" | "out"; amount: number },
  effect: string
) {
  return {
    documentNo: voucher.documentNo,
    currentStatus: voucher.status,
    direction: voucher.direction,
    amount: voucher.amount,
    ledgerEffects: [effect],
    inventoryEffects: [],
    warnings: voucher.direction === "out" ? ["Máy chủ sẽ chặn nếu số dư quỹ không đủ."] : []
  };
}

function employeeCashDraftReview(
  state: OperationsState,
  employeeId: string,
  amount: number,
  kind: "payment" | "advance",
  purpose?: string
) {
  const employee = state.employees.find((item) => item.id === employeeId);
  return {
    title: kind === "payment" ? "Rà soát phiếu thanh toán nhân viên nháp" : "Rà soát phiếu tạm ứng nháp",
    employeeName: employee?.displayName ?? "Nhân sự không xác định",
    amount,
    purpose,
    ledgerEffects: ["Chỉ tạo phiếu nháp, chưa thay đổi quỹ hoặc sổ nhân viên."],
    inventoryEffects: [],
    warnings: ["Hậu quả tiền mặt và sổ nhân viên sẽ được máy chủ tính lại khi xác nhận."]
  };
}

function employeePaymentReview(payment: { documentNo: string; status: string; amount: number }, effect: string) {
  return {
    documentNo: payment.documentNo,
    currentStatus: payment.status,
    amount: payment.amount,
    ledgerEffects: [effect],
    inventoryEffects: [],
    warnings: ["Máy chủ kiểm tra công còn phải trả và số dư quỹ trước khi ghi sổ."]
  };
}

function employeeAdvanceReview(advance: { documentNo: string; status: string; purpose: string; amount: number }, effect: string) {
  return {
    documentNo: advance.documentNo,
    currentStatus: advance.status,
    purpose: advance.purpose,
    amount: advance.amount,
    ledgerEffects: [effect],
    inventoryEffects: [],
    warnings: ["Tạm ứng được ghi riêng, không phải tiền công mới."]
  };
}

function workOrderDraftReview(
  state: OperationsState,
  value: { employeeId: string; productUnitId: string; actualQuantity: number; totalAmount: number }
) {
  const employee = state.employees.find((item) => item.id === value.employeeId);
  const product = state.productUnits.find((item) => item.id === value.productUnitId);
  return {
    title: "Rà soát phiếu công nháp",
    employeeName: employee?.displayName ?? "Nhân sự không xác định",
    productName: product?.productName ?? "Vật tư không xác định",
    actualQuantity: value.actualQuantity,
    totalAmount: value.totalAmount,
    ledgerEffects: ["Tạo phiếu công nháp, chưa ghi bảng công, quỹ hoặc sổ nhân viên."],
    inventoryEffects: [],
    warnings: ["Chỉ sau khi duyệt sản lượng và ghi bảng công mới phát sinh tiền phải trả."]
  };
}

function workOrderReview(workOrder: WorkOrder, effect: string) {
  return {
    documentNo: workOrder.documentNo,
    currentStatus: workOrder.status,
    expectedVersion: workOrder.version ?? 1,
    outputCount: workOrder.outputs.length,
    approvedQuantity: workOrder.outputs.reduce((sum, output) => sum + output.approvedQuantity, 0),
    participantCount: workOrder.participants.length,
    ledgerEffects: [effect],
    inventoryEffects: [],
    warnings: []
  };
}

function workforceWorkOrderSummary(
  workOrder: WorkOrder,
  employeeNames: Map<string, string>,
  redactCompensation: boolean
) {
  return {
    id: workOrder.id,
    documentNo: workOrder.documentNo,
    sourceDocument: workOrder.sourceDocument,
    workType: workOrder.workType,
    workDate: workOrder.workDate,
    status: workOrder.status,
    version: workOrder.version ?? 1,
    outputs: workOrder.outputs.map((output) => ({
      id: output.id,
      productUnitId: output.productUnitId,
      actualQuantity: output.actualQuantity,
      approvedQuantity: output.approvedQuantity,
      status: output.status
    })),
    participants: redactCompensation
      ? []
      : workOrder.participants.map((participant) => ({
        employeeId: participant.employeeId,
        employeeName: employeeNames.get(participant.employeeId) ?? "Nhân sự không xác định",
        shareFactor: participant.shareFactor
      })),
    claimable: workOrder.status === "open" && Boolean(workOrder.salesOrderId)
  };
}

function normalizeName(value: string) {
  return value
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}
