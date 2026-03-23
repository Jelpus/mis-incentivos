-- Full migration: JSONB rule_definition -> normalized tables
-- and drop of public.team_incentive_rule_versions.rule_definition
--
-- Prerequisite:
-- 1) Run docs/team-rule-definitions-normalized-schema.sql first.
--
-- Recommendation:
-- 1) Run in maintenance window.
-- 2) Backup database or at least team_incentive_rule_versions before executing.

begin;

-- 0) Safety backup of JSON payload before destructive step
create table if not exists public.team_incentive_rule_versions_rule_definition_backup as
select
  id as version_id,
  period_month,
  team_id,
  version_no,
  rule_definition,
  now() as backed_up_at
from public.team_incentive_rule_versions
where false;

insert into public.team_incentive_rule_versions_rule_definition_backup (
  version_id,
  period_month,
  team_id,
  version_no,
  rule_definition,
  backed_up_at
)
select
  v.id,
  v.period_month,
  v.team_id,
  v.version_no,
  v.rule_definition,
  now()
from public.team_incentive_rule_versions v
where v.rule_definition is not null
  and not exists (
    select 1
    from public.team_incentive_rule_versions_rule_definition_backup b
    where b.version_id = v.id
  );

-- 1) Ensure link column exists
alter table public.team_incentive_rule_versions
  add column if not exists rule_definition_id uuid null references public.team_rule_definitions(id);

-- 2) Migrate each version into normalized definition + items + sources
do $$
declare
  v record;
  r record;
  s record;
  d_id uuid;
  item_id bigint;
  rule_order integer;
  source_order integer;
  rule_json jsonb;
  source_json jsonb;
  file_value text;
  fuente_value text;
  metric_value text;
  molecula_value text;
begin
  for v in
    select
      id,
      period_month,
      team_id,
      source_type,
      created_by,
      created_at,
      rule_definition
    from public.team_incentive_rule_versions
    where rule_definition_id is null
      and rule_definition is not null
    order by period_month, team_id, version_no, created_at
  loop
    insert into public.team_rule_definitions (
      period_month,
      team_id,
      schema_version,
      model_name,
      description,
      source_type,
      created_by,
      created_at
    )
    values (
      v.period_month,
      v.team_id,
      coalesce(v.rule_definition ->> 'schema_version', 'team_rules_v2'),
      nullif(v.rule_definition #>> '{meta,model_name}', ''),
      nullif(v.rule_definition #>> '{meta,description}', ''),
      coalesce(v.source_type, 'manual'),
      v.created_by,
      coalesce(v.created_at, now())
    )
    returning id into d_id;

    update public.team_incentive_rule_versions
    set rule_definition_id = d_id
    where id = v.id;

    if jsonb_typeof(v.rule_definition -> 'rules') = 'array' then
      rule_order := 0;

      for r in
        select value as rule_value
        from jsonb_array_elements(v.rule_definition -> 'rules')
      loop
        rule_order := rule_order + 1;
        rule_json := r.rule_value;

        insert into public.team_rule_definition_items (
          definition_id,
          rule_order,
          rule_code,
          product_name,
          plan_type_name,
          candado,
          cobertura_candado,
          distribucion_no_asignada,
          prod_weight,
          agrupador,
          curva_pago,
          elemento,
          created_at
        )
        values (
          d_id,
          rule_order,
          nullif(rule_json ->> 'rule_id', ''),
          nullif(rule_json ->> 'product_name', ''),
          nullif(rule_json ->> 'plan_type_name', ''),
          nullif(rule_json ->> 'candado', ''),
          case
            when coalesce(rule_json ->> 'cobertura_candado', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (rule_json ->> 'cobertura_candado')::numeric
            else null
          end,
          case lower(coalesce(rule_json ->> 'distribucion_no_asignada', 'false'))
            when 'true' then true
            when '1' then true
            when 'si' then true
            when 'yes' then true
            else false
          end,
          case
            when coalesce(rule_json ->> 'prod_weight', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (rule_json ->> 'prod_weight')::numeric
            else null
          end,
          nullif(rule_json ->> 'agrupador', ''),
          nullif(rule_json ->> 'curva_pago', ''),
          nullif(rule_json ->> 'elemento', ''),
          coalesce(v.created_at, now())
        )
        returning id into item_id;

        if jsonb_typeof(rule_json -> 'sources') = 'array' then
          source_order := 0;

          for s in
            select value as source_value
            from jsonb_array_elements(rule_json -> 'sources')
          loop
            source_order := source_order + 1;
            source_json := s.source_value;

            insert into public.team_rule_definition_item_sources (
              item_id,
              source_order,
              file_code,
              file_display,
              fuente,
              metric,
              molecula_producto,
              created_at
            )
            values (
              item_id,
              coalesce(
                nullif(source_json ->> 'order', '')::integer,
                source_order
              ),
              nullif(
                regexp_replace(
                  lower(trim(coalesce(source_json ->> 'file', ''))),
                  '[^a-z0-9]+',
                  '_',
                  'g'
                ),
                ''
              ),
              nullif(source_json ->> 'file', ''),
              nullif(source_json ->> 'fuente', ''),
              nullif(source_json ->> 'metric', ''),
              nullif(source_json ->> 'molecula_producto', ''),
              coalesce(v.created_at, now())
            );
          end loop;
        else
          -- Legacy fields file1..file8 / fuente1..fuente8 / metric1..metric8 / molecula_producto1..8
          for source_order in 1..8 loop
            file_value := nullif(rule_json ->> format('file%s', source_order), '');
            fuente_value := nullif(rule_json ->> format('fuente%s', source_order), '');
            metric_value := nullif(rule_json ->> format('metric%s', source_order), '');
            molecula_value := nullif(rule_json ->> format('molecula_producto%s', source_order), '');

            if file_value is not null
              or fuente_value is not null
              or metric_value is not null
              or molecula_value is not null
            then
              insert into public.team_rule_definition_item_sources (
                item_id,
                source_order,
                file_code,
                file_display,
                fuente,
                metric,
                molecula_producto,
                created_at
              )
              values (
                item_id,
                source_order,
                nullif(
                  regexp_replace(
                    lower(trim(coalesce(file_value, ''))),
                    '[^a-z0-9]+',
                    '_',
                    'g'
                  ),
                  ''
                ),
                file_value,
                fuente_value,
                metric_value,
                molecula_value,
                coalesce(v.created_at, now())
              );
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end loop;
end $$;

-- 3) Integrity check before dropping JSONB column
do $$
declare
  total_versions bigint;
  linked_versions bigint;
begin
  select count(*) into total_versions
  from public.team_incentive_rule_versions
  where rule_definition is not null;

  select count(*) into linked_versions
  from public.team_incentive_rule_versions
  where rule_definition is not null
    and rule_definition_id is not null;

  if total_versions <> linked_versions then
    raise exception
      'Migration integrity check failed. total_versions=% linked_versions=%',
      total_versions, linked_versions;
  end if;
end $$;

-- 4) Enforce new relational link and remove old JSONB
alter table public.team_incentive_rule_versions
  alter column rule_definition_id set not null;

alter table public.team_incentive_rule_versions
  drop column if exists rule_definition;

commit;

