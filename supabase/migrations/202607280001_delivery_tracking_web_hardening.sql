-- Web-first delivery tracking hardening. All writes stay server-side through
-- service-role RPCs; authenticated users retain read-only RLS access.

alter table public.delivery_tracking_sessions
  alter column public_token_hash drop not null,
  alter column share_expires_at drop not null,
  add column if not exists share_revoked_at timestamptz,
  add column if not exists retention_purge_after timestamptz not null default (now() + interval '90 days');

alter table public.delivery_tracking_points
  add column if not exists quality text not null default 'accepted',
  add column if not exists suspect_reason text;

alter table public.delivery_tracking_points drop constraint if exists delivery_tracking_points_quality_check;
alter table public.delivery_tracking_points add constraint delivery_tracking_points_quality_check check (quality in ('accepted', 'suspect'));
alter table public.delivery_tracking_points drop constraint if exists delivery_tracking_points_suspect_reason_check;
alter table public.delivery_tracking_points add constraint delivery_tracking_points_suspect_reason_check check (
  suspect_reason is null or suspect_reason in ('low_accuracy', 'impossible_speed', 'out_of_order')
);

alter table public.delivery_tracking_events drop constraint if exists delivery_tracking_events_action_check;
alter table public.delivery_tracking_events add constraint delivery_tracking_events_action_check check (
  action in ('tracking_started', 'tracking_stopped', 'tracking_share_created', 'tracking_share_revoked', 'tracking_retention_purged')
);

create index if not exists delivery_tracking_sessions_retention_idx
  on public.delivery_tracking_sessions (retention_purge_after)
  where retention_purge_after is not null;
create index if not exists delivery_tracking_points_session_quality_recorded_idx
  on public.delivery_tracking_points (session_id, quality, recorded_at desc);

create or replace function public.apply_delivery_tracking_latest_point()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quality <> 'accepted' then
    return new;
  end if;
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

create or replace function public.delivery_tracking_start_session(
  p_session_id uuid,
  p_delivery_job_id uuid,
  p_employee_id uuid,
  p_started_at timestamptz,
  p_retention_purge_after timestamptz,
  p_actor_id uuid,
  p_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  insert into public.delivery_tracking_sessions (
    id, delivery_job_id, employee_id, status, started_at, retention_purge_after, created_by
  ) values (
    p_session_id, p_delivery_job_id, p_employee_id, 'active', p_started_at, p_retention_purge_after, p_actor_id
  ) on conflict (delivery_job_id) where status = 'active' do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select id into v_session_id
    from public.delivery_tracking_sessions
    where delivery_job_id = p_delivery_job_id and status = 'active';
    return jsonb_build_object('session_id', v_session_id, 'created', false);
  end if;

  insert into public.delivery_tracking_events (session_id, actor_id, action, summary, occurred_at)
  values (v_session_id, p_actor_id, 'tracking_started', p_summary, p_started_at);
  return jsonb_build_object('session_id', v_session_id, 'created', true);
end;
$$;

create or replace function public.delivery_tracking_record_point(
  p_session_id uuid,
  p_client_point_id text,
  p_recorded_at timestamptz,
  p_received_at timestamptz,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_meters numeric,
  p_heading_degrees numeric,
  p_speed_meters_per_second numeric,
  p_quality text,
  p_suspect_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_point_id bigint;
begin
  select status into v_status
  from public.delivery_tracking_sessions
  where id = p_session_id
  for update;
  if v_status is null then
    raise exception 'Tracking session does not exist';
  end if;
  if v_status <> 'active' then
    raise exception 'Tracking session is not active';
  end if;

  insert into public.delivery_tracking_points (
    session_id, client_point_id, recorded_at, received_at, latitude, longitude,
    accuracy_meters, heading_degrees, speed_meters_per_second, quality, suspect_reason
  ) values (
    p_session_id, p_client_point_id, p_recorded_at, p_received_at, p_latitude, p_longitude,
    p_accuracy_meters, p_heading_degrees, p_speed_meters_per_second, p_quality, p_suspect_reason
  ) on conflict (session_id, client_point_id) do nothing
  returning id into v_point_id;

  return jsonb_build_object('duplicate', v_point_id is null);
end;
$$;

create or replace function public.delivery_tracking_stop_session(
  p_session_id uuid,
  p_stopped_at timestamptz,
  p_retention_purge_after timestamptz,
  p_actor_id uuid,
  p_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_had_share boolean;
begin
  select public_token_hash is not null and share_revoked_at is null into v_had_share
  from public.delivery_tracking_sessions
  where id = p_session_id and status = 'active'
  for update;
  if not found then
    raise exception 'Tracking session is not active';
  end if;
  update public.delivery_tracking_sessions
  set status = 'stopped', stopped_at = p_stopped_at, share_revoked_at = coalesce(share_revoked_at, p_stopped_at),
      share_expires_at = case when public_token_hash is null then share_expires_at else p_stopped_at end,
      retention_purge_after = p_retention_purge_after, updated_at = now()
  where id = p_session_id;
  if v_had_share then
    insert into public.delivery_tracking_events (session_id, actor_id, action, summary, occurred_at)
    values (p_session_id, p_actor_id, 'tracking_share_revoked', 'Customer tracking link revoked because the tracking session stopped.', p_stopped_at);
  end if;
  insert into public.delivery_tracking_events (session_id, actor_id, action, summary, occurred_at)
  values (p_session_id, p_actor_id, 'tracking_stopped', p_summary, p_stopped_at);
  return jsonb_build_object('session_id', p_session_id);
end;
$$;

create or replace function public.delivery_tracking_create_share(
  p_session_id uuid,
  p_public_token_hash text,
  p_share_expires_at timestamptz,
  p_actor_id uuid,
  p_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.delivery_tracking_sessions
  set public_token_hash = p_public_token_hash, share_expires_at = p_share_expires_at,
      share_revoked_at = null, updated_at = now()
  where id = p_session_id and status = 'active';
  if not found then
    raise exception 'Tracking session is not active';
  end if;
  insert into public.delivery_tracking_events (session_id, actor_id, action, summary)
  values (p_session_id, p_actor_id, 'tracking_share_created', p_summary);
  return jsonb_build_object('session_id', p_session_id);
end;
$$;

create or replace function public.delivery_tracking_revoke_share(
  p_session_id uuid,
  p_revoked_at timestamptz,
  p_actor_id uuid,
  p_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.delivery_tracking_sessions
  set share_revoked_at = coalesce(share_revoked_at, p_revoked_at), updated_at = now()
  where id = p_session_id;
  if not found then
    raise exception 'Tracking session does not exist';
  end if;
  insert into public.delivery_tracking_events (session_id, actor_id, action, summary, occurred_at)
  values (p_session_id, p_actor_id, 'tracking_share_revoked', p_summary, p_revoked_at);
  return jsonb_build_object('session_id', p_session_id);
end;
$$;

create or replace function public.delivery_tracking_purge_retention(
  p_now timestamptz,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_shares integer;
  v_purged_sessions integer;
  v_purged_points integer;
  v_session_id uuid;
begin
  select count(*) into v_expired_shares
  from public.delivery_tracking_sessions
  where share_expires_at <= p_now and share_revoked_at is null;
  select count(distinct session.id), count(point.id)
  into v_purged_sessions, v_purged_points
  from public.delivery_tracking_sessions session
  join public.delivery_tracking_points point on point.session_id = session.id
  where session.retention_purge_after <= p_now;

  if not p_dry_run then
    for v_session_id in
      update public.delivery_tracking_sessions
      set share_revoked_at = p_now, updated_at = now()
      where share_expires_at <= p_now and share_revoked_at is null
      returning id
    loop
      insert into public.delivery_tracking_events (session_id, action, summary, occurred_at)
      values (v_session_id, 'tracking_share_revoked', 'Customer tracking link expired automatically.', p_now);
    end loop;

    for v_session_id in
      select distinct session.id
      from public.delivery_tracking_sessions session
      join public.delivery_tracking_points point on point.session_id = session.id
      where session.retention_purge_after <= p_now
    loop
      delete from public.delivery_tracking_points where session_id = v_session_id;
      update public.delivery_tracking_sessions
      set latest_latitude = null, latest_longitude = null, latest_accuracy_meters = null, latest_recorded_at = null, updated_at = now()
      where id = v_session_id;
      insert into public.delivery_tracking_events (session_id, action, summary, occurred_at)
      values (v_session_id, 'tracking_retention_purged', 'GPS coordinates purged after the 90-day retention period.', p_now);
    end loop;
  end if;

  return jsonb_build_object(
    'expired_shares', coalesce(v_expired_shares, 0),
    'purged_sessions', coalesce(v_purged_sessions, 0),
    'purged_points', coalesce(v_purged_points, 0),
    'dry_run', p_dry_run
  );
end;
$$;

drop policy if exists assigned_or_delivery_roles_read_tracking_sessions on public.delivery_tracking_sessions;
drop policy if exists assigned_or_delivery_roles_read_tracking_points on public.delivery_tracking_points;
drop policy if exists assigned_or_delivery_roles_read_tracking_events on public.delivery_tracking_events;
create policy assigned_or_delivery_roles_read_tracking_sessions on public.delivery_tracking_sessions
  for select to authenticated using ((select erp_private.can_read_delivery_job(delivery_job_id)));
create policy assigned_or_delivery_roles_read_tracking_points on public.delivery_tracking_points
  for select to authenticated using (
    exists (select 1 from public.delivery_tracking_sessions session where session.id = session_id and (select erp_private.can_read_delivery_job(session.delivery_job_id)))
  );
create policy assigned_or_delivery_roles_read_tracking_events on public.delivery_tracking_events
  for select to authenticated using (
    exists (select 1 from public.delivery_tracking_sessions session where session.id = session_id and (select erp_private.can_read_delivery_job(session.delivery_job_id)))
  );

revoke all on function public.delivery_tracking_start_session(uuid, uuid, uuid, timestamptz, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.delivery_tracking_record_point(uuid, text, timestamptz, timestamptz, numeric, numeric, numeric, numeric, numeric, text, text) from public, anon, authenticated;
revoke all on function public.delivery_tracking_stop_session(uuid, timestamptz, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.delivery_tracking_create_share(uuid, text, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.delivery_tracking_revoke_share(uuid, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.delivery_tracking_purge_retention(timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.delivery_tracking_start_session(uuid, uuid, uuid, timestamptz, timestamptz, uuid, text) to service_role;
grant execute on function public.delivery_tracking_record_point(uuid, text, timestamptz, timestamptz, numeric, numeric, numeric, numeric, numeric, text, text) to service_role;
grant execute on function public.delivery_tracking_stop_session(uuid, timestamptz, timestamptz, uuid, text) to service_role;
grant execute on function public.delivery_tracking_create_share(uuid, text, timestamptz, uuid, text) to service_role;
grant execute on function public.delivery_tracking_revoke_share(uuid, timestamptz, uuid, text) to service_role;
grant execute on function public.delivery_tracking_purge_retention(timestamptz, boolean) to service_role;
