-- Device subscriptions and push outbox. Push payloads are operationally neutral
-- and never contain money, pricing, payment amounts, or sensitive evidence.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('web', 'expo')),
  endpoint text not null,
  key_p256dh text,
  key_auth text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, channel, endpoint)
);

create table if not exists public.push_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  audience jsonb not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  delivered_subscription_ids uuid[] not null default '{}',
  last_error text,
  created_at timestamptz not null default now(),
  last_attempt_at timestamptz
);

create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.push_notification_outbox(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  channel text not null check (channel in ('web', 'expo')),
  status text not null check (status in ('sent', 'failed', 'skipped')),
  detail text,
  attempted_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
create index if not exists push_notification_outbox_status_idx on public.push_notification_outbox(status, created_at);
create index if not exists push_notification_deliveries_outbox_idx on public.push_notification_deliveries(outbox_id, attempted_at desc);

alter table public.push_subscriptions enable row level security;
alter table public.push_notification_outbox enable row level security;
alter table public.push_notification_deliveries enable row level security;

drop policy if exists push_subscriptions_self_select on public.push_subscriptions;
create policy push_subscriptions_self_select on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_self_delete on public.push_subscriptions;
create policy push_subscriptions_self_delete on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.push_subscriptions is 'Server-managed device subscription endpoints. Browser clients never receive other users subscriptions.';
comment on table public.push_notification_outbox is 'Idempotent, server-managed notification outbox. Failed gateway delivery must not roll back business commands.';
