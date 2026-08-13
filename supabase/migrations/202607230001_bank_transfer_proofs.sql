-- Private, append-only transfer evidence. Cash and sub-ledger posting remain separate commands.
create table if not exists public.bank_transfer_proofs (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  direction text not null check (direction in ('in', 'out')),
  amount numeric(18, 2) not null check (amount > 0),
  counterparty_name text not null,
  transaction_reference text not null,
  transferred_at timestamptz not null,
  related_document_no text,
  note text,
  idempotency_key text not null unique,
  archived_by uuid not null references public.app_users(user_id),
  archived_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.bank_transfer_proof_attachments (
  proof_id uuid not null references public.bank_transfer_proofs(id) on delete restrict,
  attachment_id uuid not null references public.attachments(id) on delete restrict,
  primary key (proof_id, attachment_id)
);

create index if not exists bank_transfer_proofs_transferred_at_idx on public.bank_transfer_proofs(transferred_at desc);
create index if not exists bank_transfer_proofs_related_document_no_idx on public.bank_transfer_proofs(related_document_no) where related_document_no is not null;

alter table public.bank_transfer_proofs enable row level security;
alter table public.bank_transfer_proof_attachments enable row level security;

drop policy if exists bank_transfer_proofs_finance_select on public.bank_transfer_proofs;
create policy bank_transfer_proofs_finance_select
  on public.bank_transfer_proofs
  for select
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant')
    and (select public.has_any_app_module(array['cash', 'reporting']))
  );

drop policy if exists bank_transfer_proof_attachments_finance_select on public.bank_transfer_proof_attachments;
create policy bank_transfer_proof_attachments_finance_select
  on public.bank_transfer_proof_attachments
  for select
  using (
    (select public.current_app_role()) in ('owner', 'administrator', 'accountant')
    and (select public.has_any_app_module(array['cash', 'reporting']))
  );

drop trigger if exists bank_transfer_proofs_append_only on public.bank_transfer_proofs;
create trigger bank_transfer_proofs_append_only
  before update or delete on public.bank_transfer_proofs
  for each row execute function public.prevent_any_update_or_delete();

drop trigger if exists bank_transfer_proof_attachments_append_only on public.bank_transfer_proof_attachments;
create trigger bank_transfer_proof_attachments_append_only
  before update or delete on public.bank_transfer_proof_attachments
  for each row execute function public.prevent_any_update_or_delete();

drop trigger if exists bank_transfer_proofs_bump_revision on public.bank_transfer_proofs;
create trigger bank_transfer_proofs_bump_revision
  after insert or update or delete on public.bank_transfer_proofs
  for each statement execute function public.bump_operations_revision();

drop trigger if exists bank_transfer_proof_attachments_bump_revision on public.bank_transfer_proof_attachments;
create trigger bank_transfer_proof_attachments_bump_revision
  after insert or update or delete on public.bank_transfer_proof_attachments
  for each statement execute function public.bump_operations_revision();

comment on table public.bank_transfer_proofs is 'Private append-only evidence. Financial posting requires an independently confirmed document.';
