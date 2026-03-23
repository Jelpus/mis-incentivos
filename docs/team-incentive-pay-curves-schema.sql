-- Catalogo de curvas de pago para calculo de incentivos
-- Ejecutar en Supabase SQL Editor
-- Modelo recomendado:
--   1) Cabecera de curva
--   2) Puntos por cobertura/pago

create table if not exists public.team_incentive_pay_curves (
  id uuid primary key default gen_random_uuid(),
  curve_code text not null unique,
  curve_name text not null,
  curve_description text null,
  is_active boolean not null default false,
  is_hidden boolean not null default false,
  created_by uuid null references auth.users(id),
  updated_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_incentive_pay_curve_points (
  id uuid primary key default gen_random_uuid(),
  curve_id uuid not null references public.team_incentive_pay_curves(id) on delete cascade,
  row_no int not null,
  cobertura numeric(8,4) not null,
  pago numeric(10,6) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_incentive_pay_curve_points_row_unique unique (curve_id, row_no),
  constraint team_incentive_pay_curve_points_coverage_unique unique (curve_id, cobertura)
);

create index if not exists team_incentive_pay_curves_active_idx
  on public.team_incentive_pay_curves (is_active, is_hidden);

create index if not exists team_incentive_pay_curves_created_at_idx
  on public.team_incentive_pay_curves (created_at desc);

create index if not exists team_incentive_pay_curve_points_curve_idx
  on public.team_incentive_pay_curve_points (curve_id, row_no);
