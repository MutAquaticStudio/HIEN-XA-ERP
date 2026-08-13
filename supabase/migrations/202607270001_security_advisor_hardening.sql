-- Security hardening follow-up for Supabase Advisor findings.
-- Keep RLS helper functions out of the PostgREST-exposed public schema while
-- retaining their authenticated execution path inside row-level policies.

create schema if not exists erp_private;
revoke all on schema erp_private from public;
grant usage on schema erp_private to authenticated, service_role;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'can_access_partner_thread(text, uuid)',
    'can_read_delivery_job(uuid)',
    'can_read_work_order(uuid)',
    'current_app_role()',
    'current_customer_id()',
    'current_employee_id()',
    'current_supplier_id()',
    'has_any_app_module(text[])',
    'is_active_app_user()',
    'is_identity_admin()'
  ] loop
    if to_regprocedure('public.' || function_signature) is not null then
      execute format('alter function public.%s set schema erp_private', function_signature);
    end if;
  end loop;
end;
$$;

revoke all on all functions in schema erp_private from public, anon;
grant execute on function erp_private.can_access_partner_thread(text, uuid) to authenticated, service_role;
grant execute on function erp_private.can_read_delivery_job(uuid) to authenticated, service_role;
grant execute on function erp_private.can_read_work_order(uuid) to authenticated, service_role;
grant execute on function erp_private.current_app_role() to authenticated, service_role;
grant execute on function erp_private.current_customer_id() to authenticated, service_role;
grant execute on function erp_private.current_employee_id() to authenticated, service_role;
grant execute on function erp_private.current_supplier_id() to authenticated, service_role;
grant execute on function erp_private.has_any_app_module(text[]) to authenticated, service_role;
grant execute on function erp_private.is_active_app_user() to authenticated, service_role;
grant execute on function erp_private.is_identity_admin() to authenticated, service_role;

-- Runtime persistence RPCs are server-only. The trigger helper is not a client API.
revoke all on function public.apply_delivery_tracking_latest_point() from public, anon, authenticated;
grant execute on function public.apply_delivery_tracking_latest_point() to service_role;
revoke all on function public.commit_erp_runtime_document(text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.commit_erp_runtime_document(text, bigint, jsonb) to service_role;
revoke all on function public.read_erp_runtime_document(text) from public, anon, authenticated;
grant execute on function public.read_erp_runtime_document(text) to service_role;

-- Supabase exposes public by default. Move database extensions outside it and
-- retain only the schema usage required by authenticated database policies.
create schema if not exists extensions;
revoke all on schema extensions from public;
grant usage on schema extensions to authenticated, service_role;

do $$
begin
  if exists (
    select 1
    from pg_extension extension_entry
    join pg_namespace extension_schema on extension_schema.oid = extension_entry.extnamespace
    where extension_entry.extname = 'unaccent' and extension_schema.nspname = 'public'
  ) then
    alter extension unaccent set schema extensions;
  end if;

  if exists (
    select 1
    from pg_extension extension_entry
    join pg_namespace extension_schema on extension_schema.oid = extension_entry.extnamespace
    where extension_entry.extname = 'pg_trgm' and extension_schema.nspname = 'public'
  ) then
    alter extension pg_trgm set schema extensions;
  end if;
end;
$$;

create or replace function public.normalize_unit_definition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.code := upper(btrim(new.code));
  new.normalized_name := lower(extensions.unaccent(new.name));
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Merge permissive SELECT policies so each table has one explicit boundary.
drop policy if exists app_users_admin_select on public.app_users;
drop policy if exists app_users_self_select on public.app_users;
create policy app_users_read_own_or_admin on public.app_users
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select erp_private.is_identity_admin())
  );

drop policy if exists customer_self_read_customer_ledger on public.customer_ledger_entries;
drop policy if exists scoped_finance_read_customer_ledger on public.customer_ledger_entries;
create policy customer_ledger_read_scoped_or_owned on public.customer_ledger_entries
  for select to authenticated
  using (
    customer_id = (select erp_private.current_customer_id())
    or (
      (select erp_private.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales')
      and (select erp_private.has_any_app_module(array['receivables', 'reporting']))
    )
  );

drop policy if exists customer_self_read_customer_payment_allocations on public.customer_payment_allocations;
drop policy if exists scoped_finance_read_customer_allocations on public.customer_payment_allocations;
create policy customer_payment_allocations_read_scoped_or_owned on public.customer_payment_allocations
  for select to authenticated
  using (
    exists (
      select 1
      from public.customer_payments payment
      where payment.id = customer_payment_allocations.payment_id
        and (
          payment.customer_id = (select erp_private.current_customer_id())
          or (
            (select erp_private.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales')
            and (select erp_private.has_any_app_module(array['receivables', 'cash', 'reporting']))
          )
        )
    )
  );

drop policy if exists customer_self_read_customer_payments on public.customer_payments;
drop policy if exists scoped_finance_read_customer_payments on public.customer_payments;
create policy customer_payments_read_scoped_or_owned on public.customer_payments
  for select to authenticated
  using (
    customer_id = (select erp_private.current_customer_id())
    or (
      (select erp_private.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales')
      and (select erp_private.has_any_app_module(array['receivables', 'cash', 'reporting']))
    )
  );

drop policy if exists customer_self_read_customer on public.customers;
drop policy if exists scoped_roles_read_customers on public.customers;
create policy customers_read_scoped_or_owned on public.customers
  for select to authenticated
  using (
    id = (select erp_private.current_customer_id())
    or (
      (select erp_private.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales', 'viewer')
      and (select erp_private.has_any_app_module(array['masterData', 'sales', 'receivables', 'reporting']))
    )
  );

drop policy if exists customer_self_read_sales_order_items on public.sales_order_items;
drop policy if exists sales_roles_read_order_items on public.sales_order_items;
create policy sales_order_items_read_scoped_or_owned on public.sales_order_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.sales_orders sales_order
      where sales_order.id = sales_order_items.sales_order_id
        and (
          sales_order.customer_id = (select erp_private.current_customer_id())
          or (
            (select erp_private.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales', 'viewer')
            and (select erp_private.has_any_app_module(array['sales', 'receivables', 'reporting']))
          )
        )
    )
  );

drop policy if exists customer_self_read_sales_orders on public.sales_orders;
drop policy if exists sales_roles_read_orders on public.sales_orders;
create policy sales_orders_read_scoped_or_owned on public.sales_orders
  for select to authenticated
  using (
    customer_id = (select erp_private.current_customer_id())
    or (
      (select erp_private.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales', 'viewer')
      and (select erp_private.has_any_app_module(array['sales', 'receivables', 'reporting']))
    )
  );

drop policy if exists scoped_roles_read_suppliers on public.suppliers;
drop policy if exists supplier_self_read_supplier on public.suppliers;
create policy suppliers_read_scoped_or_owned on public.suppliers
  for select to authenticated
  using (
    id = (select erp_private.current_supplier_id())
    or (
      (select erp_private.current_app_role()) in ('owner', 'administrator', 'accountant', 'warehouse', 'dispatcher')
      and (select erp_private.has_any_app_module(array['masterData', 'procurement', 'payables', 'reporting']))
    )
  );

comment on schema erp_private is 'Internal RLS helper functions. This schema must not be added to PostgREST exposed schemas.';
comment on schema extensions is 'Database extensions kept outside the PostgREST-exposed public schema.';
