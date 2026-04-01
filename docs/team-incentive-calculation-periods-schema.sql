-- Estado operativo del calculo de incentivos por periodo.

create table if not exists public.team_incentive_calculation_periods (
  id uuid primary key default gen_random_uuid(),
  period_month date not null unique,
  status text not null default 'borrador'
    check (status in ('borrador', 'precalculo', 'final', 'publicado')),
  final_amount numeric(18, 2) null,
  calculated_at timestamptz null,
  approved_at timestamptz null,
  finalized_at timestamptz null,
  published_at timestamptz null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_incentive_calculation_periods_period_idx
  on public.team_incentive_calculation_periods (period_month desc);

