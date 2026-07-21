-- ERP invariant hardening for production posting.
-- Keep this layer in the database so financial, inventory, workforce, and
-- attachment rules survive any future frontend or backend transport change.

create table if not exists public.erp_revisions (
  scope text primary key,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

insert into public.erp_revisions (scope, revision)
values ('operations', 1)
on conflict (scope) do nothing;

alter table public.erp_revisions enable row level security;

drop policy if exists active_users_read_erp_revisions on public.erp_revisions;
create policy active_users_read_erp_revisions on public.erp_revisions
  for select to authenticated
  using ((select public.is_active_app_user()));

create or replace function public.bump_operations_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
  v_updated_at timestamptz;
begin
  insert into public.erp_revisions (scope, revision, updated_at)
  values ('operations', 1, now())
  on conflict (scope) do update
    set revision = public.erp_revisions.revision + 1,
        updated_at = excluded.updated_at
  returning revision, updated_at into v_revision, v_updated_at;

  perform pg_notify(
    'erp_revisions',
    json_build_object(
      'scope', 'operations',
      'revision', v_revision,
      'updated_at', v_updated_at
    )::text
  );

  return null;
end;
$$;

create or replace function public.prevent_any_update_or_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception '% is append-only; create reversal or adjustment instead of update.', tg_table_name;
  end if;

  if tg_op = 'DELETE' then
    raise exception '% is append-only; create reversal or adjustment instead of delete.', tg_table_name;
  end if;

  return null;
end;
$$;

create or replace function public.prevent_update_except_reversal_marker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception '% is append-only; create reversal or adjustment instead of delete.', tg_table_name;
  end if;

  if (to_jsonb(new) - 'reversed_by_id') is distinct from (to_jsonb(old) - 'reversed_by_id') then
    raise exception '% is append-only; only reversed_by_id may be marked.', tg_table_name;
  end if;

  if old.reversed_by_id is not null and new.reversed_by_id is distinct from old.reversed_by_id then
    raise exception '% reversal marker is immutable once set.', tg_table_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_inventory_movement_lines_append_only on public.inventory_movement_lines;
create trigger trg_inventory_movement_lines_append_only
  before update or delete on public.inventory_movement_lines
  for each row execute function public.prevent_any_update_or_delete();

drop trigger if exists trg_customer_payment_allocations_append_only on public.customer_payment_allocations;
create trigger trg_customer_payment_allocations_append_only
  before update or delete on public.customer_payment_allocations
  for each row execute function public.prevent_any_update_or_delete();

drop trigger if exists trg_audit_logs_append_only on public.audit_logs;
create trigger trg_audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.prevent_any_update_or_delete();

drop trigger if exists trg_customer_ledger_entries_append_only on public.customer_ledger_entries;
create trigger trg_customer_ledger_entries_append_only
  before update or delete on public.customer_ledger_entries
  for each row execute function public.prevent_update_except_reversal_marker();

drop trigger if exists trg_supplier_ledger_entries_append_only on public.supplier_ledger_entries;
create trigger trg_supplier_ledger_entries_append_only
  before update or delete on public.supplier_ledger_entries
  for each row execute function public.prevent_update_except_reversal_marker();

drop trigger if exists trg_employee_ledger_entries_append_only on public.employee_ledger_entries;
create trigger trg_employee_ledger_entries_append_only
  before update or delete on public.employee_ledger_entries
  for each row execute function public.prevent_update_except_reversal_marker();

drop trigger if exists trg_inventory_postings_append_only on public.inventory_postings;
create trigger trg_inventory_postings_append_only
  before update or delete on public.inventory_postings
  for each row execute function public.prevent_update_except_reversal_marker();

drop trigger if exists trg_cash_transactions_append_only on public.cash_transactions;
create trigger trg_cash_transactions_append_only
  before update or delete on public.cash_transactions
  for each row execute function public.prevent_update_except_reversal_marker();

create or replace function public.assert_stock_nonnegative(
  p_warehouse_id uuid,
  p_product_unit_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_on_hand numeric(18, 3);
begin
  select coalesce(sum(line.quantity), 0)::numeric(18, 3)
    into v_on_hand
  from public.inventory_movement_lines line
  join public.inventory_postings posting on posting.id = line.posting_id
  where line.warehouse_id = p_warehouse_id
    and line.product_unit_id = p_product_unit_id
    and posting.reversed_by_id is null;

  if v_on_hand < 0 then
    raise exception 'Inventory stock cannot be negative for warehouse %, product unit %.', p_warehouse_id, p_product_unit_id;
  end if;
end;
$$;

create or replace function public.assert_inventory_line_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_posting record;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    select posting_type, source_type, source_id
      into v_posting
    from public.inventory_postings
    where id = new.posting_id;

    if v_posting.posting_type = 'receipt'
      and (
        (
          v_posting.source_type = 'purchase_destination'
          and exists (
            select 1
            from public.purchase_destinations destination
            where destination.id = v_posting.source_id
              and destination.destination_type = 'customer_direct'
          )
        )
        or (
          v_posting.source_type = 'purchase_order_item'
          and exists (
            select 1
            from public.purchase_destinations destination
            where destination.purchase_order_item_id = v_posting.source_id
              and destination.destination_type = 'customer_direct'
          )
          and not exists (
            select 1
            from public.purchase_destinations destination
            where destination.purchase_order_item_id = v_posting.source_id
              and destination.destination_type = 'warehouse'
          )
        )
      )
    then
      raise exception 'Supplier direct delivery cannot create warehouse receipt movement.';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_stock_nonnegative(old.warehouse_id, old.product_unit_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_stock_nonnegative(new.warehouse_id, new.product_unit_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_inventory_line_invariants on public.inventory_movement_lines;
create constraint trigger trg_inventory_line_invariants
  after insert or update or delete on public.inventory_movement_lines
  deferrable initially deferred
  for each row execute function public.assert_inventory_line_invariants();

create or replace function public.assert_purchase_destination_quantities(p_purchase_order_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ordered_quantity numeric(18, 3);
  v_allocated_quantity numeric(18, 3);
begin
  select ordered_quantity
    into v_ordered_quantity
  from public.purchase_order_items
  where id = p_purchase_order_item_id;

  if not found then
    return;
  end if;

  select coalesce(sum(quantity), 0)::numeric(18, 3)
    into v_allocated_quantity
  from public.purchase_destinations
  where purchase_order_item_id = p_purchase_order_item_id;

  if v_allocated_quantity <> v_ordered_quantity then
    raise exception 'Purchase destination quantity must equal ordered quantity for item %.', p_purchase_order_item_id;
  end if;
end;
$$;

create or replace function public.assert_purchase_destination_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_purchase_destination_quantities(old.purchase_order_item_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_purchase_destination_quantities(new.purchase_order_item_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_purchase_destination_invariants on public.purchase_destinations;
create constraint trigger trg_purchase_destination_invariants
  after insert or update or delete on public.purchase_destinations
  deferrable initially deferred
  for each row execute function public.assert_purchase_destination_invariants();

create or replace function public.assert_purchase_item_destination_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_purchase_destination_quantities(old.id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_purchase_destination_quantities(new.id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_purchase_item_destination_invariants on public.purchase_order_items;
create constraint trigger trg_purchase_item_destination_invariants
  after insert or update or delete on public.purchase_order_items
  deferrable initially deferred
  for each row execute function public.assert_purchase_item_destination_invariants();

create or replace function public.assert_customer_payment_allocation_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_payment_amount numeric(18, 2);
  v_allocated_amount numeric(18, 2);
begin
  if tg_op = 'DELETE' then
    v_payment_id := old.payment_id;
  else
    v_payment_id := new.payment_id;
  end if;

  select amount
    into v_payment_amount
  from public.customer_payments
  where id = v_payment_id
  for update;

  if not found then
    raise exception 'Customer payment allocation references a missing payment %.', v_payment_id;
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
      select ledger_entry_id, sum(amount)::numeric(18, 2) as allocated_amount
      from public.customer_payment_allocations
      group by ledger_entry_id
    ) allocation_total
    join public.customer_ledger_entries ledger on ledger.id = allocation_total.ledger_entry_id
    where allocation_total.allocated_amount > ledger.debit
  ) then
    raise exception 'Customer payment allocations cannot exceed the receivable ledger amount.';
  end if;

  return null;
end;
$$;

drop trigger if exists trg_customer_payment_allocation_invariants on public.customer_payment_allocations;
create constraint trigger trg_customer_payment_allocation_invariants
  after insert or update or delete on public.customer_payment_allocations
  deferrable initially deferred
  for each row execute function public.assert_customer_payment_allocation_invariants();

create or replace function public.assert_supplier_balance_nonnegative(p_supplier_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric(18, 2);
begin
  select coalesce(sum(credit - debit), 0)::numeric(18, 2)
    into v_balance
  from public.supplier_ledger_entries
  where supplier_id = p_supplier_id
    and reversed_by_id is null;

  if v_balance < 0 then
    raise exception 'Supplier payable balance cannot be negative for supplier %.', p_supplier_id;
  end if;
end;
$$;

create or replace function public.assert_supplier_ledger_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_supplier_balance_nonnegative(old.supplier_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_supplier_balance_nonnegative(new.supplier_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_supplier_ledger_balance_invariants on public.supplier_ledger_entries;
create constraint trigger trg_supplier_ledger_balance_invariants
  after insert or update or delete on public.supplier_ledger_entries
  deferrable initially deferred
  for each row execute function public.assert_supplier_ledger_invariants();

create or replace function public.assert_cash_account_nonnegative(p_cash_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric(18, 2);
begin
  select coalesce(sum(case when direction = 'in' then amount else -amount end), 0)::numeric(18, 2)
    into v_balance
  from public.cash_transactions
  where cash_account_id = p_cash_account_id
    and reversed_by_id is null;

  if v_balance < 0 then
    raise exception 'Cash account balance cannot be negative for account %.', p_cash_account_id;
  end if;
end;
$$;

create or replace function public.assert_cash_transaction_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_cash_account_nonnegative(old.cash_account_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_cash_account_nonnegative(new.cash_account_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_cash_transaction_balance_invariants on public.cash_transactions;
create constraint trigger trg_cash_transaction_balance_invariants
  after insert or update or delete on public.cash_transactions
  deferrable initially deferred
  for each row execute function public.assert_cash_transaction_invariants();

create or replace function public.assert_compensation_output_not_posted_twice()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.compensation_lines line
    join public.compensation_batches batch on batch.id = line.batch_id
    where batch.status = 'posted'
    group by line.work_output_id
    having count(distinct line.batch_id) > 1
  ) then
    raise exception 'A work output cannot be posted into more than one compensation batch.';
  end if;
end;
$$;

create or replace function public.assert_compensation_batch_valid(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch record;
  v_line_total numeric(18, 2);
begin
  select id, document_no, status, total_amount
    into v_batch
  from public.compensation_batches
  where id = p_batch_id;

  if not found or v_batch.status <> 'posted' then
    return;
  end if;

  select coalesce(sum(amount), 0)::numeric(18, 2)
    into v_line_total
  from public.compensation_lines
  where batch_id = p_batch_id;

  if v_line_total <> v_batch.total_amount then
    raise exception 'Posted compensation batch % must split exactly its total amount.', v_batch.document_no;
  end if;

  perform public.assert_compensation_output_not_posted_twice();
end;
$$;

create or replace function public.assert_compensation_line_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_compensation_batch_valid(old.batch_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_compensation_batch_valid(new.batch_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_compensation_line_invariants on public.compensation_lines;
create constraint trigger trg_compensation_line_invariants
  after insert or update or delete on public.compensation_lines
  deferrable initially deferred
  for each row execute function public.assert_compensation_line_invariants();

create or replace function public.assert_compensation_batch_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_compensation_batch_valid(old.id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_compensation_batch_valid(new.id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_compensation_batch_invariants on public.compensation_batches;
create constraint trigger trg_compensation_batch_invariants
  after insert or update or delete on public.compensation_batches
  deferrable initially deferred
  for each row execute function public.assert_compensation_batch_invariants();

alter table public.attachments
  add column if not exists content_sha256 text,
  add column if not exists mime_type text,
  add column if not exists byte_size bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attachments_content_sha256_format_check'
      and conrelid = 'public.attachments'::regclass
  ) then
    alter table public.attachments
      add constraint attachments_content_sha256_format_check
      check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'attachments_byte_size_positive_check'
      and conrelid = 'public.attachments'::regclass
  ) then
    alter table public.attachments
      add constraint attachments_byte_size_positive_check
      check (byte_size is null or byte_size > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'attachments_mime_type_format_check'
      and conrelid = 'public.attachments'::regclass
  ) then
    alter table public.attachments
      add constraint attachments_mime_type_format_check
      check (mime_type is null or mime_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$');
  end if;
end $$;

create unique index if not exists attachments_bucket_object_path_unique_idx
  on public.attachments (bucket, object_path);

drop trigger if exists trg_customers_bump_operations_revision on public.customers;
create trigger trg_customers_bump_operations_revision
  after insert or update or delete on public.customers
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_suppliers_bump_operations_revision on public.suppliers;
create trigger trg_suppliers_bump_operations_revision
  after insert or update or delete on public.suppliers
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_employees_bump_operations_revision on public.employees;
create trigger trg_employees_bump_operations_revision
  after insert or update or delete on public.employees
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_products_bump_operations_revision on public.products;
create trigger trg_products_bump_operations_revision
  after insert or update or delete on public.products
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_product_units_bump_operations_revision on public.product_units;
create trigger trg_product_units_bump_operations_revision
  after insert or update or delete on public.product_units
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_sales_orders_bump_operations_revision on public.sales_orders;
create trigger trg_sales_orders_bump_operations_revision
  after insert or update or delete on public.sales_orders
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_sales_order_items_bump_operations_revision on public.sales_order_items;
create trigger trg_sales_order_items_bump_operations_revision
  after insert or update or delete on public.sales_order_items
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_purchase_orders_bump_operations_revision on public.purchase_orders;
create trigger trg_purchase_orders_bump_operations_revision
  after insert or update or delete on public.purchase_orders
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_purchase_order_items_bump_operations_revision on public.purchase_order_items;
create trigger trg_purchase_order_items_bump_operations_revision
  after insert or update or delete on public.purchase_order_items
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_purchase_destinations_bump_operations_revision on public.purchase_destinations;
create trigger trg_purchase_destinations_bump_operations_revision
  after insert or update or delete on public.purchase_destinations
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_inventory_postings_bump_operations_revision on public.inventory_postings;
create trigger trg_inventory_postings_bump_operations_revision
  after insert or update or delete on public.inventory_postings
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_inventory_lines_bump_operations_revision on public.inventory_movement_lines;
create trigger trg_inventory_lines_bump_operations_revision
  after insert or update or delete on public.inventory_movement_lines
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_delivery_jobs_bump_operations_revision on public.delivery_jobs;
create trigger trg_delivery_jobs_bump_operations_revision
  after insert or update or delete on public.delivery_jobs
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_delivery_items_bump_operations_revision on public.delivery_items;
create trigger trg_delivery_items_bump_operations_revision
  after insert or update or delete on public.delivery_items
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_customer_ledger_bump_operations_revision on public.customer_ledger_entries;
create trigger trg_customer_ledger_bump_operations_revision
  after insert or update or delete on public.customer_ledger_entries
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_supplier_ledger_bump_operations_revision on public.supplier_ledger_entries;
create trigger trg_supplier_ledger_bump_operations_revision
  after insert or update or delete on public.supplier_ledger_entries
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_employee_ledger_bump_operations_revision on public.employee_ledger_entries;
create trigger trg_employee_ledger_bump_operations_revision
  after insert or update or delete on public.employee_ledger_entries
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_customer_payments_bump_operations_revision on public.customer_payments;
create trigger trg_customer_payments_bump_operations_revision
  after insert or update or delete on public.customer_payments
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_customer_payment_allocations_bump_operations_revision on public.customer_payment_allocations;
create trigger trg_customer_payment_allocations_bump_operations_revision
  after insert or update or delete on public.customer_payment_allocations
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_supplier_payments_bump_operations_revision on public.supplier_payments;
create trigger trg_supplier_payments_bump_operations_revision
  after insert or update or delete on public.supplier_payments
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_cash_transactions_bump_operations_revision on public.cash_transactions;
create trigger trg_cash_transactions_bump_operations_revision
  after insert or update or delete on public.cash_transactions
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_work_orders_bump_operations_revision on public.work_orders;
create trigger trg_work_orders_bump_operations_revision
  after insert or update or delete on public.work_orders
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_work_outputs_bump_operations_revision on public.work_outputs;
create trigger trg_work_outputs_bump_operations_revision
  after insert or update or delete on public.work_outputs
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_work_participants_bump_operations_revision on public.work_participants;
create trigger trg_work_participants_bump_operations_revision
  after insert or update or delete on public.work_participants
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_compensation_batches_bump_operations_revision on public.compensation_batches;
create trigger trg_compensation_batches_bump_operations_revision
  after insert or update or delete on public.compensation_batches
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_compensation_lines_bump_operations_revision on public.compensation_lines;
create trigger trg_compensation_lines_bump_operations_revision
  after insert or update or delete on public.compensation_lines
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_import_jobs_bump_operations_revision on public.import_jobs;
create trigger trg_import_jobs_bump_operations_revision
  after insert or update or delete on public.import_jobs
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_import_rows_bump_operations_revision on public.import_rows;
create trigger trg_import_rows_bump_operations_revision
  after insert or update or delete on public.import_rows
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_import_issues_bump_operations_revision on public.import_issues;
create trigger trg_import_issues_bump_operations_revision
  after insert or update or delete on public.import_issues
  for each statement execute function public.bump_operations_revision();

drop trigger if exists trg_attachments_bump_operations_revision on public.attachments;
create trigger trg_attachments_bump_operations_revision
  after insert or update or delete on public.attachments
  for each statement execute function public.bump_operations_revision();

comment on function public.assert_customer_payment_allocation_invariants() is
  'Prevents payment allocation overrun and mismatched customer receivable allocation.';
comment on function public.assert_inventory_line_invariants() is
  'Prevents negative stock and direct-delivery warehouse receipts.';
comment on function public.assert_compensation_batch_valid(uuid) is
  'Ensures posted compensation line totals equal the batch total and output is not posted twice.';
comment on column public.attachments.content_sha256 is
  'Lowercase hex SHA-256 checksum for uploaded evidence files.';
comment on column public.attachments.byte_size is
  'Original file size in bytes; must be positive when provided.';
comment on column public.attachments.mime_type is
  'Validated MIME type for uploaded evidence files.';
comment on table public.erp_revisions is
  'Monotonic revision table for near-realtime dashboard sync and Supabase Realtime notifications.';
comment on function public.bump_operations_revision() is
  'Bumps operations revision and emits pg_notify payload for realtime dashboard subscribers.';
