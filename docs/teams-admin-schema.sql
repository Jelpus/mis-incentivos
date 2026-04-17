create table if not exists public.team_admin_assignments (
  team_id text primary key,
  admin_user_id uuid not null references public.profiles(user_id) on delete restrict,
  updated_by uuid null references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_admin_assignments_admin_idx
  on public.team_admin_assignments (admin_user_id);

create or replace function public.set_team_admin_assignments_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_team_admin_assignments_updated_at
  on public.team_admin_assignments;

create trigger trg_team_admin_assignments_updated_at
before update on public.team_admin_assignments
for each row execute procedure public.set_team_admin_assignments_updated_at();
