-- Versionado de objetivos individuales por periodo.
-- Recomendado ejecutar con role admin del proyecto.

create table if not exists public.team_objective_target_versions (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  version_no integer not null,
  source_file_name text not null,
  sheet_name text null,
  change_note text null,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  missing_required_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default now(),
  unique (period_month, version_no)
);

create index if not exists team_objective_target_versions_lookup_idx
  on public.team_objective_target_versions (period_month, created_at desc);

create table if not exists public.team_objective_targets (
  id bigserial primary key,
  version_id uuid not null references public.team_objective_target_versions(id) on delete cascade,
  period_month date not null,
  team_id text null,
  territorio_individual text not null,
  product_name text not null,
  metodo text not null default 'PRIVATE',
  plan_type_name text not null,
  target numeric(18, 6) not null,
  brick text not null default 'PRIVATE',
  cuenta text not null default 'PRIVATE',
  sales_credity numeric null,
  canal text null,
  producto text null,
  periodo_string text null,
  periodo text null,
  source_row_number integer not null,
  created_at timestamptz not null default now(),
  unique (version_id, territorio_individual, product_name, brick, cuenta)
);

alter table public.team_objective_targets
  add column if not exists brick text not null default 'PRIVATE';

alter table public.team_objective_targets
  add column if not exists cuenta text not null default 'PRIVATE';

alter table public.team_objective_targets
  add column if not exists metodo text not null default 'PRIVATE';

alter table public.team_objective_targets
  add column if not exists sales_credity numeric null;

do $$
declare
  old_constraint_name text;
begin
  select c.conname
    into old_constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'team_objective_targets'
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid) like '%(version_id, territorio_individual, product_name)%'
  limit 1;

  if old_constraint_name is not null then
    execute format(
      'alter table public.team_objective_targets drop constraint %I',
      old_constraint_name
    );
  end if;
end $$;

alter table public.team_objective_targets
  add constraint team_objective_targets_version_route_product_brick_cuenta_key
  unique (version_id, territorio_individual, product_name, brick, cuenta);

create index if not exists team_objective_targets_lookup_idx
  on public.team_objective_targets (period_month, team_id, territorio_individual);
