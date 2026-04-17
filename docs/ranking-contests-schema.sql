create table if not exists public.ranking_contests (
  id uuid primary key default gen_random_uuid(),
  contest_name text not null,
  scope text not null check (scope in ('rep', 'manager')),
  participation_scope text not null default 'ranking_groups',
  payment_date date null,
  coverage_period_start date null,
  coverage_period_end date null,
  is_active boolean not null default true,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ranking_contests_coverage_range_chk check (
    coverage_period_start is null
    or coverage_period_end is null
    or coverage_period_start <= coverage_period_end
  )
);

alter table public.ranking_contests
  add column if not exists participation_scope text not null default 'ranking_groups';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ranking_contests_participation_scope_chk'
  ) then
    alter table public.ranking_contests
      add constraint ranking_contests_participation_scope_chk
      check (participation_scope in ('all_fdv', 'ranking_groups'));
  end if;
end $$;

create table if not exists public.ranking_contest_components (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.ranking_contests(id) on delete cascade,
  component_name text not null,
  threshold_value numeric null,
  period_start date null,
  period_end date null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ranking_contest_components_period_range_chk check (
    period_start is null
    or period_end is null
    or period_start <= period_end
  )
);

create table if not exists public.ranking_contest_prizes (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.ranking_contests(id) on delete cascade,
  place_no integer not null,
  title text null,
  amount_mxn numeric null,
  description text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ranking_contest_prizes_place_chk check (place_no >= 1)
);

create table if not exists public.ranking_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ranking_contest_participants (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.ranking_contests(id) on delete cascade,
  ranking_group_id uuid not null references public.ranking_groups(id) on delete cascade,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ranking_contest_participants_unique_pair unique (contest_id, ranking_group_id)
);

create index if not exists ranking_contests_active_idx
  on public.ranking_contests (is_active, updated_at desc);

create index if not exists ranking_contests_scope_idx
  on public.ranking_contests (scope, updated_at desc);

create index if not exists ranking_contest_components_contest_idx
  on public.ranking_contest_components (contest_id, sort_order asc);

create index if not exists ranking_contest_prizes_contest_idx
  on public.ranking_contest_prizes (contest_id, sort_order asc);

create index if not exists ranking_groups_active_idx
  on public.ranking_groups (is_active, name);

create index if not exists ranking_contest_participants_contest_idx
  on public.ranking_contest_participants (contest_id);

create index if not exists ranking_contest_participants_group_idx
  on public.ranking_contest_participants (ranking_group_id);

create or replace function public.set_ranking_contests_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ranking_contests_updated_at
  on public.ranking_contests;

create trigger trg_ranking_contests_updated_at
before update on public.ranking_contests
for each row execute procedure public.set_ranking_contests_updated_at();

create or replace function public.set_ranking_contest_components_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ranking_contest_components_updated_at
  on public.ranking_contest_components;

create trigger trg_ranking_contest_components_updated_at
before update on public.ranking_contest_components
for each row execute procedure public.set_ranking_contest_components_updated_at();

create or replace function public.set_ranking_contest_prizes_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ranking_contest_prizes_updated_at
  on public.ranking_contest_prizes;

create trigger trg_ranking_contest_prizes_updated_at
before update on public.ranking_contest_prizes
for each row execute procedure public.set_ranking_contest_prizes_updated_at();

create or replace function public.set_ranking_groups_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ranking_groups_updated_at
  on public.ranking_groups;

create trigger trg_ranking_groups_updated_at
before update on public.ranking_groups
for each row execute procedure public.set_ranking_groups_updated_at();

create or replace function public.set_ranking_contest_participants_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ranking_contest_participants_updated_at
  on public.ranking_contest_participants;

create trigger trg_ranking_contest_participants_updated_at
before update on public.ranking_contest_participants
for each row execute procedure public.set_ranking_contest_participants_updated_at();
