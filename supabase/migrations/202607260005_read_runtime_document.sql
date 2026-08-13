create or replace function public.read_erp_runtime_document(p_namespace text)
returns table(revision bigint, payload jsonb)
language sql
security definer
set search_path = public
as $$
  select document.revision, document.payload
  from public.erp_runtime_documents as document
  where document.namespace = p_namespace;
$$;

revoke all on function public.read_erp_runtime_document(text) from public;
grant execute on function public.read_erp_runtime_document(text) to service_role;
