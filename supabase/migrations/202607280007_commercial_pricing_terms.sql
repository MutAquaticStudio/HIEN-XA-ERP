-- Commercial pricing, terms, freight, and delivery-charge schema.
-- Runtime CAS remains the source of truth until the approved one-way cutover.

alter table public.customers
  add column if not exists payment_terms_note text;

alter table public.suppliers
  add column if not exists payment_terms_note text;

alter table public.product_units
  add column if not exists target_margin_rate numeric(7, 4) not null default 0.10
    check (target_margin_rate >= 0 and target_margin_rate < 1),
  add column if not exists standard_lead_time_days integer
    check (standard_lead_time_days is null or standard_lead_time_days >= 0);

alter table public.sales_orders
  add column if not exists payment_term_days integer not null default 0
    check (payment_term_days >= 0),
  add column if not exists payment_terms_note text,
  add column if not exists payment_terms_captured_at timestamptz,
  add column if not exists promised_delivery_date date;

alter table public.purchase_orders
  add column if not exists payment_term_days integer not null default 0
    check (payment_term_days >= 0),
  add column if not exists payment_terms_note text,
  add column if not exists payment_terms_captured_at timestamptz,
  add column if not exists expected_delivery_date date;

alter table public.purchase_order_items
  add column if not exists discount_amount numeric(18, 2) not null default 0
    check (discount_amount >= 0);

alter table public.customer_ledger_entries
  add column if not exists due_date date;

alter table public.supplier_ledger_entries
  add column if not exists due_date date;

create table if not exists public.purchase_freight_charges (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id),
  supplier_id uuid not null references public.suppliers(id),
  net_amount numeric(18, 2) not null check (net_amount >= 0),
  tax_rate numeric(7, 4) not null default 0 check (tax_rate >= 0 and tax_rate <= 1),
  tax_amount numeric(18, 2) not null default 0 check (tax_amount >= 0),
  gross_amount numeric(18, 2) not null check (gross_amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'posted', 'reversed')),
  idempotency_key text not null unique,
  posted_at timestamptz,
  posted_by uuid references public.app_users(user_id),
  reversed_by_id uuid references public.purchase_freight_charges(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  check (
    gross_amount = round(net_amount + tax_amount, 2)
    and tax_amount = round(net_amount * tax_rate, 2)
  )
);

create table if not exists public.purchase_freight_allocations (
  id uuid primary key default gen_random_uuid(),
  freight_charge_id uuid not null references public.purchase_freight_charges(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id),
  allocated_net_amount numeric(18, 2) not null check (allocated_net_amount >= 0),
  unique (freight_charge_id, purchase_order_item_id)
);

create table if not exists public.sales_order_charges (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  charge_type text not null check (charge_type = 'delivery_fee'),
  net_amount numeric(18, 2) not null check (net_amount >= 0),
  tax_rate numeric(7, 4) not null check (tax_rate >= 0 and tax_rate <= 1),
  tax_amount numeric(18, 2) not null check (tax_amount >= 0),
  gross_amount numeric(18, 2) not null check (gross_amount >= 0),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  check (
    gross_amount = round(net_amount + tax_amount, 2)
    and tax_amount = round(net_amount * tax_rate, 2)
  )
);

alter table public.purchase_freight_charges enable row level security;
alter table public.purchase_freight_allocations enable row level security;
alter table public.sales_order_charges enable row level security;

revoke all on public.purchase_freight_charges from public, anon, authenticated;
revoke all on public.purchase_freight_allocations from public, anon, authenticated;
revoke all on public.sales_order_charges from public, anon, authenticated;
