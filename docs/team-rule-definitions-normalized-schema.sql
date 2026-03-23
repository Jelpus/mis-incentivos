-- Phase 1: normalized rule definitions tables
-- Keep team_incentive_rule_versions.rule_definition (jsonb) for backward compatibility.
-- Add rule_definition_id to enable gradual migration.

create table if not exists public.team_rule_definitions (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  team_id text not null,
  schema_version text not null default 'team_rules_v2',
  model_name text null,
  description text null,
  source_type text not null default 'manual',
  created_by uuid null,
  created_at timestamptz not null default now()
);

create index if not exists team_rule_definitions_lookup_idx
  on public.team_rule_definitions (period_month, team_id, created_at desc);

create table if not exists public.team_rule_definition_items (
  id bigserial primary key,
  definition_id uuid not null references public.team_rule_definitions(id) on delete cascade,
  rule_order integer not null,
  rule_code text null,
  product_name text null,
  plan_type_name text null,
  candado text null,
  cobertura_candado numeric null,
  distribucion_no_asignada boolean not null default false,
  prod_weight numeric null,
  agrupador text null,
  curva_pago text null,
  elemento text null,
  created_at timestamptz not null default now()
);

create unique index if not exists team_rule_definition_items_unique_order
  on public.team_rule_definition_items (definition_id, rule_order);

create table if not exists public.team_rule_definition_item_sources (
  id bigserial primary key,
  item_id bigint not null references public.team_rule_definition_items(id) on delete cascade,
  source_order integer not null,
  file_code text null,
  file_display text null,
  fuente text null,
  metric text null,
  molecula_producto text null,
  created_at timestamptz not null default now()
);

create unique index if not exists team_rule_definition_item_sources_unique_order
  on public.team_rule_definition_item_sources (item_id, source_order);

alter table public.team_incentive_rule_versions
  add column if not exists rule_definition_id uuid null references public.team_rule_definitions(id);

create index if not exists team_incentive_rule_versions_definition_idx
  on public.team_incentive_rule_versions (rule_definition_id);

