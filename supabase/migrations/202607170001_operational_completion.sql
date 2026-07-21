-- Operational completion for delivery scheduling, analytical ledgers, and cash documents.
-- This migration is applied after 202607160002_erp_invariant_hardening.sql.

alter table public.vehicles
  add column if not exists capacity_tons numeric(10, 3) not null default 1 check (capacity_tons > 0);

create unique index if not exists vehicles_plate_number_unique_idx
  on public.vehicles (upper(regexp_replace(plate_number, '\s+', '', 'g')));

alter table public.delivery_jobs
  add column if not exists recipient_name text,
  add column if not exists evidence_reference text,
  add column if not exists failure_reason text,
  add column if not exists confirmed_at timestamptz;

alter table public.delivery_jobs
  drop constraint if exists delivery_jobs_assigned_resources_check;
alter table public.delivery_jobs
  add constraint delivery_jobs_assigned_resources_check check (
    status in ('unassigned', 'cancelled') or (driver_id is not null and vehicle_id is not null)
  );

create unique index if not exists delivery_jobs_active_driver_day_unique_idx
  on public.delivery_jobs (driver_id, planned_date)
  where driver_id is not null and status in ('assigned', 'loading', 'in_transit');

create unique index if not exists delivery_jobs_active_vehicle_day_unique_idx
  on public.delivery_jobs (vehicle_id, planned_date)
  where vehicle_id is not null and status in ('assigned', 'loading', 'in_transit');

alter table public.customer_ledger_entries
  add column if not exists net_amount numeric(18, 2) check (net_amount is null or net_amount >= 0),
  add column if not exists tax_amount numeric(18, 2) check (tax_amount is null or tax_amount >= 0),
  add column if not exists quantity numeric(18, 3) check (quantity is null or quantity > 0),
  add column if not exists source_line_id uuid,
  add column if not exists posting_group_id text;

alter table public.supplier_ledger_entries
  add column if not exists net_amount numeric(18, 2) check (net_amount is null or net_amount >= 0),
  add column if not exists tax_amount numeric(18, 2) check (tax_amount is null or tax_amount >= 0),
  add column if not exists quantity numeric(18, 3) check (quantity is null or quantity > 0),
  add column if not exists source_line_id uuid,
  add column if not exists posting_group_id text;

create index if not exists customer_ledger_posting_group_idx
  on public.customer_ledger_entries (posting_group_id)
  where posting_group_id is not null;

create index if not exists supplier_ledger_posting_group_idx
  on public.supplier_ledger_entries (posting_group_id)
  where posting_group_id is not null;

create table if not exists public.cash_vouchers (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  cash_account_id uuid not null references public.cash_accounts(id),
  direction text not null check (direction in ('in', 'out')),
  category text not null check (length(btrim(category)) > 0),
  description text not null check (length(btrim(description)) > 0),
  amount numeric(18, 2) not null check (amount > 0),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'reversed')),
  version integer not null default 1 check (version > 0),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  confirmed_at timestamptz,
  confirmed_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.cash_vouchers(id),
  reversal_reason text
);

create table if not exists public.employee_payments (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  employee_id uuid not null references public.employees(id),
  cash_account_id uuid not null references public.cash_accounts(id),
  amount numeric(18, 2) not null check (amount > 0),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'reversed')),
  version integer not null default 1 check (version > 0),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  confirmed_at timestamptz,
  confirmed_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.employee_payments(id),
  reversal_reason text
);

create table if not exists public.employee_advances (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  employee_id uuid not null references public.employees(id),
  cash_account_id uuid not null references public.cash_accounts(id),
  purpose text not null check (length(btrim(purpose)) > 0),
  amount numeric(18, 2) not null check (amount > 0),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'reversed')),
  version integer not null default 1 check (version > 0),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  confirmed_at timestamptz,
  confirmed_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.employee_advances(id),
  reversal_reason text
);

alter table public.cash_vouchers enable row level security;
alter table public.employee_payments enable row level security;
alter table public.employee_advances enable row level security;

drop policy if exists active_users_read_cash_vouchers on public.cash_vouchers;
create policy active_users_read_cash_vouchers on public.cash_vouchers
  for select to authenticated
  using ((select public.is_active_app_user()));

drop policy if exists active_users_read_employee_payments on public.employee_payments;
create policy active_users_read_employee_payments on public.employee_payments
  for select to authenticated
  using ((select public.is_active_app_user()));

drop policy if exists active_users_read_employee_advances on public.employee_advances;
create policy active_users_read_employee_advances on public.employee_advances
  for select to authenticated
  using ((select public.is_active_app_user()));

drop trigger if exists trg_cash_vouchers_bump_operations_revision on public.cash_vouchers;
create trigger trg_cash_vouchers_bump_operations_revision
  after insert or update or delete on public.cash_vouchers
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_employee_payments_bump_operations_revision on public.employee_payments;
create trigger trg_employee_payments_bump_operations_revision
  after insert or update or delete on public.employee_payments
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_employee_advances_bump_operations_revision on public.employee_advances;
create trigger trg_employee_advances_bump_operations_revision
  after insert or update or delete on public.employee_advances
  for each statement execute function public.bump_operations_revision();

create or replace function public.assert_delivery_completion_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('delivered', 'completed') and (
    nullif(btrim(new.recipient_name), '') is null or
    nullif(btrim(new.evidence_reference), '') is null or
    new.confirmed_at is null
  ) then
    raise exception 'Completed delivery requires recipient, evidence, and confirmation time.';
  end if;

  if new.status = 'failed' and length(btrim(coalesce(new.failure_reason, ''))) < 5 then
    raise exception 'Failed delivery requires a reason of at least 5 characters.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_delivery_completion_metadata on public.delivery_jobs;
create trigger trg_delivery_completion_metadata
  before insert or update of status, recipient_name, evidence_reference, failure_reason, confirmed_at
  on public.delivery_jobs
  for each row execute function public.assert_delivery_completion_metadata();
