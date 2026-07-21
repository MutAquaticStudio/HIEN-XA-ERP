begin;

alter table public.product_units
  add column if not exists conversion_mode text not null default 'fixed';

alter table public.product_units
  drop constraint if exists product_units_conversion_factor_check;

alter table public.product_units
  alter column conversion_factor drop not null;

update public.product_units as product_unit
set conversion_mode = 'variable',
    conversion_factor = null
from public.units as unit_definition
where product_unit.unit_id = unit_definition.id
  and not product_unit.is_base
  and unit_definition.normalized_name = 'xe';

alter table public.product_units
  add constraint product_units_conversion_mode_check
    check (conversion_mode in ('fixed', 'variable')),
  add constraint product_units_conversion_config_check
    check (
      (conversion_mode = 'fixed' and conversion_factor > 0)
      or
      (conversion_mode = 'variable' and not is_base and conversion_factor is null)
    );

alter table public.purchase_order_items
  add column if not exists document_unit_conversion_mode text;

alter table public.purchase_order_items
  add constraint purchase_order_items_document_unit_conversion_mode_check
    check (document_unit_conversion_mode is null or document_unit_conversion_mode in ('fixed', 'variable'));

comment on column public.product_units.conversion_mode is
  'fixed uses a configured factor; variable requires actual base quantity on each purchase line.';
comment on column public.product_units.conversion_factor is
  'Base units and fixed purchase units have a positive factor; variable purchase units keep this null.';
comment on column public.purchase_order_items.document_unit_conversion_mode is
  'Frozen purchase-line mode. Variable lines still freeze the effective factor calculated from actual base quantity.';

commit;
