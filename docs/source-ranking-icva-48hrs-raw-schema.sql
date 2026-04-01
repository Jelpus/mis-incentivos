-- Raw normalized ICVA + 48 hrs rows (stage 1) for /admin/source-ranking.

create table if not exists public.ranking_icva_48hrs_raw (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  source_nombre text not null,
  matched_territorio_individual text null,
  matched_empleado bigint null,
  matched_nombre text null,
  matched_by text not null default 'unmatched',
  name_match_score integer null,
  total_calls numeric(18, 6) not null default 0,
  icva_calls numeric(18, 6) not null default 0,
  on_time_call numeric(18, 6) not null default 0,
  on_time_icva numeric(18, 6) not null default 0,
  pct_48h numeric(18, 6) not null default 0,
  pct_icva numeric(18, 6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ranking_icva_48hrs_raw_period_month_chk check (
    period_month = (date_trunc('month', period_month::timestamptz))::date
  ),
  constraint ranking_icva_48hrs_raw_matched_by_chk check (
    matched_by = any (array['name'::text, 'unmatched'::text])
  )
);

create index if not exists ranking_icva_48hrs_raw_period_idx
  on public.ranking_icva_48hrs_raw (period_month);

create index if not exists ranking_icva_48hrs_raw_employee_idx
  on public.ranking_icva_48hrs_raw (period_month, matched_empleado);

create or replace function public.set_ranking_icva_48hrs_raw_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ranking_icva_48hrs_raw_updated_at
  on public.ranking_icva_48hrs_raw;

create trigger trg_ranking_icva_48hrs_raw_updated_at
before update on public.ranking_icva_48hrs_raw
for each row execute procedure public.set_ranking_icva_48hrs_raw_updated_at();

