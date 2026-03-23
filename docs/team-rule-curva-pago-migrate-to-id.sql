-- Migracion de team_rule_definition_items.curva_pago
-- Objetivo: reemplazar valor legacy (nombre/codigo) por curve_id
-- Requiere:
--   - public.team_incentive_pay_curves
--   - public.team_rule_definition_items

begin;

-- 1) Backup rapido de valores actuales
create table if not exists public.team_rule_definition_items_curva_pago_backup as
select
  i.id as item_id,
  i.definition_id,
  i.rule_order,
  i.curva_pago as curva_pago_legacy,
  now() as backed_up_at
from public.team_rule_definition_items i;

insert into public.team_rule_definition_items_curva_pago_backup (
  item_id,
  definition_id,
  rule_order,
  curva_pago_legacy,
  backed_up_at
)
select
  i.id,
  i.definition_id,
  i.rule_order,
  i.curva_pago,
  now()
from public.team_rule_definition_items i
where not exists (
  select 1
  from public.team_rule_definition_items_curva_pago_backup b
  where b.item_id = i.id
    and b.curva_pago_legacy is not distinct from i.curva_pago
);

-- 2) Resolver alias (id/codigo/nombre) -> id
with curve_aliases as (
  select lower(trim(c.id::text)) as alias, c.id::text as curve_id
  from public.team_incentive_pay_curves c
  union
  select lower(trim(c.curve_code)) as alias, c.id::text as curve_id
  from public.team_incentive_pay_curves c
  where c.curve_code is not null and trim(c.curve_code) <> ''
  union
  select lower(trim(c.curve_name)) as alias, c.id::text as curve_id
  from public.team_incentive_pay_curves c
  where c.curve_name is not null and trim(c.curve_name) <> ''
),
resolved as (
  select
    i.id as item_id,
    i.curva_pago as legacy_value,
    a.curve_id as resolved_curve_id
  from public.team_rule_definition_items i
  left join curve_aliases a
    on lower(trim(i.curva_pago)) = a.alias
  where i.curva_pago is not null
    and trim(i.curva_pago) <> ''
)
update public.team_rule_definition_items i
set curva_pago = r.resolved_curve_id
from resolved r
where i.id = r.item_id
  and r.resolved_curve_id is not null;

commit;

-- 3) Revisa pendientes sin resolver:
-- select i.id, i.definition_id, i.rule_order, i.curva_pago
-- from public.team_rule_definition_items i
-- where i.curva_pago is not null
--   and trim(i.curva_pago) <> ''
--   and i.curva_pago not in (select id::text from public.team_incentive_pay_curves);
