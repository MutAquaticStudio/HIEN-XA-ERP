-- Native background tracking uses the server application service for every
-- mutation. Direct clients may read only their assigned delivery sessions.

create table if not exists public.delivery_tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  delivery_job_id uuid not null references public.delivery_jobs(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  status text not null default 'active' check (status in ('active', 'stopped', 'expired')),
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  public_token_hash text not null unique,
  share_expires_at timestamptz not null,
  latest_latitude numeric(9, 6),
  latest_longitude numeric(9, 6),
  latest_accuracy_meters numeric(10, 2),
  latest_recorded_at timestamptz,
  created_by uuid references public.app_users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active' and stopped_at is null) or status <> 'active'),
  check (latest_latitude between -90 and 90),
  check (latest_longitude between -180 and 180)
);

create unique index if not exists delivery_tracking_one_active_session_per_job
  on public.delivery_tracking_sessions (delivery_job_id) where status = 'active';
create index if not exists delivery_tracking_sessions_job_updated_idx
  on public.delivery_tracking_sessions (delivery_job_id, updated_at desc);
create index if not exists delivery_tracking_sessions_share_expiry_idx
  on public.delivery_tracking_sessions (share_expires_at);

create table if not exists public.delivery_tracking_points (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.delivery_tracking_sessions(id) on delete cascade,
  client_point_id text not null,
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  accuracy_meters numeric(10, 2) check (accuracy_meters >= 0 and accuracy_meters <= 10000),
  heading_degrees numeric(6, 2) check (heading_degrees between 0 and 360),
  speed_meters_per_second numeric(10, 3) check (speed_meters_per_second >= 0 and speed_meters_per_second <= 100),
  unique (session_id, client_point_id)
);

create index if not exists delivery_tracking_points_session_recorded_idx
  on public.delivery_tracking_points (session_id, recorded_at desc);

create table if not exists public.delivery_tracking_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.delivery_tracking_sessions(id) on delete cascade,
  actor_id uuid references public.app_users(user_id),
  action text not null check (action in ('tracking_started', 'tracking_stopped', 'tracking_share_created')),
  summary text not null,
  occurred_at timestamptz not null default now()
);

create index if not exists delivery_tracking_events_session_occurred_idx
  on public.delivery_tracking_events (session_id, occurred_at desc);

create or replace function public.apply_delivery_tracking_latest_point()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.delivery_tracking_sessions
  set latest_latitude = new.latitude,
      latest_longitude = new.longitude,
      latest_accuracy_meters = new.accuracy_meters,
      latest_recorded_at = new.recorded_at,
      updated_at = now()
  where id = new.session_id;
  return new;
end;
$$;

drop trigger if exists delivery_tracking_points_apply_latest on public.delivery_tracking_points;
create trigger delivery_tracking_points_apply_latest
after insert on public.delivery_tracking_points
for each row execute function public.apply_delivery_tracking_latest_point();

alter table public.delivery_tracking_sessions enable row level security;
alter table public.delivery_tracking_points enable row level security;
alter table public.delivery_tracking_events enable row level security;

drop policy if exists assigned_or_delivery_roles_read_tracking_sessions on public.delivery_tracking_sessions;
drop policy if exists assigned_or_delivery_roles_read_tracking_points on public.delivery_tracking_points;
drop policy if exists assigned_or_delivery_roles_read_tracking_events on public.delivery_tracking_events;

create policy assigned_or_delivery_roles_read_tracking_sessions on public.delivery_tracking_sessions
  for select to authenticated
  using ((select public.can_read_delivery_job(delivery_job_id)));
create policy assigned_or_delivery_roles_read_tracking_points on public.delivery_tracking_points
  for select to authenticated
  using (
    exists (
      select 1 from public.delivery_tracking_sessions session
      where session.id = session_id
        and (select public.can_read_delivery_job(session.delivery_job_id))
    )
  );
create policy assigned_or_delivery_roles_read_tracking_events on public.delivery_tracking_events
  for select to authenticated
  using (
    exists (
      select 1 from public.delivery_tracking_sessions session
      where session.id = session_id
        and (select public.can_read_delivery_job(session.delivery_job_id))
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'delivery_tracking_sessions'
    ) then
      alter publication supabase_realtime add table public.delivery_tracking_sessions;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'delivery_tracking_points'
    ) then
      alter publication supabase_realtime add table public.delivery_tracking_points;
    end if;
  end if;
end;
$$;

grant select on public.delivery_tracking_sessions, public.delivery_tracking_points, public.delivery_tracking_events to authenticated;
grant all on public.delivery_tracking_sessions, public.delivery_tracking_points, public.delivery_tracking_events to service_role;
grant execute on function public.apply_delivery_tracking_latest_point() to service_role;

comment on table public.delivery_tracking_sessions is 'One active native GPS tracking session per delivery job; public link token is stored hashed.';
comment on table public.delivery_tracking_points is 'Append-only GPS points with client point idempotency for offline retry.';
