-- Normalized KPI Local YTD output for /admin/source-ranking.
-- Run this in Supabase SQL editor before uploading KPI Local YTD with normalization enabled.

create table if not exists public.ranking_kpi_local_ytd (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  territorio_individual text not null,
  empleado bigint null,
  nombre text not null,
  tier text null,
  total_hcps integer not null default 0,
  visited_unique integer not null default 0,
  no_visited_unique integer not null default 0,
  total_objetivos numeric(18, 6) not null default 0,
  total_visitas numeric(18, 6) not null default 0,
  total_visitas_top numeric(18, 6) not null default 0,
  call_adherance numeric(18, 6) not null default 0,
  garantia boolean not null default false,
  matched_by text not null default 'unmatched',
  name_match_score integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ranking_kpi_local_ytd_period_month_chk check (
    period_month = (date_trunc('month', period_month::timestamptz))::date
  ),
  constraint ranking_kpi_local_ytd_matched_by_chk check (
    matched_by = any (array['name'::text, 'territory'::text, 'unmatched'::text])
  )
);

create index if not exists ranking_kpi_local_ytd_period_idx
  on public.ranking_kpi_local_ytd (period_month, territorio_individual);

create index if not exists ranking_kpi_local_ytd_period_employee_idx
  on public.ranking_kpi_local_ytd (period_month, empleado);

create or replace function public.set_ranking_kpi_local_ytd_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ranking_kpi_local_ytd_updated_at
  on public.ranking_kpi_local_ytd;

create trigger trg_ranking_kpi_local_ytd_updated_at
before update on public.ranking_kpi_local_ytd
for each row execute procedure public.set_ranking_kpi_local_ytd_updated_at();

