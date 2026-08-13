-- Partner messaging: supplier access and an append-only, server-managed inbox.

alter table public.app_users
  add column if not exists supplier_id uuid references public.suppliers(id) on delete restrict;

do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.app_users'::regclass and conname = 'app_users_role_check') then
    alter table public.app_users drop constraint app_users_role_check;
  end if;
  alter table public.app_users add constraint app_users_role_check check (
    role in ('owner', 'administrator', 'accountant', 'sales', 'warehouse', 'dispatcher', 'driver', 'worker', 'supervisor', 'viewer', 'customer', 'supplier')
  );
  if exists (select 1 from pg_constraint where conrelid = 'public.app_users'::regclass and conname = 'app_users_customer_role_check') then
    alter table public.app_users drop constraint app_users_customer_role_check;
  end if;
  alter table public.app_users add constraint app_users_customer_role_check check (
    (role = 'customer' and customer_id is not null and supplier_id is null)
    or (role = 'supplier' and supplier_id is not null and customer_id is null)
    or (role not in ('customer', 'supplier') and customer_id is null and supplier_id is null)
  );
end $$;

create unique index if not exists app_users_supplier_id_unique_idx on public.app_users (supplier_id) where supplier_id is not null;

create or replace function public.current_supplier_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select supplier_id from public.app_users
  where user_id = (select auth.uid()) and status = 'active' and role = 'supplier'
  limit 1;
$$;

create or replace function public.can_access_partner_thread(requested_party_type text, requested_party_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_users app_user
    where app_user.user_id = (select auth.uid()) and app_user.status = 'active' and (
      app_user.role in ('owner', 'administrator', 'sales', 'accountant', 'warehouse', 'dispatcher')
      or (requested_party_type = 'customer' and app_user.role = 'customer' and app_user.customer_id = requested_party_id)
      or (requested_party_type = 'supplier' and app_user.role = 'supplier' and app_user.supplier_id = requested_party_id)
    )
  );
$$;

drop policy if exists supplier_self_read_supplier on public.suppliers;
create policy supplier_self_read_supplier on public.suppliers for select to authenticated using (id = (select public.current_supplier_id()));

create table if not exists public.partner_communication_threads (
  id uuid primary key default gen_random_uuid(),
  party_type text not null check (party_type in ('customer', 'supplier')),
  party_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (party_type, party_id)
);

create table if not exists public.partner_communication_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.partner_communication_threads(id) on delete restrict,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 2000),
  idempotency_key text not null,
  sent_at timestamptz not null default now(),
  unique (thread_id, idempotency_key)
);

create index if not exists partner_communication_messages_thread_sent_idx on public.partner_communication_messages(thread_id, sent_at);

alter table public.partner_communication_threads enable row level security;
alter table public.partner_communication_messages enable row level security;

drop policy if exists partner_threads_scoped_read on public.partner_communication_threads;
create policy partner_threads_scoped_read on public.partner_communication_threads for select to authenticated using ((select public.can_access_partner_thread(party_type, party_id)));
drop policy if exists partner_messages_scoped_read on public.partner_communication_messages;
create policy partner_messages_scoped_read on public.partner_communication_messages for select to authenticated using (exists (select 1 from public.partner_communication_threads thread where thread.id = thread_id));

revoke execute on function public.current_supplier_id() from public;
grant execute on function public.current_supplier_id() to authenticated, service_role;
grant execute on function public.can_access_partner_thread(text, uuid) to authenticated, service_role;

comment on table public.partner_communication_messages is 'Append-only partner messages. Server services validate party identity, idempotency, authorization and audit each send.';
