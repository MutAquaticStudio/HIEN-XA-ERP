-- Versioned native GPS consent is durable, server-side and separate from raw GPS points.
-- Only the service-role RPCs may mutate consent or its audit trail.

create table if not exists public.delivery_tracking_consents (
  id uuid primary key,
  delivery_job_id uuid not null references public.delivery_jobs(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  policy_version text not null check (char_length(policy_version) between 3 and 64),
  status text not null default 'granted' check (status in ('granted', 'revoked')),
  granted_at timestamptz not null,
  granted_by uuid not null references public.app_users(user_id),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{8,160}$'),
  version integer not null default 1 check (version > 0),
  revoked_at timestamptz,
  revoked_by uuid references public.app_users(user_id),
  revocation_idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'granted' and revoked_at is null and revoked_by is null) or (status = 'revoked' and revoked_at is not null and revoked_by is not null))
);

create unique index if not exists delivery_tracking_consents_employee_idempotency_idx
  on public.delivery_tracking_consents (employee_id, idempotency_key);
create unique index if not exists delivery_tracking_consents_one_active_policy_idx
  on public.delivery_tracking_consents (delivery_job_id, employee_id, policy_version)
  where status = 'granted';
create unique index if not exists delivery_tracking_consents_employee_revoke_idempotency_idx
  on public.delivery_tracking_consents (employee_id, revocation_idempotency_key)
  where revocation_idempotency_key is not null;
create index if not exists delivery_tracking_consents_job_employee_idx
  on public.delivery_tracking_consents (delivery_job_id, employee_id, granted_at desc);

alter table public.delivery_tracking_events
  add column if not exists delivery_job_id uuid references public.delivery_jobs(id) on delete cascade;
update public.delivery_tracking_events event
set delivery_job_id = session.delivery_job_id
from public.delivery_tracking_sessions session
where event.session_id = session.id and event.delivery_job_id is null;
alter table public.delivery_tracking_events alter column session_id drop not null;
alter table public.delivery_tracking_events drop constraint if exists delivery_tracking_events_action_check;
alter table public.delivery_tracking_events add constraint delivery_tracking_events_action_check check (
  action in ('tracking_consent_granted', 'tracking_consent_revoked', 'tracking_started', 'tracking_stopped', 'tracking_share_created', 'tracking_share_revoked', 'tracking_retention_purged')
);
alter table public.delivery_tracking_events drop constraint if exists delivery_tracking_events_reference_check;
alter table public.delivery_tracking_events add constraint delivery_tracking_events_reference_check check (session_id is not null or delivery_job_id is not null);
create index if not exists delivery_tracking_events_job_occurred_idx
  on public.delivery_tracking_events (delivery_job_id, occurred_at desc);

alter table public.delivery_tracking_consents enable row level security;
drop policy if exists assigned_or_delivery_roles_read_tracking_consents on public.delivery_tracking_consents;
create policy assigned_or_delivery_roles_read_tracking_consents on public.delivery_tracking_consents
  for select to authenticated using ((select erp_private.can_read_delivery_job(delivery_job_id)));

drop policy if exists assigned_or_delivery_roles_read_tracking_events on public.delivery_tracking_events;
create policy assigned_or_delivery_roles_read_tracking_events on public.delivery_tracking_events
  for select to authenticated using (
    (delivery_job_id is not null and (select erp_private.can_read_delivery_job(delivery_job_id)))
    or exists (
      select 1 from public.delivery_tracking_sessions session
      where session.id = session_id and (select erp_private.can_read_delivery_job(session.delivery_job_id))
    )
  );

create or replace function public.delivery_tracking_grant_consent(
  p_consent_id uuid,
  p_delivery_job_id uuid,
  p_employee_id uuid,
  p_policy_version text,
  p_idempotency_key text,
  p_actor_id uuid,
  p_granted_at timestamptz,
  p_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.delivery_tracking_consents%rowtype;
begin
  select * into v_existing from public.delivery_tracking_consents
  where employee_id = p_employee_id and idempotency_key = p_idempotency_key limit 1;
  if found then
    return jsonb_build_object('consent_id', v_existing.id, 'created', false,
      'idempotency_conflict', v_existing.delivery_job_id <> p_delivery_job_id or v_existing.policy_version <> p_policy_version);
  end if;

  select * into v_existing from public.delivery_tracking_consents
  where delivery_job_id = p_delivery_job_id and employee_id = p_employee_id
    and policy_version = p_policy_version and status = 'granted' limit 1;
  if found then return jsonb_build_object('consent_id', v_existing.id, 'created', false, 'idempotency_conflict', false); end if;

  insert into public.delivery_tracking_consents (
    id, delivery_job_id, employee_id, policy_version, status, granted_at, granted_by, idempotency_key, version
  ) values (
    p_consent_id, p_delivery_job_id, p_employee_id, p_policy_version, 'granted', p_granted_at, p_actor_id, p_idempotency_key, 1
  );
  insert into public.delivery_tracking_events (session_id, delivery_job_id, actor_id, action, summary, occurred_at)
  values (null, p_delivery_job_id, p_actor_id, 'tracking_consent_granted', p_summary, p_granted_at);
  return jsonb_build_object('consent_id', p_consent_id, 'created', true, 'idempotency_conflict', false);
end;
$$;

create or replace function public.delivery_tracking_revoke_consent(
  p_consent_id uuid,
  p_employee_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_actor_id uuid,
  p_revoked_at timestamptz,
  p_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consent public.delivery_tracking_consents%rowtype;
begin
  select * into v_consent from public.delivery_tracking_consents where id = p_consent_id for update;
  if not found then return jsonb_build_object('missing', true); end if;
  if v_consent.employee_id <> p_employee_id then return jsonb_build_object('forbidden', true); end if;
  if v_consent.revocation_idempotency_key = p_idempotency_key or v_consent.status = 'revoked' then return jsonb_build_object('replayed', true); end if;
  if v_consent.version <> p_expected_version then return jsonb_build_object('conflict', true); end if;

  update public.delivery_tracking_consents
  set status = 'revoked', revoked_at = p_revoked_at, revoked_by = p_actor_id,
      revocation_idempotency_key = p_idempotency_key, version = version + 1, updated_at = now()
  where id = p_consent_id;
  insert into public.delivery_tracking_events (session_id, delivery_job_id, actor_id, action, summary, occurred_at)
  values (null, v_consent.delivery_job_id, p_actor_id, 'tracking_consent_revoked', p_summary, p_revoked_at);
  return jsonb_build_object('updated', true);
end;
$$;

revoke all on table public.delivery_tracking_consents from public, anon;
grant select on public.delivery_tracking_consents to authenticated;
grant all on public.delivery_tracking_consents to service_role;
revoke all on function public.delivery_tracking_grant_consent(uuid, uuid, uuid, text, text, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.delivery_tracking_revoke_consent(uuid, uuid, integer, text, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.delivery_tracking_grant_consent(uuid, uuid, uuid, text, text, uuid, timestamptz, text) to service_role;
grant execute on function public.delivery_tracking_revoke_consent(uuid, uuid, integer, text, uuid, timestamptz, text) to service_role;
