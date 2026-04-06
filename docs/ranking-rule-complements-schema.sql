create table if not exists public.ranking_rule_complements (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  team_id text not null,
  product_name text not null,
  ranking text null,
  puntos_ranking_lvu numeric null,
  prod_weight numeric null,
  source_type text not null default 'excel_complement',
  source_file_name text null,
  source_sheet_name text null,
  updated_by uuid null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ranking_rule_complements_unique_key
  on public.ranking_rule_complements (period_month, team_id, product_name);

create index if not exists ranking_rule_complements_period_idx
  on public.ranking_rule_complements (period_month, is_active);

