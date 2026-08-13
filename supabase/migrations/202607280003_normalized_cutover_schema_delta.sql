-- Relational compatibility for the one-way runtime-document cutover.
-- These additions preserve legacy provenance and portal/workflow data without
-- making a second production source of truth or opening browser mutations.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers', 'suppliers', 'employees', 'units', 'products', 'product_units', 'price_rules',
    'warehouses', 'vehicles', 'sales_orders', 'sales_order_items',
    'purchase_orders', 'purchase_order_items', 'purchase_destinations',
    'inventory_postings', 'inventory_movement_lines', 'delivery_jobs', 'delivery_items',
    'delivery_assignments', 'customer_ledger_entries', 'supplier_ledger_entries',
    'employee_ledger_entries', 'customer_payments', 'supplier_payments',
    'customer_payment_allocations', 'supplier_payment_allocations', 'cash_accounts',
    'cash_transactions', 'cash_vouchers', 'employee_payments', 'employee_advances',
    'work_orders', 'work_outputs', 'work_participants', 'compensation_batches',
    'compensation_lines', 'import_jobs', 'import_rows', 'import_issues',
    'audit_logs', 'idempotency_keys', 'attachments', 'bank_transfer_proofs',
    'bank_transfer_proof_attachments'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I add column if not exists legacy_runtime_id text', table_name);
      execute format(
        'create unique index if not exists %I on public.%I(legacy_runtime_id) where legacy_runtime_id is not null',
        table_name || '_legacy_runtime_id_uq',
        table_name
      );
    end if;
  end loop;
end;
$$;

alter table public.sales_orders
  add column if not exists delivery_address text,
  add column if not exists customer_note text,
  add column if not exists payment_method text check (payment_method in ('transfer', 'credit_requested')),
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb;

alter table public.inventory_postings
  add column if not exists legacy_source_document text,
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb;
alter table public.inventory_movement_lines
  add column if not exists source_line_legacy_id text,
  add column if not exists reason text,
  add column if not exists related_posting_id uuid references public.inventory_postings(id),
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb;

alter table public.delivery_jobs
  add column if not exists recipient_name text,
  add column if not exists evidence_reference text,
  add column if not exists failure_reason text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb;

alter table public.work_orders
  add column if not exists sales_order_id uuid references public.sales_orders(id),
  add column if not exists claimed_by_employee_id uuid references public.employees(id),
  add column if not exists claimed_at timestamptz,
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb;
alter table public.compensation_batches
  add column if not exists work_order_id uuid references public.work_orders(id),
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb;
alter table public.compensation_lines
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb;

alter table public.audit_logs
  add column if not exists actor_name text,
  add column if not exists actor_role text,
  add column if not exists permission text,
  add column if not exists target_legacy_id text,
  add column if not exists summary text,
  add column if not exists occurred_at timestamptz,
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb;
alter table public.idempotency_keys
  add column if not exists summary text,
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb;

alter table public.attachments
  add column if not exists file_name text,
  add column if not exists content_type text,
  add column if not exists byte_size bigint check (byte_size is null or byte_size >= 0),
  add column if not exists sha256 text,
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb;

alter table public.import_jobs
  add column if not exists sheet_names jsonb not null default '[]'::jsonb,
  add column if not exists row_count integer not null default 0 check (row_count >= 0),
  add column if not exists issue_count integer not null default 0 check (issue_count >= 0),
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb;
alter table public.import_issues
  add column if not exists import_job_id uuid references public.import_jobs(id),
  add column if not exists source_sheet text,
  add column if not exists row_number integer check (row_number is null or row_number > 0),
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb;

create table if not exists public.purchase_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  product_unit_id uuid not null references public.product_units(id),
  unit_id uuid not null references public.units(id),
  conversion_mode text not null check (conversion_mode in ('fixed', 'variable')),
  factor_to_base numeric(18, 6),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  legacy_runtime_id text unique,
  check (
    (conversion_mode = 'fixed' and factor_to_base is not null and factor_to_base > 0)
    or (conversion_mode = 'variable' and factor_to_base is null)
  ),
  unique (product_unit_id, unit_id)
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  document_no text not null,
  request_type text not null check (request_type in ('goods_receipt', 'delivery_completion')),
  target_id uuid,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  quantity numeric(18, 3),
  line_quantities jsonb,
  recipient_name text,
  evidence_reference text,
  submitted_by uuid references public.app_users(user_id),
  submitted_by_name text,
  submitted_at timestamptz not null,
  approved_by uuid references public.app_users(user_id),
  approved_by_name text,
  approved_at timestamptz,
  rejection_reason text,
  version integer not null default 1 check (version > 0),
  legacy_runtime_id text unique,
  legacy_metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.customer_payment_proof_requests (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id),
  customer_id uuid not null references public.customers(id),
  amount numeric(18, 2) not null check (amount > 0),
  transfer_reference text,
  note text,
  status text not null check (status in ('submitted', 'reviewed', 'rejected')),
  submitted_by uuid references public.app_users(user_id),
  submitted_at timestamptz not null,
  reviewed_by uuid references public.app_users(user_id),
  reviewed_at timestamptz,
  rejection_reason text,
  legacy_runtime_id text unique,
  legacy_metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.purchase_order_supplier_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id),
  status text not null check (status in ('available', 'unavailable')),
  proposed_delivery_date date,
  note text,
  submitted_by uuid references public.app_users(user_id),
  submitted_at timestamptz not null,
  version integer not null default 1 check (version > 0),
  legacy_runtime_id text unique,
  legacy_metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.purchase_order_supplier_delivery_notices (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id),
  note text,
  submitted_by uuid references public.app_users(user_id),
  submitted_at timestamptz not null,
  version integer not null default 1 check (version > 0),
  legacy_runtime_id text unique,
  legacy_metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.purchase_order_supplier_delivery_notice_lines (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.purchase_order_supplier_delivery_notices(id) on delete restrict,
  purchase_order_item_id uuid not null references public.purchase_order_items(id),
  quantity numeric(18, 3) not null check (quantity > 0),
  legacy_runtime_id text unique,
  unique (notice_id, purchase_order_item_id)
);

create table if not exists public.work_order_location_points (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete restrict,
  employee_id uuid not null references public.employees(id),
  recorded_at timestamptz not null,
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  accuracy_meters numeric(12, 3) check (accuracy_meters is null or accuracy_meters >= 0),
  source text not null default 'gps' check (source in ('gps', 'manual')),
  legacy_runtime_id text unique
);

create table if not exists public.document_attachment_links (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references public.attachments(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  attachment_role text not null default 'supporting',
  legacy_runtime_id text unique,
  created_at timestamptz not null default now(),
  unique (attachment_id, entity_type, entity_id, attachment_role)
);

create index if not exists approval_requests_status_idx on public.approval_requests(status, submitted_at desc);
create index if not exists customer_payment_proof_requests_order_idx on public.customer_payment_proof_requests(sales_order_id, submitted_at desc);
create index if not exists supplier_delivery_notices_order_idx on public.purchase_order_supplier_delivery_notices(purchase_order_id, submitted_at desc);
create index if not exists work_order_location_points_work_order_idx on public.work_order_location_points(work_order_id, recorded_at desc);
create index if not exists document_attachment_links_entity_idx on public.document_attachment_links(entity_type, entity_id);

alter table public.purchase_unit_conversions enable row level security;
alter table public.approval_requests enable row level security;
alter table public.customer_payment_proof_requests enable row level security;
alter table public.purchase_order_supplier_acknowledgements enable row level security;
alter table public.purchase_order_supplier_delivery_notices enable row level security;
alter table public.purchase_order_supplier_delivery_notice_lines enable row level security;
alter table public.work_order_location_points enable row level security;
alter table public.document_attachment_links enable row level security;
revoke all on table public.purchase_unit_conversions from public, anon, authenticated;
revoke all on table public.approval_requests from public, anon, authenticated;
revoke all on table public.customer_payment_proof_requests from public, anon, authenticated;
revoke all on table public.purchase_order_supplier_acknowledgements from public, anon, authenticated;
revoke all on table public.purchase_order_supplier_delivery_notices from public, anon, authenticated;
revoke all on table public.purchase_order_supplier_delivery_notice_lines from public, anon, authenticated;
revoke all on table public.work_order_location_points from public, anon, authenticated;
revoke all on table public.document_attachment_links from public, anon, authenticated;

comment on table public.approval_requests is 'Server-only normalized approval workflow. Browser clients cannot post approvals directly.';
comment on table public.customer_payment_proof_requests is 'Portal proof requests are reconciliation evidence only; they never confirm cash or receivables.';
comment on table public.purchase_order_supplier_delivery_notices is 'Supplier notices require internal approval before inventory or payable posting.';
comment on table public.erp_legacy_id_map is 'Cutover loaders must insert stable source mappings before resolving relational foreign keys.';
