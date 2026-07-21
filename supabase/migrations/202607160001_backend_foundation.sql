-- Backend foundation for VLXD Operations System.
-- This migration follows the project rule that financial, inventory, and
-- compensation state is derived from append-only ledgers/movements.

create extension if not exists pgcrypto;
create extension if not exists unaccent;
create extension if not exists pg_trgm;

create table public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (
    role in (
      'owner',
      'administrator',
      'accountant',
      'sales',
      'warehouse',
      'dispatcher',
      'driver',
      'worker',
      'supervisor',
      'viewer'
    )
  ),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  normalized_name text not null,
  phone text,
  credit_limit numeric(18, 2) not null default 0 check (credit_limit >= 0),
  payment_term_days integer not null default 0 check (payment_term_days >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(user_id)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  normalized_name text not null,
  phone text,
  payment_term_days integer not null default 0 check (payment_term_days >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(user_id)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  code text not null unique,
  display_name text not null,
  normalized_name text not null,
  role_type text not null check (role_type in ('driver', 'worker', 'warehouse', 'sales', 'accountant', 'supervisor')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(user_id)
);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive'))
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  normalized_name text not null,
  category_id uuid references public.product_categories(id),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null
);

create table public.product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  unit_id uuid not null references public.units(id),
  conversion_factor numeric(18, 6) not null check (conversion_factor > 0),
  is_base boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  unique (product_id, unit_id)
);

create table public.price_rules (
  id uuid primary key default gen_random_uuid(),
  product_unit_id uuid not null references public.product_units(id),
  unit_price numeric(18, 2) not null check (unit_price >= 0),
  tax_rate numeric(7, 4) not null default 0 check (tax_rate >= 0 and tax_rate <= 1),
  effective_from date not null,
  effective_to date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.work_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive'))
);

create table public.work_rate_rules (
  id uuid primary key default gen_random_uuid(),
  work_type_id uuid not null references public.work_types(id),
  product_unit_id uuid references public.product_units(id),
  rate_amount numeric(18, 2) not null check (rate_amount >= 0),
  effective_from date not null,
  effective_to date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive'))
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  plate_number text not null,
  status text not null default 'active' check (status in ('active', 'inactive'))
);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  customer_id uuid not null references public.customers(id),
  order_date date not null,
  status text not null default 'draft' check (
    status in ('draft', 'confirmed', 'allocated', 'partially_delivered', 'delivered', 'completed', 'cancelled')
  ),
  currency text not null default 'VND' check (currency = 'VND'),
  net_total numeric(18, 2) not null default 0 check (net_total >= 0),
  tax_total numeric(18, 2) not null default 0 check (tax_total >= 0),
  gross_total numeric(18, 2) not null default 0 check (gross_total >= 0),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(user_id),
  confirmed_at timestamptz,
  confirmed_by uuid references public.app_users(user_id),
  posted_at timestamptz,
  posted_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.sales_orders(id)
);

create table public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_unit_id uuid not null references public.product_units(id),
  quantity numeric(18, 3) not null check (quantity > 0),
  delivered_quantity numeric(18, 3) not null default 0 check (delivered_quantity >= 0),
  unit_price numeric(18, 2) not null check (unit_price >= 0),
  discount_amount numeric(18, 2) not null default 0 check (discount_amount >= 0),
  tax_rate numeric(7, 4) not null default 0 check (tax_rate >= 0 and tax_rate <= 1),
  net_amount numeric(18, 2) not null check (net_amount >= 0),
  tax_amount numeric(18, 2) not null check (tax_amount >= 0),
  gross_amount numeric(18, 2) not null check (gross_amount >= 0),
  pricing_snapshot jsonb not null,
  source_type text check (source_type in ('warehouse', 'direct_supplier')),
  warehouse_id uuid references public.warehouses(id),
  purchase_order_item_id uuid,
  check (delivered_quantity <= quantity)
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  supplier_id uuid not null references public.suppliers(id),
  order_date date not null,
  status text not null default 'draft' check (
    status in ('draft', 'ordered', 'supplier_confirmed', 'partially_received', 'fully_received', 'completed', 'cancelled')
  ),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(user_id),
  posted_at timestamptz,
  posted_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.purchase_orders(id)
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_unit_id uuid not null references public.product_units(id),
  ordered_quantity numeric(18, 3) not null check (ordered_quantity > 0),
  received_quantity numeric(18, 3) not null default 0 check (received_quantity >= 0),
  unit_cost numeric(18, 2) not null check (unit_cost >= 0),
  tax_rate numeric(7, 4) not null default 0 check (tax_rate >= 0 and tax_rate <= 1),
  pricing_snapshot jsonb not null,
  check (received_quantity <= ordered_quantity)
);

alter table public.sales_order_items
  add constraint sales_order_items_purchase_order_item_id_fkey
  foreign key (purchase_order_item_id) references public.purchase_order_items(id);

create table public.purchase_destinations (
  id uuid primary key default gen_random_uuid(),
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete cascade,
  destination_type text not null check (destination_type in ('warehouse', 'customer_direct', 'other')),
  warehouse_id uuid references public.warehouses(id),
  customer_id uuid references public.customers(id),
  sales_order_item_id uuid references public.sales_order_items(id),
  quantity numeric(18, 3) not null check (quantity > 0),
  check (
    (destination_type = 'warehouse' and warehouse_id is not null and customer_id is null)
    or (destination_type = 'customer_direct' and customer_id is not null and sales_order_item_id is not null)
    or (destination_type = 'other')
  )
);

create table public.inventory_postings (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  posting_type text not null check (posting_type in ('opening', 'receipt', 'issue', 'transfer', 'count_adjustment', 'return', 'reversal')),
  source_type text not null,
  source_id uuid not null,
  posting_key text not null unique,
  posted_at timestamptz not null default now(),
  posted_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.inventory_postings(id)
);

create table public.inventory_movement_lines (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references public.inventory_postings(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id),
  product_unit_id uuid not null references public.product_units(id),
  quantity numeric(18, 3) not null check (quantity <> 0),
  unit_cost numeric(18, 4) check (unit_cost is null or unit_cost >= 0)
);

create table public.inventory_cost_states (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  product_unit_id uuid not null references public.product_units(id),
  quantity_on_hand numeric(18, 3) not null default 0,
  moving_average_cost numeric(18, 4) not null default 0 check (moving_average_cost >= 0),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, product_unit_id)
);

create table public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  sales_order_id uuid not null references public.sales_orders(id),
  vehicle_id uuid references public.vehicles(id),
  driver_id uuid references public.employees(id),
  planned_date date not null,
  status text not null default 'unassigned' check (
    status in ('unassigned', 'assigned', 'loading', 'in_transit', 'partially_delivered', 'delivered', 'completed', 'failed', 'cancelled')
  ),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(user_id)
);

create table public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_job_id uuid not null references public.delivery_jobs(id) on delete cascade,
  sales_order_item_id uuid not null references public.sales_order_items(id),
  planned_quantity numeric(18, 3) not null check (planned_quantity > 0),
  delivered_quantity numeric(18, 3) not null default 0 check (delivered_quantity >= 0),
  check (delivered_quantity <= planned_quantity)
);

create table public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  delivery_job_id uuid not null references public.delivery_jobs(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  assignment_role text not null check (assignment_role in ('driver', 'helper', 'worker', 'supervisor')),
  unique (delivery_job_id, employee_id, assignment_role)
);

create table public.customer_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  entry_type text not null check (entry_type in ('receivable', 'payment', 'adjustment', 'reversal')),
  source_type text not null,
  source_id uuid not null,
  debit numeric(18, 2) not null default 0 check (debit >= 0),
  credit numeric(18, 2) not null default 0 check (credit >= 0),
  posting_date date not null,
  posted_at timestamptz not null default now(),
  posted_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.customer_ledger_entries(id),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create table public.supplier_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  entry_type text not null check (entry_type in ('payable', 'payment', 'adjustment', 'reversal')),
  source_type text not null,
  source_id uuid not null,
  debit numeric(18, 2) not null default 0 check (debit >= 0),
  credit numeric(18, 2) not null default 0 check (credit >= 0),
  posting_date date not null,
  posted_at timestamptz not null default now(),
  posted_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.supplier_ledger_entries(id),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create table public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive'))
);

create table public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  customer_id uuid not null references public.customers(id),
  cash_account_id uuid not null references public.cash_accounts(id),
  amount numeric(18, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'bank_transfer', 'other')),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'partially_allocated', 'allocated', 'reversed')),
  version integer not null default 1 check (version > 0),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  confirmed_at timestamptz,
  confirmed_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.customer_payments(id)
);

create table public.customer_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.customer_payments(id) on delete restrict,
  ledger_entry_id uuid not null references public.customer_ledger_entries(id) on delete restrict,
  amount numeric(18, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  unique (payment_id, ledger_entry_id)
);

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  supplier_id uuid not null references public.suppliers(id),
  cash_account_id uuid not null references public.cash_accounts(id),
  amount numeric(18, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'bank_transfer', 'other')),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'allocated', 'reversed')),
  version integer not null default 1 check (version > 0),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  confirmed_at timestamptz,
  confirmed_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.supplier_payments(id)
);

create table public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  cash_account_id uuid not null references public.cash_accounts(id),
  source_type text not null,
  source_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  amount numeric(18, 2) not null check (amount > 0),
  posted_at timestamptz not null default now(),
  posted_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.cash_transactions(id)
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  work_type_id uuid not null references public.work_types(id),
  work_date date not null,
  status text not null default 'draft' check (
    status in ('draft', 'assigned', 'accepted', 'in_progress', 'submitted', 'awaiting_approval', 'approved', 'compensated', 'paid', 'rejected', 'cancelled')
  ),
  source_type text,
  source_id uuid,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(user_id)
);

create table public.work_outputs (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  product_unit_id uuid references public.product_units(id),
  actual_quantity numeric(18, 3) not null check (actual_quantity > 0),
  approved_quantity numeric(18, 3) check (approved_quantity is null or approved_quantity >= 0),
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'compensated')),
  approved_at timestamptz,
  approved_by uuid references public.app_users(user_id)
);

create table public.work_participants (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  participant_role text not null default 'worker',
  share_factor numeric(18, 6) not null default 1 check (share_factor > 0),
  unique (work_order_id, employee_id)
);

create table public.compensation_batches (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  status text not null default 'draft' check (status in ('draft', 'approved', 'posted', 'reversed')),
  total_amount numeric(18, 2) not null default 0 check (total_amount >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  posted_at timestamptz,
  posted_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.compensation_batches(id)
);

create table public.compensation_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.compensation_batches(id) on delete cascade,
  work_output_id uuid not null references public.work_outputs(id),
  employee_id uuid not null references public.employees(id),
  rate_snapshot jsonb not null,
  amount numeric(18, 2) not null check (amount >= 0),
  unique (work_output_id, employee_id)
);

create table public.employee_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  entry_type text not null check (entry_type in ('compensation', 'advance', 'payment', 'adjustment', 'reversal')),
  source_type text not null,
  source_id uuid not null,
  debit numeric(18, 2) not null default 0 check (debit >= 0),
  credit numeric(18, 2) not null default 0 check (credit >= 0),
  posting_date date not null,
  posted_at timestamptz not null default now(),
  posted_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.employee_ledger_entries(id),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  bucket text not null,
  object_path text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.app_users(user_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.app_users(user_id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  correlation_id text,
  created_at timestamptz not null default now()
);

create table public.idempotency_keys (
  key text primary key,
  operation text not null,
  request_hash text not null,
  response_body jsonb not null,
  status text not null default 'completed' check (status in ('started', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  source_file_name text not null,
  source_file_hash text not null,
  status text not null default 'uploaded' check (status in ('uploaded', 'profiled', 'mapped', 'dry_run', 'approved', 'imported', 'failed')),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  unique (source_file_hash)
);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  source_sheet text not null,
  row_number integer not null check (row_number > 0),
  source_fingerprint text not null,
  raw_data jsonb not null,
  classified_as text,
  status text not null default 'pending' check (status in ('pending', 'valid', 'invalid', 'imported', 'skipped')),
  unique (import_job_id, source_fingerprint)
);

create table public.import_issues (
  id uuid primary key default gen_random_uuid(),
  import_row_id uuid references public.import_rows(id) on delete cascade,
  severity text not null check (severity in ('warning', 'error')),
  message text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'accepted')),
  resolved_at timestamptz,
  resolved_by uuid references public.app_users(user_id)
);

create index customers_normalized_name_trgm_idx on public.customers using gin (normalized_name gin_trgm_ops);
create index customers_phone_idx on public.customers (phone);
create index suppliers_normalized_name_trgm_idx on public.suppliers using gin (normalized_name gin_trgm_ops);
create index products_normalized_name_trgm_idx on public.products using gin (normalized_name gin_trgm_ops);

create index product_units_product_id_idx on public.product_units (product_id);
create index product_units_unit_id_idx on public.product_units (unit_id);
create index price_rules_product_unit_effective_idx on public.price_rules (product_unit_id, effective_from, effective_to);

create index sales_orders_customer_date_idx on public.sales_orders (customer_id, order_date);
create index sales_orders_status_date_idx on public.sales_orders (status, order_date);
create index sales_order_items_sales_order_id_idx on public.sales_order_items (sales_order_id);
create index sales_order_items_product_unit_id_idx on public.sales_order_items (product_unit_id);

create index purchase_orders_supplier_date_idx on public.purchase_orders (supplier_id, order_date);
create index purchase_orders_status_date_idx on public.purchase_orders (status, order_date);
create index purchase_order_items_purchase_order_id_idx on public.purchase_order_items (purchase_order_id);
create index purchase_order_items_product_unit_id_idx on public.purchase_order_items (product_unit_id);
create index purchase_destinations_purchase_order_item_id_idx on public.purchase_destinations (purchase_order_item_id);
create index purchase_destinations_sales_order_item_id_idx on public.purchase_destinations (sales_order_item_id);

create index inventory_movement_lines_posting_id_idx on public.inventory_movement_lines (posting_id);
create index inventory_movement_lines_stock_idx on public.inventory_movement_lines (warehouse_id, product_unit_id);
create index inventory_postings_source_idx on public.inventory_postings (source_type, source_id);

create index delivery_jobs_sales_order_id_idx on public.delivery_jobs (sales_order_id);
create index delivery_jobs_status_date_idx on public.delivery_jobs (status, planned_date);
create index delivery_assignments_employee_id_idx on public.delivery_assignments (employee_id);
create index delivery_items_delivery_job_id_idx on public.delivery_items (delivery_job_id);
create index delivery_items_sales_order_item_id_idx on public.delivery_items (sales_order_item_id);

create index customer_ledger_entries_customer_date_idx on public.customer_ledger_entries (customer_id, posting_date);
create index customer_ledger_entries_source_idx on public.customer_ledger_entries (source_type, source_id);
create index customer_payment_allocations_payment_id_idx on public.customer_payment_allocations (payment_id);
create index customer_payment_allocations_ledger_entry_id_idx on public.customer_payment_allocations (ledger_entry_id);
create index customer_payments_customer_status_idx on public.customer_payments (customer_id, status);

create index supplier_ledger_entries_supplier_date_idx on public.supplier_ledger_entries (supplier_id, posting_date);
create index supplier_ledger_entries_source_idx on public.supplier_ledger_entries (source_type, source_id);
create index supplier_payments_supplier_status_idx on public.supplier_payments (supplier_id, status);

create index cash_transactions_account_posted_idx on public.cash_transactions (cash_account_id, posted_at);
create index cash_transactions_source_idx on public.cash_transactions (source_type, source_id);

create index work_orders_status_date_idx on public.work_orders (status, work_date);
create index work_outputs_work_order_id_idx on public.work_outputs (work_order_id);
create index work_participants_work_order_id_idx on public.work_participants (work_order_id);
create index work_participants_employee_id_idx on public.work_participants (employee_id);
create index compensation_lines_batch_id_idx on public.compensation_lines (batch_id);
create index compensation_lines_employee_id_idx on public.compensation_lines (employee_id);
create index employee_ledger_entries_employee_date_idx on public.employee_ledger_entries (employee_id, posting_date);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at);
create index idempotency_keys_expires_at_idx on public.idempotency_keys (expires_at);
create index import_rows_job_status_idx on public.import_rows (import_job_id, status);
create index import_issues_status_idx on public.import_issues (status, severity);

create or replace view public.customer_balance_view as
select
  customer_id,
  coalesce(sum(debit - credit), 0)::numeric(18, 2) as balance
from public.customer_ledger_entries
where reversed_by_id is null
group by customer_id;

create or replace view public.supplier_balance_view as
select
  supplier_id,
  coalesce(sum(credit - debit), 0)::numeric(18, 2) as balance
from public.supplier_ledger_entries
where reversed_by_id is null
group by supplier_id;

create or replace view public.stock_balance_view as
select
  line.warehouse_id,
  line.product_unit_id,
  coalesce(sum(line.quantity), 0)::numeric(18, 3) as on_hand
from public.inventory_movement_lines line
join public.inventory_postings posting on posting.id = line.posting_id
where posting.reversed_by_id is null
group by line.warehouse_id, line.product_unit_id;

create or replace view public.employee_balance_view as
select
  employee_id,
  coalesce(sum(credit - debit), 0)::numeric(18, 2) as balance
from public.employee_ledger_entries
where reversed_by_id is null
group by employee_id;

create or replace function public.is_active_app_user()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users
    where user_id = (select auth.uid())
      and status = 'active'
  );
$$;

create or replace function public.current_app_role()
returns text
language sql
security definer
set search_path = ''
as $$
  select role
  from public.app_users
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;
$$;

alter table public.app_users enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.employees enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.units enable row level security;
alter table public.product_units enable row level security;
alter table public.price_rules enable row level security;
alter table public.work_types enable row level security;
alter table public.work_rate_rules enable row level security;
alter table public.warehouses enable row level security;
alter table public.vehicles enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.purchase_destinations enable row level security;
alter table public.inventory_postings enable row level security;
alter table public.inventory_movement_lines enable row level security;
alter table public.inventory_cost_states enable row level security;
alter table public.delivery_jobs enable row level security;
alter table public.delivery_items enable row level security;
alter table public.delivery_assignments enable row level security;
alter table public.customer_ledger_entries enable row level security;
alter table public.supplier_ledger_entries enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.customer_payments enable row level security;
alter table public.customer_payment_allocations enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_outputs enable row level security;
alter table public.work_participants enable row level security;
alter table public.compensation_batches enable row level security;
alter table public.compensation_lines enable row level security;
alter table public.employee_ledger_entries enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_rows enable row level security;
alter table public.import_issues enable row level security;

create policy app_users_self_select on public.app_users
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy active_users_read_customers on public.customers
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_suppliers on public.suppliers
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_employees on public.employees
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_product_categories on public.product_categories
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_catalog on public.products
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_units on public.units
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_product_units on public.product_units
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_price_rules on public.price_rules
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_work_types on public.work_types
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_work_rate_rules on public.work_rate_rules
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_warehouses on public.warehouses
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_vehicles on public.vehicles
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_sales_orders on public.sales_orders
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_sales_order_items on public.sales_order_items
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_purchase_orders on public.purchase_orders
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_purchase_order_items on public.purchase_order_items
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_purchase_destinations on public.purchase_destinations
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_delivery_jobs on public.delivery_jobs
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_delivery_items on public.delivery_items
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_delivery_assignments on public.delivery_assignments
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_inventory_postings on public.inventory_postings
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_inventory_lines on public.inventory_movement_lines
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_inventory_cost_states on public.inventory_cost_states
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_work_orders on public.work_orders
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_work_outputs on public.work_outputs
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_work_participants on public.work_participants
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_import_issues on public.import_issues
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_import_jobs on public.import_jobs
  for select to authenticated
  using ((select public.is_active_app_user()));
create policy active_users_read_import_rows on public.import_rows
  for select to authenticated
  using ((select public.is_active_app_user()));

create policy finance_roles_read_customer_ledger on public.customer_ledger_entries
  for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales'));
create policy finance_roles_read_supplier_ledger on public.supplier_ledger_entries
  for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'administrator', 'accountant'));
create policy finance_roles_read_cash on public.cash_transactions
  for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'administrator', 'accountant'));
create policy finance_roles_read_cash_accounts on public.cash_accounts
  for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'administrator', 'accountant'));
create policy finance_roles_read_customer_payments on public.customer_payments
  for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales'));
create policy finance_roles_read_customer_payment_allocations on public.customer_payment_allocations
  for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales'));
create policy finance_roles_read_supplier_payments on public.supplier_payments
  for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'administrator', 'accountant'));
create policy finance_roles_read_compensation_batches on public.compensation_batches
  for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'supervisor'));
create policy finance_roles_read_compensation_lines on public.compensation_lines
  for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'supervisor'));
create policy worker_or_finance_read_employee_ledger on public.employee_ledger_entries
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant')
    or employee_id in (
      select id
      from public.employees
      where auth_user_id = (select auth.uid())
    )
  );
create policy owners_read_audit_logs on public.audit_logs
  for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'administrator'));
create policy active_users_read_attachments on public.attachments
  for select to authenticated
  using ((select public.is_active_app_user()));

comment on table public.idempotency_keys is 'Server-only table for create/post command idempotency. Do not expose client mutation policies.';
comment on table public.inventory_movement_lines is 'Append-only inventory movement lines. Posted movements are reversed, never updated in place.';
comment on table public.customer_ledger_entries is 'Append-only customer sub-ledger. Customer balance is derived from debit - credit.';
comment on table public.supplier_ledger_entries is 'Append-only supplier sub-ledger. Supplier balance is derived from credit - debit.';
comment on table public.employee_ledger_entries is 'Append-only employee compensation ledger. Compensation/payment balance is derived from credit - debit.';
