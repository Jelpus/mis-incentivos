-- Raw normalized KPI Local YTD rows (stage 1) for /admin/source-ranking.
-- Run this in Supabase SQL editor before uploading KPI Local YTD.

create table if not exists public.ranking_kpi_local_ytd_raw (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  annio_mes text not null,
  territory_source text not null,
  status_nombre_source text null,
  salesforce_id text null,
  tier_ok text null,
  visitas_tot numeric(18, 6) not null default 0,
  visitas_top numeric(18, 6) not null default 0,
  obj_ok numeric(18, 6) not null default 0,
  garantia boolean not null default false,
  matched_territorio_individual text null,
  matched_empleado bigint null,
  matched_nombre text null,
  matched_by text not null default 'unmatched',
  name_match_score integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ranking_kpi_local_ytd_raw_period_month_chk check (
    period_month = (date_trunc('month', period_month::timestamptz))::date
  ),
  constraint ranking_kpi_local_ytd_raw_matched_by_chk check (
    matched_by = any (array['name'::text, 'territory'::text, 'unmatched'::text])
  )
);

create index if not exists ranking_kpi_local_ytd_raw_period_idx
  on public.ranking_kpi_local_ytd_raw (period_month, annio_mes);

create index if not exists ranking_kpi_local_ytd_raw_match_idx
  on public.ranking_kpi_local_ytd_raw (period_month, matched_empleado, matched_territorio_individual);

create or replace function public.set_ranking_kpi_local_ytd_raw_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ranking_kpi_local_ytd_raw_updated_at
  on public.ranking_kpi_local_ytd_raw;

create trigger trg_ranking_kpi_local_ytd_raw_updated_at
before update on public.ranking_kpi_local_ytd_raw
for each row execute procedure public.set_ranking_kpi_local_ytd_raw_updated_at();

