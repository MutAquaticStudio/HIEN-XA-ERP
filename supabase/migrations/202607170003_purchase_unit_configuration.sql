begin;

alter table public.units
  add column if not exists normalized_name text,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive')),
  add column if not exists version integer not null default 1
    check (version > 0),
  add column if not exists updated_at timestamptz not null default now();

update public.units
set normalized_name = lower(public.unaccent(btrim(name)))
where normalized_name is null or normalized_name = '';

alter table public.units
  alter column normalized_name set not null;

create unique index if not exists units_normalized_name_uidx
  on public.units (normalized_name);

create or replace function public.normalize_unit_definition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.code := upper(btrim(new.code));
  new.normalized_name := lower(public.unaccent(new.name));
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_units_normalize on public.units;
create trigger trg_units_normalize
  before insert or update on public.units
  for each row execute function public.normalize_unit_definition();

alter table public.product_units
  add column if not exists version integer not null default 1
    check (version > 0),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists product_units_one_base_uidx
  on public.product_units (product_id)
  where is_base and status = 'active';

create or replace function public.bump_product_unit_config_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_product_units_config_version on public.product_units;
create trigger trg_product_units_config_version
  before update on public.product_units
  for each row execute function public.bump_product_unit_config_version();

comment on table public.units is
  'Danh mục đơn vị do cửa hàng tự quản lý; xóa bị chặn khi còn product_unit tham chiếu.';
comment on column public.product_units.conversion_factor is
  'Số đơn vị tồn kho gốc nhận được từ một đơn vị chứng từ; chứng từ lịch sử lưu snapshot riêng.';

commit;
