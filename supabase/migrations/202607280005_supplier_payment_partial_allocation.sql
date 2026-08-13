-- Runtime supplier payments distinguish a partial allocation from a fully allocated payment.
-- Preserve that state during a normalized cutover instead of collapsing it to allocated.
alter table public.supplier_payments
  drop constraint if exists supplier_payments_status_check;

alter table public.supplier_payments
  add constraint supplier_payments_status_check
  check (status in ('draft', 'confirmed', 'partially_allocated', 'allocated', 'reversed'));
