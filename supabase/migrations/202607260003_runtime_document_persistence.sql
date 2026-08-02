-- Server-only compare-and-swap persistence for the existing domain command kernel.
-- Browser roles receive no access; the Next.js server uses the service role.
create table if not exists public.erp_runtime_documents (
  namespace text primary key,
  revision bigint not null default 0 check (revision >= 0),
  payload jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.erp_runtime_documents enable row level security;
revoke all on table public.erp_runtime_documents from anon, authenticated;

create or replace function public.commit_erp_runtime_document(
  p_namespace text,
  p_expected_revision bigint,
  p_payload jsonb
)
returns table(committed boolean, revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_revision bigint;
  inserted_count integer;
begin
  if p_namespace is null or length(trim(p_namespace)) = 0 then
    raise exception 'Runtime namespace is required';
  end if;
  if p_expected_revision < 0 then
    raise exception 'Runtime revision cannot be negative';
  end if;

  if p_expected_revision = 0 then
    insert into public.erp_runtime_documents(namespace, revision, payload)
    values (p_namespace, 1, p_payload)
    on conflict (namespace) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then
      return query select true, 1::bigint;
      return;
    end if;
  end if;

  select document.revision
  into current_revision
  from public.erp_runtime_documents document
  where document.namespace = p_namespace
  for update;

  if not found then
    return query select false, 0::bigint;
    return;
  end if;

  if current_revision <> p_expected_revision then
    return query select false, current_revision;
    return;
  end if;

  update public.erp_runtime_documents
  set revision = current_revision + 1,
      payload = p_payload,
      updated_at = timezone('utc', now())
  where namespace = p_namespace;

  return query select true, current_revision + 1;
end;
$$;

revoke all on function public.commit_erp_runtime_document(text, bigint, jsonb) from public;
grant execute on function public.commit_erp_runtime_document(text, bigint, jsonb) to service_role;

comment on table public.erp_runtime_documents is 'Server-only versioned runtime documents. Commands commit through compare-and-swap RPC; no browser access is permitted.';
