-- Aggregated ICVA + 48 hrs rows (stage 2) for /admin/source-ranking.

create table if not exists public.ranking_icva_48hrs_agg (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  territorio_individual text not null,
  empleado bigint null,
  nombre text not null,
  total_calls numeric(18, 6) not null default 0,
  icva_calls numeric(18, 6) not null default 0,
  on_time_call numeric(18, 6) not null default 0,
  on_time_icva numeric(18, 6) not null default 0,
  pct_48h numeric(18, 6) not null default 0,
  pct_icva numeric(18, 6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ranking_icva_48hrs_agg_period_month_chk check (
    period_month = (date_trunc('month', period_month::timestamptz))::date
  )
);

create index if not exists ranking_icva_48hrs_agg_period_idx
  on public.ranking_icva_48hrs_agg (period_month, territorio_individual);

create index if not exists ranking_icva_48hrs_agg_employee_idx
  on public.ranking_icva_48hrs_agg (period_month, empleado);

create or replace function public.set_ranking_icva_48hrs_agg_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ranking_icva_48hrs_agg_updated_at
  on public.ranking_icva_48hrs_agg;

create trigger trg_ranking_icva_48hrs_agg_updated_at
before update on public.ranking_icva_48hrs_agg
for each row execute procedure public.set_ranking_icva_48hrs_agg_updated_at();

