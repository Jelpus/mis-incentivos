-- Configuracion operativa global para reglas de elegibilidad del calculo.
-- period_month se conserva como llave tecnica para compatibilidad; la app usa siempre 1900-01-01.

create table if not exists public.team_incentive_period_settings (
  period_month date primary key default date '1900-01-01',
  result_from_hire_date_enabled boolean not null default false,
  hire_date_cutoff_day integer not null default 20
    check (hire_date_cutoff_day between 1 and 31),
  affected_product_names text[] not null default '{}'::text[],
  updated_by uuid null references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_incentive_period_settings_period_idx
  on public.team_incentive_period_settings (period_month);

create or replace function public.set_team_incentive_period_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_team_incentive_period_settings_updated_at
  on public.team_incentive_period_settings;

create trigger trg_team_incentive_period_settings_updated_at
before update on public.team_incentive_period_settings
for each row execute procedure public.set_team_incentive_period_settings_updated_at();
