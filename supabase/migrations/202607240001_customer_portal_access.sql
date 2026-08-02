-- Customer portal: one customer identity is linked to one customer sub-ledger.
-- Customers receive read-only, row-scoped access only; all financial posting
-- continues to run through server-side application services.

alter table public.app_users
  add column if not exists customer_id uuid references public.customers(id) on delete restrict;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_users'::regclass
      and conname = 'app_users_role_check'
  ) then
    alter table public.app_users drop constraint app_users_role_check;
  end if;
  alter table public.app_users
    add constraint app_users_role_check check (
      role in (
        'owner', 'administrator', 'accountant', 'sales', 'warehouse',
        'dispatcher', 'driver', 'worker', 'supervisor', 'viewer', 'customer'
      )
    );

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_users'::regclass
      and conname = 'app_users_customer_role_check'
  ) then
    alter table public.app_users drop constraint app_users_customer_role_check;
  end if;
  alter table public.app_users
    add constraint app_users_customer_role_check check (
      (role = 'customer' and customer_id is not null)
      or (role <> 'customer' and customer_id is null)
    );
end $$;

create unique index if not exists app_users_customer_id_unique_idx
  on public.app_users (customer_id)
  where customer_id is not null;

create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select customer_id
  from public.app_users
  where user_id = (select auth.uid())
    and status = 'active'
    and role = 'customer'
  limit 1;
$$;

drop policy if exists customer_self_read_customer on public.customers;
create policy customer_self_read_customer on public.customers
  for select to authenticated
  using (id = (select public.current_customer_id()));

drop policy if exists customer_self_read_sales_orders on public.sales_orders;
create policy customer_self_read_sales_orders on public.sales_orders
  for select to authenticated
  using (customer_id = (select public.current_customer_id()));

drop policy if exists customer_self_read_sales_order_items on public.sales_order_items;
create policy customer_self_read_sales_order_items on public.sales_order_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.sales_orders sales_order
      where sales_order.id = sales_order_id
        and sales_order.customer_id = (select public.current_customer_id())
    )
  );

drop policy if exists customer_self_read_customer_ledger on public.customer_ledger_entries;
create policy customer_self_read_customer_ledger on public.customer_ledger_entries
  for select to authenticated
  using (customer_id = (select public.current_customer_id()));

drop policy if exists customer_self_read_customer_payments on public.customer_payments;
create policy customer_self_read_customer_payments on public.customer_payments
  for select to authenticated
  using (customer_id = (select public.current_customer_id()));

drop policy if exists customer_self_read_customer_payment_allocations on public.customer_payment_allocations;
create policy customer_self_read_customer_payment_allocations on public.customer_payment_allocations
  for select to authenticated
  using (
    exists (
      select 1
      from public.customer_payments payment
      where payment.id = payment_id
        and payment.customer_id = (select public.current_customer_id())
    )
  );

revoke execute on function public.current_customer_id() from public;
grant execute on function public.current_customer_id() to authenticated, service_role;

comment on function public.current_customer_id() is 'Customer portal helper: returns only the active customer linked to the current Auth user.';
comment on table public.customer_ledger_entries is 'Append-only customer sub-ledger. Customers receive read-only rows scoped to their linked customer account.';
