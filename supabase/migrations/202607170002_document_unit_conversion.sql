begin;

alter table public.sales_order_items
  add column if not exists document_unit_name text,
  add column if not exists base_unit_name text,
  add column if not exists document_unit_factor numeric(18, 6),
  add column if not exists document_quantity numeric(18, 3),
  add column if not exists document_unit_price numeric(18, 2);

alter table public.sales_order_items
  add constraint sales_order_items_document_unit_complete_chk check (
    (document_unit_name is null and base_unit_name is null and document_unit_factor is null and document_quantity is null and document_unit_price is null)
    or
    (
      length(btrim(document_unit_name)) > 0
      and length(btrim(base_unit_name)) > 0
      and document_unit_factor > 0
      and document_quantity > 0
      and document_unit_price >= 0
      and abs(quantity - document_quantity * document_unit_factor) <= 0.0005
      and abs(unit_price * document_unit_factor - document_unit_price) <= 0.01
    )
  );

alter table public.purchase_order_items
  add column if not exists document_unit_name text,
  add column if not exists base_unit_name text,
  add column if not exists document_unit_factor numeric(18, 6),
  add column if not exists document_quantity numeric(18, 3),
  add column if not exists document_unit_cost numeric(18, 2);

alter table public.purchase_order_items
  add constraint purchase_order_items_document_unit_complete_chk check (
    (document_unit_name is null and base_unit_name is null and document_unit_factor is null and document_quantity is null and document_unit_cost is null)
    or
    (
      length(btrim(document_unit_name)) > 0
      and length(btrim(base_unit_name)) > 0
      and document_unit_factor > 0
      and document_quantity > 0
      and document_unit_cost >= 0
      and abs(ordered_quantity - document_quantity * document_unit_factor) <= 0.0005
      and abs(unit_cost * document_unit_factor - document_unit_cost) <= 0.01
    )
  );

comment on column public.sales_order_items.document_unit_factor is
  'Frozen conversion: one document unit equals this many stock base units.';
comment on column public.purchase_order_items.document_unit_factor is
  'Frozen conversion: one document unit equals this many stock base units.';

commit;
