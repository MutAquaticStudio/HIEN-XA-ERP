-- Invite-only identity administration for the production Supabase target.
-- Authentication credentials remain owned by Supabase Auth; this migration
-- owns ERP roles, module scopes, invitation metadata and immutable audit data.

alter table public.app_users
  add column if not exists email text,
  add column if not exists module_ids text[] not null default array['overview']::text[],
  add column if not exists session_version integer not null default 1,
  add column if not exists last_login_at timestamptz,
  add column if not exists invited_by uuid references public.app_users(user_id),
  add column if not exists invited_at timestamptz,
  add column if not exists accepted_at timestamptz;

update public.app_users app_user
set email = lower(auth_user.email)
from auth.users auth_user
where auth_user.id = app_user.user_id
  and app_user.email is null;

update public.app_users
set status = 'disabled'
where status = 'inactive';

alter table public.app_users
  drop constraint if exists app_users_status_check;

alter table public.app_users
  add constraint app_users_status_check
  check (status in ('invited', 'active', 'disabled')),
  add constraint app_users_session_version_check
  check (session_version > 0),
  add constraint app_users_module_ids_check
  check (
    'overview' = any(module_ids)
    and module_ids <@ array[
      'overview',
      'masterData',
      'sales',
      'procurement',
      'delivery',
      'inventory',
      'receivables',
      'payables',
      'cash',
      'workforce',
      'import',
      'audit',
      'reporting'
    ]::text[]
  );

create unique index if not exists app_users_email_unique_idx
  on public.app_users (lower(email))
  where email is not null;

create table public.app_user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
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
  module_ids text[] not null,
  invited_user_id uuid references public.app_users(user_id),
  invited_by uuid not null references public.app_users(user_id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint app_user_invitations_module_ids_check check ('overview' = any(module_ids))
);

create index app_user_invitations_email_idx
  on public.app_user_invitations (lower(email), created_at desc);

create index app_user_invitations_pending_idx
  on public.app_user_invitations (expires_at)
  where status = 'pending';

create table public.identity_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_user_id uuid references public.app_users(user_id),
  target_user_id uuid references public.app_users(user_id),
  target_email text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index identity_audit_logs_target_idx
  on public.identity_audit_logs (target_user_id, created_at desc);

create index identity_audit_logs_created_idx
  on public.identity_audit_logs (created_at desc);

drop trigger if exists trg_identity_audit_logs_append_only on public.identity_audit_logs;
create trigger trg_identity_audit_logs_append_only
  before update or delete on public.identity_audit_logs
  for each row execute function public.prevent_any_update_or_delete();

create or replace function public.is_identity_admin()
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
      and role in ('owner', 'administrator')
  );
$$;

alter table public.app_user_invitations enable row level security;
alter table public.identity_audit_logs enable row level security;

drop policy if exists app_users_admin_select on public.app_users;
create policy app_users_admin_select on public.app_users
  for select to authenticated
  using ((select public.is_identity_admin()));

create policy identity_admins_read_invitations on public.app_user_invitations
  for select to authenticated
  using ((select public.is_identity_admin()));

create policy identity_admins_read_identity_audit on public.identity_audit_logs
  for select to authenticated
  using ((select public.is_identity_admin()));

comment on table public.app_user_invitations is 'Server-owned, invite-only onboarding records. Store token hashes only; never persist raw invitation tokens.';
comment on table public.identity_audit_logs is 'Append-only audit trail for invitations, login outcomes, role/module changes and account status changes.';
comment on column public.app_users.module_ids is 'ERP module scope intersected with role permissions on the server. UI visibility is not an authorization boundary.';
comment on column public.app_users.session_version is 'Increment to invalidate every session issued before an access or status change.';
