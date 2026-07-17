create table if not exists public.platform_change_log (
  id uuid primary key default gen_random_uuid(),
  change_date date not null default current_date,
  route text not null,
  current_state text not null,
  modified_state text not null,
  commit_ref text null,
  source_key text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_change_log_route_not_blank_chk check (btrim(route) <> ''),
  constraint platform_change_log_current_state_not_blank_chk check (btrim(current_state) <> ''),
  constraint platform_change_log_modified_state_not_blank_chk check (btrim(modified_state) <> ''),
  constraint platform_change_log_source_key_unique unique (source_key)
);

create index if not exists platform_change_log_change_date_idx
  on public.platform_change_log (change_date desc, created_at desc);

create index if not exists platform_change_log_route_idx
  on public.platform_change_log (route);

create or replace function public.set_platform_change_log_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_platform_change_log_updated_at
  on public.platform_change_log;

create trigger trg_platform_change_log_updated_at
before update on public.platform_change_log
for each row execute procedure public.set_platform_change_log_updated_at();
