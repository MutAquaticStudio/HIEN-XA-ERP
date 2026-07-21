-- Security hardening for direct Supabase access.
-- The browser may only read data inside its ERP module and row scope. All
-- mutations continue to run through server application services/service_role.

create or replace function public.has_any_app_module(requested_modules text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users
    where user_id = (select auth.uid())
      and status = 'active'
      and module_ids && requested_modules
  );
$$;

create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select employee.id
  from public.employees employee
  join public.app_users app_user on app_user.user_id = employee.auth_user_id
  where employee.auth_user_id = (select auth.uid())
    and employee.status = 'active'
    and app_user.status = 'active'
  limit 1;
$$;

create or replace function public.can_read_delivery_job(requested_delivery_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users app_user
    where app_user.user_id = (select auth.uid())
      and app_user.status = 'active'
      and (
        (
          app_user.role in ('owner', 'administrator', 'sales', 'warehouse', 'dispatcher', 'supervisor')
          and 'delivery' = any(app_user.module_ids)
        )
        or exists (
          select 1
          from public.delivery_jobs delivery_job
          join public.employees employee on employee.id = delivery_job.driver_id
          where delivery_job.id = requested_delivery_job_id
            and employee.auth_user_id = (select auth.uid())
            and employee.status = 'active'
        )
        or exists (
          select 1
          from public.delivery_assignments assignment
          join public.employees employee on employee.id = assignment.employee_id
          where assignment.delivery_job_id = requested_delivery_job_id
            and employee.auth_user_id = (select auth.uid())
            and employee.status = 'active'
        )
      )
  );
$$;

create or replace function public.can_read_work_order(requested_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users app_user
    where app_user.user_id = (select auth.uid())
      and app_user.status = 'active'
      and (
        (
          app_user.role in ('owner', 'administrator', 'accountant', 'supervisor')
          and 'workforce' = any(app_user.module_ids)
        )
        or exists (
          select 1
          from public.work_participants participant
          join public.employees employee on employee.id = participant.employee_id
          where participant.work_order_id = requested_work_order_id
            and employee.auth_user_id = (select auth.uid())
            and employee.status = 'active'
        )
      )
  );
$$;

-- PostgreSQL views otherwise run with their owner privileges and can bypass
-- row-level security on the ledger tables underneath them.
alter view public.customer_balance_view set (security_invoker = true);
alter view public.supplier_balance_view set (security_invoker = true);
alter view public.stock_balance_view set (security_invoker = true);
alter view public.employee_balance_view set (security_invoker = true);
alter view public.customer_debt_reconciliation_view set (security_invoker = true);
alter view public.supplier_debt_reconciliation_view set (security_invoker = true);
alter view public.audit_integrity_view set (security_invoker = true);

-- Replace broad "all active users" policies with module and row scopes.
drop policy if exists active_users_read_customers on public.customers;
drop policy if exists active_users_read_suppliers on public.suppliers;
drop policy if exists active_users_read_employees on public.employees;
drop policy if exists active_users_read_product_categories on public.product_categories;
drop policy if exists active_users_read_catalog on public.products;
drop policy if exists active_users_read_units on public.units;
drop policy if exists active_users_read_product_units on public.product_units;
drop policy if exists active_users_read_price_rules on public.price_rules;
drop policy if exists active_users_read_work_types on public.work_types;
drop policy if exists active_users_read_work_rate_rules on public.work_rate_rules;
drop policy if exists active_users_read_warehouses on public.warehouses;
drop policy if exists active_users_read_vehicles on public.vehicles;
drop policy if exists active_users_read_sales_orders on public.sales_orders;
drop policy if exists active_users_read_sales_order_items on public.sales_order_items;
drop policy if exists active_users_read_purchase_orders on public.purchase_orders;
drop policy if exists active_users_read_purchase_order_items on public.purchase_order_items;
drop policy if exists active_users_read_purchase_destinations on public.purchase_destinations;
drop policy if exists active_users_read_delivery_jobs on public.delivery_jobs;
drop policy if exists active_users_read_delivery_items on public.delivery_items;
drop policy if exists active_users_read_delivery_assignments on public.delivery_assignments;
drop policy if exists active_users_read_inventory_postings on public.inventory_postings;
drop policy if exists active_users_read_inventory_lines on public.inventory_movement_lines;
drop policy if exists active_users_read_inventory_cost_states on public.inventory_cost_states;
drop policy if exists active_users_read_work_orders on public.work_orders;
drop policy if exists active_users_read_work_outputs on public.work_outputs;
drop policy if exists active_users_read_work_participants on public.work_participants;
drop policy if exists active_users_read_import_issues on public.import_issues;
drop policy if exists active_users_read_import_jobs on public.import_jobs;
drop policy if exists active_users_read_import_rows on public.import_rows;
drop policy if exists active_users_read_attachments on public.attachments;

create policy scoped_roles_read_customers on public.customers
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales', 'viewer')
    and (select public.has_any_app_module(array['masterData', 'sales', 'receivables', 'reporting']))
  );

create policy scoped_roles_read_suppliers on public.suppliers
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'warehouse', 'dispatcher')
    and (select public.has_any_app_module(array['masterData', 'procurement', 'payables', 'reporting']))
  );

create policy scoped_roles_or_self_read_employees on public.employees
  for select to authenticated
  using (
    id = (select public.current_employee_id())
    or (
      (select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'supervisor')
      and (select public.has_any_app_module(array['masterData', 'workforce', 'reporting']))
    )
  );

create policy module_users_read_product_categories on public.product_categories
  for select to authenticated
  using ((select public.has_any_app_module(array['masterData', 'sales', 'procurement', 'delivery', 'inventory', 'workforce', 'reporting'])));
create policy module_users_read_products on public.products
  for select to authenticated
  using ((select public.has_any_app_module(array['masterData', 'sales', 'procurement', 'delivery', 'inventory', 'workforce', 'reporting'])));
create policy module_users_read_units on public.units
  for select to authenticated
  using ((select public.has_any_app_module(array['masterData', 'sales', 'procurement', 'delivery', 'inventory', 'workforce', 'reporting'])));
create policy module_users_read_product_units on public.product_units
  for select to authenticated
  using ((select public.has_any_app_module(array['masterData', 'sales', 'procurement', 'delivery', 'inventory', 'workforce', 'reporting'])));

create policy pricing_roles_read_price_rules on public.price_rules
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales', 'viewer')
    and (select public.has_any_app_module(array['masterData', 'sales', 'reporting']))
  );

create policy workforce_users_read_work_types on public.work_types
  for select to authenticated
  using ((select public.has_any_app_module(array['masterData', 'workforce', 'reporting'])));
create policy compensation_roles_read_work_rates on public.work_rate_rules
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'supervisor')
    and (select public.has_any_app_module(array['workforce', 'reporting']))
  );

create policy operations_users_read_warehouses on public.warehouses
  for select to authenticated
  using ((select public.has_any_app_module(array['masterData', 'procurement', 'delivery', 'inventory', 'reporting'])));
create policy delivery_users_read_vehicles on public.vehicles
  for select to authenticated
  using ((select public.has_any_app_module(array['masterData', 'delivery', 'reporting'])));

create policy sales_roles_read_orders on public.sales_orders
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales', 'viewer')
    and (select public.has_any_app_module(array['sales', 'receivables', 'reporting']))
  );
create policy sales_roles_read_order_items on public.sales_order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.sales_orders sales_order
      where sales_order.id = sales_order_id
    )
  );

create policy procurement_roles_read_orders on public.purchase_orders
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'warehouse', 'dispatcher')
    and (select public.has_any_app_module(array['procurement', 'payables', 'reporting']))
  );
create policy procurement_roles_read_order_items on public.purchase_order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.purchase_orders purchase_order
      where purchase_order.id = purchase_order_id
    )
  );
create policy procurement_roles_read_destinations on public.purchase_destinations
  for select to authenticated
  using (
    exists (
      select 1
      from public.purchase_order_items item
      join public.purchase_orders purchase_order on purchase_order.id = item.purchase_order_id
      where item.id = purchase_order_item_id
    )
  );

create policy assigned_or_delivery_roles_read_jobs on public.delivery_jobs
  for select to authenticated
  using ((select public.can_read_delivery_job(id)));
create policy assigned_or_delivery_roles_read_items on public.delivery_items
  for select to authenticated
  using ((select public.can_read_delivery_job(delivery_job_id)));
create policy assigned_or_delivery_roles_read_assignments on public.delivery_assignments
  for select to authenticated
  using ((select public.can_read_delivery_job(delivery_job_id)));

create policy inventory_roles_read_postings on public.inventory_postings
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'warehouse')
    and (select public.has_any_app_module(array['inventory', 'reporting']))
  );
create policy inventory_roles_read_movement_lines on public.inventory_movement_lines
  for select to authenticated
  using (
    exists (
      select 1 from public.inventory_postings posting
      where posting.id = posting_id
    )
  );
create policy inventory_roles_read_cost_states on public.inventory_cost_states
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'warehouse')
    and (select public.has_any_app_module(array['inventory', 'reporting']))
  );

create policy assigned_or_workforce_roles_read_orders on public.work_orders
  for select to authenticated
  using ((select public.can_read_work_order(id)));
create policy assigned_or_workforce_roles_read_outputs on public.work_outputs
  for select to authenticated
  using ((select public.can_read_work_order(work_order_id)));
create policy assigned_or_workforce_roles_read_participants on public.work_participants
  for select to authenticated
  using ((select public.can_read_work_order(work_order_id)));

create policy import_roles_read_jobs on public.import_jobs
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant')
    and (select public.has_any_app_module(array['import']))
  );
create policy import_roles_read_rows on public.import_rows
  for select to authenticated
  using (
    exists (select 1 from public.import_jobs import_job where import_job.id = import_job_id)
  );
create policy import_roles_read_issues on public.import_issues
  for select to authenticated
  using (
    exists (
      select 1
      from public.import_rows import_row
      join public.import_jobs import_job on import_job.id = import_row.import_job_id
      where import_row.id = import_row_id
    )
  );

create policy privileged_roles_read_attachments on public.attachments
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant')
    and (select public.has_any_app_module(array['audit', 'import', 'reporting']))
  );

-- Finance policies also honor module scopes. Self-service employee rows remain
-- visible only to the employee linked to the current Auth user.
drop policy if exists finance_roles_read_customer_ledger on public.customer_ledger_entries;
drop policy if exists finance_roles_read_supplier_ledger on public.supplier_ledger_entries;
drop policy if exists finance_roles_read_cash on public.cash_transactions;
drop policy if exists finance_roles_read_cash_accounts on public.cash_accounts;
drop policy if exists finance_roles_read_customer_payments on public.customer_payments;
drop policy if exists finance_roles_read_customer_payment_allocations on public.customer_payment_allocations;
drop policy if exists finance_roles_read_supplier_payments on public.supplier_payments;
drop policy if exists finance_roles_read_supplier_payment_allocations on public.supplier_payment_allocations;
drop policy if exists finance_roles_read_compensation_batches on public.compensation_batches;
drop policy if exists finance_roles_read_compensation_lines on public.compensation_lines;
drop policy if exists worker_or_finance_read_employee_ledger on public.employee_ledger_entries;
drop policy if exists owners_read_audit_logs on public.audit_logs;
drop policy if exists active_users_read_cash_vouchers on public.cash_vouchers;
drop policy if exists active_users_read_employee_payments on public.employee_payments;
drop policy if exists active_users_read_employee_advances on public.employee_advances;

create policy scoped_finance_read_customer_ledger on public.customer_ledger_entries
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales')
    and (select public.has_any_app_module(array['receivables', 'reporting']))
  );
create policy scoped_finance_read_supplier_ledger on public.supplier_ledger_entries
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant')
    and (select public.has_any_app_module(array['payables', 'reporting']))
  );
create policy scoped_finance_read_cash_transactions on public.cash_transactions
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant')
    and (select public.has_any_app_module(array['cash', 'reporting']))
  );
create policy scoped_finance_read_cash_accounts on public.cash_accounts
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant')
    and (select public.has_any_app_module(array['cash', 'receivables', 'payables', 'reporting']))
  );
create policy scoped_finance_read_customer_payments on public.customer_payments
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'sales')
    and (select public.has_any_app_module(array['receivables', 'cash', 'reporting']))
  );
create policy scoped_finance_read_customer_allocations on public.customer_payment_allocations
  for select to authenticated
  using (
    exists (select 1 from public.customer_payments payment where payment.id = payment_id)
  );
create policy scoped_finance_read_supplier_payments on public.supplier_payments
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant')
    and (select public.has_any_app_module(array['payables', 'cash', 'reporting']))
  );
create policy scoped_finance_read_supplier_allocations on public.supplier_payment_allocations
  for select to authenticated
  using (
    exists (select 1 from public.supplier_payments payment where payment.id = payment_id)
  );
create policy scoped_finance_read_compensation_batches on public.compensation_batches
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant', 'supervisor')
    and (select public.has_any_app_module(array['workforce', 'reporting']))
  );
create policy scoped_finance_read_compensation_lines on public.compensation_lines
  for select to authenticated
  using (
    exists (select 1 from public.compensation_batches batch where batch.id = batch_id)
  );
create policy scoped_finance_or_self_read_employee_ledger on public.employee_ledger_entries
  for select to authenticated
  using (
    employee_id = (select public.current_employee_id())
    or (
      (select public.current_app_role()) in ('owner', 'administrator', 'accountant')
      and (select public.has_any_app_module(array['workforce', 'reporting']))
    )
  );
create policy scoped_identity_admins_read_audit on public.audit_logs
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator')
    and (select public.has_any_app_module(array['audit']))
  );
create policy scoped_finance_read_cash_vouchers on public.cash_vouchers
  for select to authenticated
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant')
    and (select public.has_any_app_module(array['cash', 'reporting']))
  );
create policy scoped_finance_or_self_read_employee_payments on public.employee_payments
  for select to authenticated
  using (
    employee_id = (select public.current_employee_id())
    or (
      (select public.current_app_role()) in ('owner', 'administrator', 'accountant')
      and (select public.has_any_app_module(array['cash', 'workforce', 'reporting']))
    )
  );
create policy scoped_finance_or_self_read_employee_advances on public.employee_advances
  for select to authenticated
  using (
    employee_id = (select public.current_employee_id())
    or (
      (select public.current_app_role()) in ('owner', 'administrator', 'accountant')
      and (select public.has_any_app_module(array['cash', 'workforce', 'reporting']))
    )
  );

-- Trigger and invariant functions must not become public RPC endpoints.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_active_app_user() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_identity_admin() to authenticated;
grant execute on function public.has_any_app_module(text[]) to authenticated;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.can_read_delivery_job(uuid) to authenticated;
grant execute on function public.can_read_work_order(uuid) to authenticated;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to service_role;

comment on function public.has_any_app_module(text[]) is 'Authorization helper: active user has at least one requested ERP module.';
comment on function public.can_read_delivery_job(uuid) is 'Authorization helper: privileged delivery role or employee assigned to this delivery only.';
comment on function public.can_read_work_order(uuid) is 'Authorization helper: privileged workforce role or employee participating in this work order only.';
comment on table public.attachments is 'Direct browser reads are limited to privileged audit/import/reporting roles. Operational users receive short-lived signed URLs from the server.';
