begin;

alter table public.supplier_payments
  drop constraint if exists supplier_payments_status_check;
alter table public.supplier_payments
  add constraint supplier_payments_status_check
  check (status in ('draft', 'confirmed', 'partially_allocated', 'allocated', 'reversed'));

alter table public.customer_payment_allocations
  drop constraint if exists customer_payment_allocations_payment_id_ledger_entry_id_key;

create table if not exists public.supplier_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.supplier_payments(id) on delete restrict,
  ledger_entry_id uuid not null references public.supplier_ledger_entries(id) on delete restrict,
  amount numeric(18, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id)
);

create index if not exists supplier_payment_allocations_payment_id_idx
  on public.supplier_payment_allocations (payment_id);
create index if not exists supplier_payment_allocations_ledger_entry_id_idx
  on public.supplier_payment_allocations (ledger_entry_id);

drop trigger if exists trg_supplier_payment_allocations_append_only on public.supplier_payment_allocations;
create trigger trg_supplier_payment_allocations_append_only
  before update or delete on public.supplier_payment_allocations
  for each row execute function public.prevent_any_update_or_delete();

create or replace function public.assert_customer_payment_allocation_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_payment_amount numeric(18, 2);
  v_payment_status text;
  v_allocated_amount numeric(18, 2);
begin
  v_payment_id := case when tg_op = 'DELETE' then old.payment_id else new.payment_id end;

  select amount, status
    into v_payment_amount, v_payment_status
  from public.customer_payments
  where id = v_payment_id
  for update;

  if not found then
    raise exception 'Customer payment allocation references a missing payment %.', v_payment_id;
  end if;
  if v_payment_status in ('draft', 'reversed') then
    raise exception 'Customer payment must be confirmed and active before allocation.';
  end if;

  select coalesce(sum(amount), 0)::numeric(18, 2)
    into v_allocated_amount
  from public.customer_payment_allocations
  where payment_id = v_payment_id;

  if v_allocated_amount > v_payment_amount then
    raise exception 'Customer payment allocation cannot exceed payment amount for payment %.', v_payment_id;
  end if;

  if exists (
    select 1
    from public.customer_payment_allocations allocation
    join public.customer_payments payment on payment.id = allocation.payment_id
    left join public.customer_ledger_entries ledger on ledger.id = allocation.ledger_entry_id
    where allocation.payment_id = v_payment_id
      and (
        ledger.id is null
        or ledger.customer_id <> payment.customer_id
        or ledger.debit <= 0
        or ledger.credit <> 0
        or ledger.reversed_by_id is not null
      )
  ) then
    raise exception 'Customer payment allocation target must be an open receivable ledger entry for the same customer.';
  end if;

  if exists (
    select 1
    from (
      select allocation.ledger_entry_id, sum(allocation.amount)::numeric(18, 2) as allocated_amount
      from public.customer_payment_allocations allocation
      join public.customer_payments payment on payment.id = allocation.payment_id
      where payment.status <> 'reversed'
      group by allocation.ledger_entry_id
    ) allocation_total
    join public.customer_ledger_entries ledger on ledger.id = allocation_total.ledger_entry_id
    where allocation_total.allocated_amount > ledger.debit
  ) then
    raise exception 'Customer payment allocations cannot exceed the receivable ledger amount.';
  end if;

  return null;
end;
$$;

create or replace function public.assert_supplier_payment_allocation_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_payment_amount numeric(18, 2);
  v_payment_status text;
  v_allocated_amount numeric(18, 2);
begin
  v_payment_id := case when tg_op = 'DELETE' then old.payment_id else new.payment_id end;

  select amount, status
    into v_payment_amount, v_payment_status
  from public.supplier_payments
  where id = v_payment_id
  for update;

  if not found then
    raise exception 'Supplier payment allocation references a missing payment %.', v_payment_id;
  end if;
  if v_payment_status in ('draft', 'reversed') then
    raise exception 'Supplier payment must be confirmed and active before allocation.';
  end if;

  select coalesce(sum(amount), 0)::numeric(18, 2)
    into v_allocated_amount
  from public.supplier_payment_allocations
  where payment_id = v_payment_id;

  if v_allocated_amount > v_payment_amount then
    raise exception 'Supplier payment allocation cannot exceed payment amount for payment %.', v_payment_id;
  end if;

  if exists (
    select 1
    from public.supplier_payment_allocations allocation
    join public.supplier_payments payment on payment.id = allocation.payment_id
    left join public.supplier_ledger_entries ledger on ledger.id = allocation.ledger_entry_id
    where allocation.payment_id = v_payment_id
      and (
        ledger.id is null
        or ledger.supplier_id <> payment.supplier_id
        or ledger.credit <= 0
        or ledger.debit <> 0
        or ledger.reversed_by_id is not null
      )
  ) then
    raise exception 'Supplier payment allocation target must be an open payable ledger entry for the same supplier.';
  end if;

  if exists (
    select 1
    from (
      select allocation.ledger_entry_id, sum(allocation.amount)::numeric(18, 2) as allocated_amount
      from public.supplier_payment_allocations allocation
      join public.supplier_payments payment on payment.id = allocation.payment_id
      where payment.status <> 'reversed'
      group by allocation.ledger_entry_id
    ) allocation_total
    join public.supplier_ledger_entries ledger on ledger.id = allocation_total.ledger_entry_id
    where allocation_total.allocated_amount > ledger.credit
  ) then
    raise exception 'Supplier payment allocations cannot exceed the payable ledger amount.';
  end if;

  return null;
end;
$$;

drop trigger if exists trg_supplier_payment_allocation_invariants on public.supplier_payment_allocations;
create constraint trigger trg_supplier_payment_allocation_invariants
  after insert or update or delete on public.supplier_payment_allocations
  deferrable initially deferred
  for each row execute function public.assert_supplier_payment_allocation_invariants();

alter table public.supplier_payment_allocations enable row level security;
drop policy if exists finance_roles_read_supplier_payment_allocations on public.supplier_payment_allocations;
create policy finance_roles_read_supplier_payment_allocations on public.supplier_payment_allocations
  for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'administrator', 'accountant'));

drop trigger if exists trg_supplier_payment_allocations_bump_operations_revision on public.supplier_payment_allocations;
create trigger trg_supplier_payment_allocations_bump_operations_revision
  after insert or update or delete on public.supplier_payment_allocations
  for each statement execute function public.bump_operations_revision();

create or replace view public.customer_debt_reconciliation_view
with (security_invoker = true)
as
select
  ledger.id as ledger_entry_id,
  ledger.customer_id,
  ledger.source_type,
  ledger.source_id,
  ledger.posting_date,
  ledger.debit as original_amount,
  coalesce(sum(allocation.amount) filter (where payment.status <> 'reversed'), 0)::numeric(18, 2) as allocated_amount,
  greatest(ledger.debit - coalesce(sum(allocation.amount) filter (where payment.status <> 'reversed'), 0), 0)::numeric(18, 2) as open_amount
from public.customer_ledger_entries ledger
left join public.customer_payment_allocations allocation on allocation.ledger_entry_id = ledger.id
left join public.customer_payments payment on payment.id = allocation.payment_id
where ledger.debit > 0 and ledger.credit = 0 and ledger.reversed_by_id is null
group by ledger.id, ledger.customer_id, ledger.source_type, ledger.source_id, ledger.posting_date, ledger.debit;

create or replace view public.supplier_debt_reconciliation_view
with (security_invoker = true)
as
select
  ledger.id as ledger_entry_id,
  ledger.supplier_id,
  ledger.source_type,
  ledger.source_id,
  ledger.posting_date,
  ledger.credit as original_amount,
  coalesce(sum(allocation.amount) filter (where payment.status <> 'reversed'), 0)::numeric(18, 2) as allocated_amount,
  greatest(ledger.credit - coalesce(sum(allocation.amount) filter (where payment.status <> 'reversed'), 0), 0)::numeric(18, 2) as open_amount
from public.supplier_ledger_entries ledger
left join public.supplier_payment_allocations allocation on allocation.ledger_entry_id = ledger.id
left join public.supplier_payments payment on payment.id = allocation.payment_id
where ledger.credit > 0 and ledger.debit = 0 and ledger.reversed_by_id is null
group by ledger.id, ledger.supplier_id, ledger.source_type, ledger.source_id, ledger.posting_date, ledger.credit;

create or replace view public.audit_integrity_view
with (security_invoker = true)
as
select
  audit.id,
  audit.created_at,
  audit.action,
  audit.entity_type,
  audit.entity_id,
  audit.reason,
  audit.correlation_id,
  command.operation as idempotent_operation,
  command.status as idempotent_status,
  case
    when audit.correlation_id is null then 'missing_correlation'
    when command.key is null then 'missing_idempotency_record'
    when command.operation <> audit.action then 'operation_mismatch'
    else 'matched'
  end as integrity_status
from public.audit_logs audit
left join public.idempotency_keys command on command.key = audit.correlation_id;

comment on table public.supplier_payment_allocations is 'Append-only allocations between supplier payments and payable ledger obligations.';
comment on view public.audit_integrity_view is 'Read model used to reconcile audit events with server idempotency records.';

commit;
