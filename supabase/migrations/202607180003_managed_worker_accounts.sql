-- Admin-managed accounts for workers who do not use email onboarding.
-- Production identity adapters resolve username to the corresponding Auth user
-- server-side; credentials remain owned by Supabase Auth.

alter table public.app_users
  add column if not exists username text,
  add column if not exists managed_by_admin boolean not null default false;

alter table public.app_users
  add constraint app_users_username_format_check
  check (
    username is null
    or username ~ '^[a-z0-9][a-z0-9._-]{2,29}$'
  );

create unique index if not exists app_users_username_unique_idx
  on public.app_users (lower(username))
  where username is not null;

comment on column public.app_users.username is 'Short login name for admin-managed accounts such as workers; unique case-insensitively.';
comment on column public.app_users.managed_by_admin is 'True when an administrator created credentials directly instead of email invitation onboarding.';
