-- Server-only, operator-supplied overrides for facts that cannot be inferred
-- safely from the legacy runtime document. These rows are cutover evidence,
-- not a fallback runtime persistence layer.

alter table public.vehicles
  add column if not exists capacity_tons numeric(12, 3)
    check (capacity_tons is null or capacity_tons > 0);

create table if not exists public.erp_cutover_identity_aliases (
  id uuid primary key default gen_random_uuid(),
  cutover_run_id uuid not null references public.erp_cutover_runs(id) on delete restrict,
  legacy_identity_namespace text not null check (length(btrim(legacy_identity_namespace)) > 0),
  legacy_identity_id text not null check (length(btrim(legacy_identity_id)) > 0),
  app_user_id uuid not null references public.app_users(user_id) on delete restrict,
  recorded_by uuid not null references public.app_users(user_id) on delete restrict,
  recorded_at timestamptz not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  unique (cutover_run_id, legacy_identity_namespace, legacy_identity_id)
);

create table if not exists public.erp_cutover_source_document_overrides (
  id uuid primary key default gen_random_uuid(),
  cutover_run_id uuid not null references public.erp_cutover_runs(id) on delete restrict,
  legacy_document_type text not null check (length(btrim(legacy_document_type)) > 0),
  legacy_document_reference text not null check (length(btrim(legacy_document_reference)) > 0),
  target_entity_type text not null check (
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
      'work_order',
      'compensation_batch',
      'import_job'
    )
  ),
  target_id uuid not null,
  recorded_by uuid not null references public.app_users(user_id) on delete restrict,
  recorded_at timestamptz not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  unique (cutover_run_id, legacy_document_type, legacy_document_reference)
);

create table if not exists public.erp_cutover_payment_overrides (
  id uuid primary key default gen_random_uuid(),
  cutover_run_id uuid not null references public.erp_cutover_runs(id) on delete restrict,
  legacy_payment_type text not null check (length(btrim(legacy_payment_type)) > 0),
  legacy_payment_id text not null check (length(btrim(legacy_payment_id)) > 0),
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  payment_method text not null check (payment_method in ('cash', 'bank_transfer', 'other')),
  payment_occurred_at timestamptz not null,
  actor_identity_alias_id uuid not null references public.erp_cutover_identity_aliases(id) on delete restrict,
  recorded_by uuid not null references public.app_users(user_id) on delete restrict,
  recorded_at timestamptz not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  unique (cutover_run_id, legacy_payment_type, legacy_payment_id)
);

create table if not exists public.erp_cutover_attachment_overrides (
  id uuid primary key default gen_random_uuid(),
  cutover_run_id uuid not null references public.erp_cutover_runs(id) on delete restrict,
  legacy_attachment_type text not null check (length(btrim(legacy_attachment_type)) > 0),
  legacy_attachment_id text not null check (length(btrim(legacy_attachment_id)) > 0),
  storage_bucket text not null check (length(btrim(storage_bucket)) > 0),
  storage_object_path text not null check (length(btrim(storage_object_path)) > 0),
  file_name text not null check (length(btrim(file_name)) > 0),
  content_type text not null check (length(btrim(content_type)) > 0),
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  recorded_by uuid not null references public.app_users(user_id) on delete restrict,
  recorded_at timestamptz not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  unique (cutover_run_id, legacy_attachment_type, legacy_attachment_id),
  unique (cutover_run_id, storage_bucket, storage_object_path)
);

create index if not exists erp_cutover_source_document_target_idx
  on public.erp_cutover_source_document_overrides(cutover_run_id, target_entity_type, target_id);
create index if not exists erp_cutover_payment_account_idx
  on public.erp_cutover_payment_overrides(cutover_run_id, cash_account_id, payment_occurred_at);
create index if not exists erp_cutover_attachment_storage_idx
  on public.erp_cutover_attachment_overrides(cutover_run_id, storage_bucket, storage_object_path);

create or replace function public.assert_cutover_source_document_override_target()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_table_name text;
  target_exists boolean;
begin
  target_table_name := case new.target_entity_type
    when 'sales_order' then 'sales_orders'
    when 'purchase_order' then 'purchase_orders'
    when 'delivery_job' then 'delivery_jobs'
    when 'inventory_posting' then 'inventory_postings'
    when 'cash_voucher' then 'cash_vouchers'
    when 'cash_transaction' then 'cash_transactions'
    when 'customer_payment' then 'customer_payments'
    when 'supplier_payment' then 'supplier_payments'
    when 'employee_payment' then 'employee_payments'
    when 'employee_advance' then 'employee_advances'
    when 'customer_ledger_entry' then 'customer_ledger_entries'
    when 'supplier_ledger_entry' then 'supplier_ledger_entries'
    when 'employee_ledger_entry' then 'employee_ledger_entries'
    when 'work_order' then 'work_orders'
    when 'compensation_batch' then 'compensation_batches'
    when 'import_job' then 'import_jobs'
  end;

  if target_table_name is null then
    raise exception 'Unknown normalized target entity type for cutover source document override.';
  end if;

  execute format('select exists (select 1 from public.%I where id = $1)', target_table_name)
    into target_exists
    using new.target_id;

  if target_exists is not true then
    raise exception 'Cutover source document override target does not exist.';
  end if;

  return new;
end;
$$;

create or replace function public.assert_cutover_payment_override_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  alias_cutover_run_id uuid;
begin
  select identity_alias.cutover_run_id
    into alias_cutover_run_id
    from public.erp_cutover_identity_aliases identity_alias
    where identity_alias.id = new.actor_identity_alias_id;

  if alias_cutover_run_id is null or alias_cutover_run_id <> new.cutover_run_id then
    raise exception 'Payment override actor alias must belong to the same cutover run.';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_cutover_source_document_override_target_guard
  on public.erp_cutover_source_document_overrides;
create trigger erp_cutover_source_document_override_target_guard
  before insert or update of target_entity_type, target_id
  on public.erp_cutover_source_document_overrides
  for each row execute function public.assert_cutover_source_document_override_target();

drop trigger if exists erp_cutover_payment_override_integrity_guard
  on public.erp_cutover_payment_overrides;
create trigger erp_cutover_payment_override_integrity_guard
  before insert or update of cutover_run_id, actor_identity_alias_id
  on public.erp_cutover_payment_overrides
  for each row execute function public.assert_cutover_payment_override_integrity();

alter table public.erp_cutover_identity_aliases enable row level security;
alter table public.erp_cutover_source_document_overrides enable row level security;
alter table public.erp_cutover_payment_overrides enable row level security;
alter table public.erp_cutover_attachment_overrides enable row level security;
revoke all on table public.erp_cutover_identity_aliases from public, anon, authenticated;
revoke all on table public.erp_cutover_source_document_overrides from public, anon, authenticated;
revoke all on table public.erp_cutover_payment_overrides from public, anon, authenticated;
revoke all on table public.erp_cutover_attachment_overrides from public, anon, authenticated;
revoke all on function public.assert_cutover_source_document_override_target() from public, anon, authenticated;
revoke all on function public.assert_cutover_payment_override_integrity() from public, anon, authenticated;
grant execute on function public.assert_cutover_source_document_override_target() to service_role;
grant execute on function public.assert_cutover_payment_override_integrity() to service_role;

comment on table public.erp_cutover_identity_aliases is 'Server-only operator mappings from legacy actor identities to approved app users.';
comment on table public.erp_cutover_source_document_overrides is 'Fail-closed, typed source-document mappings for legacy references that cannot be resolved automatically.';
comment on table public.erp_cutover_payment_overrides is 'Operator-supplied payment account, method, timestamp and actor mappings. No account or method defaults are permitted.';
comment on table public.erp_cutover_attachment_overrides is 'Operator-supplied private storage metadata and SHA-256 evidence for legacy attachments.';
