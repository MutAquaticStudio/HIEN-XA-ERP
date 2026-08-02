-- Control plane for a one-way migration from server-only runtime documents to
-- normalized PostgreSQL aggregates. It never copies business rows by itself.
-- A run may become production_active only after an external reconciliation has
-- been recorded, and runtime writes then fail closed.

create table if not exists public.erp_cutover_runs (
  id uuid primary key default gen_random_uuid(),
  source_namespace text not null default 'operations',
  source_revision bigint not null check (source_revision >= 0),
  source_checksum text not null check (source_checksum ~ '^[a-f0-9]{64}$'),
  state_schema_version integer not null check (state_schema_version > 0),
  status text not null default 'planned' check (
    status in (
      'planned',
      'snapshot_verified',
      'rehearsal_running',
      'rehearsal_failed',
      'rehearsal_passed',
      'maintenance_started',
      'production_active',
      'rolled_back',
      'cancelled'
    )
  ),
  expected_totals jsonb not null default '{}'::jsonb,
  actual_totals jsonb,
  reconciliation jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(user_id),
  verified_at timestamptz,
  verified_by uuid references public.app_users(user_id),
  activated_at timestamptz,
  activated_by uuid references public.app_users(user_id),
  unique (source_namespace, source_revision, source_checksum)
);

create table if not exists public.erp_cutover_checkpoints (
  id uuid primary key default gen_random_uuid(),
  cutover_run_id uuid not null references public.erp_cutover_runs(id) on delete restrict,
  checkpoint text not null check (
    checkpoint in (
      'backup_verified',
      'source_snapshot_verified',
      'target_schema_verified',
      'staging_load_completed',
      'reconciliation_completed',
      'maintenance_window_opened',
      'traffic_switched',
      'rollback_verified'
    )
  ),
  status text not null check (status in ('passed', 'failed')),
  evidence jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.app_users(user_id),
  unique (cutover_run_id, checkpoint)
);

create table if not exists public.erp_legacy_id_map (
  source_namespace text not null,
  entity_type text not null,
  legacy_id text not null check (length(btrim(legacy_id)) > 0),
  target_table text not null,
  target_id uuid not null,
  cutover_run_id uuid not null references public.erp_cutover_runs(id) on delete restrict,
  source_checksum text not null check (source_checksum ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (source_namespace, entity_type, legacy_id),
  unique (target_table, target_id)
);

create index if not exists erp_cutover_runs_status_idx
  on public.erp_cutover_runs(status, created_at desc);
create index if not exists erp_cutover_checkpoints_run_idx
  on public.erp_cutover_checkpoints(cutover_run_id, recorded_at);
create index if not exists erp_legacy_id_map_run_idx
  on public.erp_legacy_id_map(cutover_run_id, entity_type);
create unique index if not exists erp_cutover_single_active_idx
  on public.erp_cutover_runs((status))
  where status = 'production_active';

create or replace function public.assert_cutover_run_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'production_active' and new.status <> old.status then
    raise exception 'A production cutover run is immutable. Use the rollback runbook instead.';
  end if;

  if new.status = 'production_active' and old.status <> 'maintenance_started' then
    raise exception 'Production cutover can be activated only from maintenance_started.';
  end if;

  if new.status = 'production_active' then
    if new.actual_totals is null or coalesce((new.reconciliation ->> 'matches')::boolean, false) is not true then
      raise exception 'Production cutover requires a successful reconciliation.';
    end if;
    if exists (
      select 1
      from public.erp_cutover_checkpoints checkpoint
      where checkpoint.cutover_run_id = new.id
        and checkpoint.status = 'failed'
    ) then
      raise exception 'Production cutover cannot continue with a failed checkpoint.';
    end if;
    if (
      select count(*)
      from public.erp_cutover_checkpoints checkpoint
      where checkpoint.cutover_run_id = new.id
        and checkpoint.status = 'passed'
        and checkpoint.checkpoint in (
          'backup_verified',
          'source_snapshot_verified',
          'target_schema_verified',
          'staging_load_completed',
          'reconciliation_completed',
          'maintenance_window_opened'
        )
    ) <> 6 then
      raise exception 'Production cutover requires all mandatory passed checkpoints.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists erp_cutover_run_transition_guard on public.erp_cutover_runs;
create trigger erp_cutover_run_transition_guard
  before update of status on public.erp_cutover_runs
  for each row execute function public.assert_cutover_run_transition();

create or replace function public.assert_runtime_document_write_allowed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.erp_cutover_runs
    where status = 'production_active'
  ) then
    raise exception 'Runtime document writes are disabled after normalized PostgreSQL cutover.';
  end if;
  return new;
end;
$$;

drop trigger if exists erp_runtime_document_cutover_guard on public.erp_runtime_documents;
create trigger erp_runtime_document_cutover_guard
  before insert or update or delete on public.erp_runtime_documents
  for each row execute function public.assert_runtime_document_write_allowed();

alter table public.erp_cutover_runs enable row level security;
alter table public.erp_cutover_checkpoints enable row level security;
alter table public.erp_legacy_id_map enable row level security;
revoke all on table public.erp_cutover_runs from public, anon, authenticated;
revoke all on table public.erp_cutover_checkpoints from public, anon, authenticated;
revoke all on table public.erp_legacy_id_map from public, anon, authenticated;
revoke all on function public.assert_cutover_run_transition() from public, anon, authenticated;
revoke all on function public.assert_runtime_document_write_allowed() from public, anon, authenticated;
grant execute on function public.assert_cutover_run_transition() to service_role;
grant execute on function public.assert_runtime_document_write_allowed() to service_role;

comment on table public.erp_cutover_runs is 'Server-only cutover control plane. A production_active run disables runtime document writes.';
comment on table public.erp_cutover_checkpoints is 'Immutable operational evidence for backup, rehearsal, reconciliation and traffic-switch gates.';
comment on table public.erp_legacy_id_map is 'Stable provenance mapping from runtime string ids to normalized PostgreSQL UUID ids.';
