-- Garantias para forzar cobertura en calculo de incentivos.
-- Alcance configurable por periodo y nivel:
-- - linea
-- - team_id
-- - representante (territorio_individual)
-- Puede aplicar a:
-- - todas las reglas del alcance
-- - una regla puntual (rule_key)

create table if not exists public.team_incentive_guarantees (
  id uuid primary key default gen_random_uuid(),
  guarantee_start_month date not null,
  guarantee_end_month date not null,
  scope_type text not null check (scope_type in ('linea', 'team_id', 'representante')),
  scope_value text not null,
  scope_label text null,
  rule_scope text not null default 'all_rules' check (rule_scope in ('all_rules', 'single_rule')),
  rule_key text null,
  target_coverage numeric(8, 4) not null default 100 check (target_coverage > 0),
  is_active boolean not null default true,
  note text null,
  created_at timestamptz not null default now(),
  created_by uuid null references public.profiles(user_id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(user_id) on delete set null,
  constraint team_incentive_guarantees_start_first_day_chk check (
    guarantee_start_month = date_trunc('month', guarantee_start_month::timestamptz)::date
  ),
  constraint team_incentive_guarantees_end_first_day_chk check (
    guarantee_end_month = date_trunc('month', guarantee_end_month::timestamptz)::date
  ),
  constraint team_incentive_guarantees_range_chk check (
    guarantee_end_month >= guarantee_start_month
  ),
  constraint team_incentive_guarantees_rule_key_required_chk check (
    (rule_scope = 'all_rules' and rule_key is null) or
    (rule_scope = 'single_rule' and rule_key is not null and length(trim(rule_key)) > 0)
  ),
  constraint team_incentive_guarantees_scope_not_blank_chk check (
    length(trim(scope_value)) > 0
  )
);

create index if not exists team_incentive_guarantees_range_idx
  on public.team_incentive_guarantees(guarantee_start_month, guarantee_end_month, is_active);

create index if not exists team_incentive_guarantees_scope_idx
  on public.team_incentive_guarantees(scope_type, scope_value);

create index if not exists team_incentive_guarantees_rule_idx
  on public.team_incentive_guarantees(rule_scope, rule_key);

create unique index if not exists team_incentive_guarantees_unique_active
  on public.team_incentive_guarantees (
    guarantee_start_month,
    guarantee_end_month,
    scope_type,
    scope_value,
    rule_scope,
    coalesce(rule_key, '')
  )
  where is_active = true;
