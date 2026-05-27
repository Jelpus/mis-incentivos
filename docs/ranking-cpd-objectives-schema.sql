create table if not exists public.ranking_cpd_objectives (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  objective_cpd numeric null,
  is_active boolean not null default true,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ranking_cpd_objectives_team_unique unique (team_id),
  constraint ranking_cpd_objectives_non_negative_chk check (
    objective_cpd is null or objective_cpd >= 0
  )
);

create index if not exists ranking_cpd_objectives_active_idx
  on public.ranking_cpd_objectives (is_active, team_id);

create or replace function public.set_ranking_cpd_objectives_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ranking_cpd_objectives_updated_at
  on public.ranking_cpd_objectives;

create trigger trg_ranking_cpd_objectives_updated_at
before update on public.ranking_cpd_objectives
for each row execute procedure public.set_ranking_cpd_objectives_updated_at();
