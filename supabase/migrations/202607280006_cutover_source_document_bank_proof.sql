-- Keep the database mapping contract aligned with CutoverSourceEntityType.
-- This migration is deliberately repeatable for rehearsal environments.

alter table public.erp_cutover_source_document_overrides
  drop constraint if exists erp_cutover_source_document_overrides_target_entity_type_check;

alter table public.erp_cutover_source_document_overrides
  add constraint erp_cutover_source_document_overrides_target_entity_type_check
  check (
    target_entity_type in (
      'sales_order',
      'purchase_order',
      'delivery_job',
      'inventory_posting',
      'cash_voucher',
      'cash_transaction',
      'customer_payment',
      'supplier_payment',
      'employee_payment',
      'employee_advance',
      'customer_ledger_entry',
      'supplier_ledger_entry',
      'employee_ledger_entry',
      'bank_transfer_proof',
      'work_order',
      'compensation_batch',
      'import_job'
    )
  );
