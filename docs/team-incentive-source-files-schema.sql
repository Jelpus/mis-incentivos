-- Storage metadata for source files used by Team incentive rules per period.
-- Run this in Supabase SQL editor before using source file uploads in /admin/incentive-rules.

create table if not exists public.team_incentive_source_files (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  file_code text not null,
  display_name text not null,
  original_file_name text not null,
  storage_bucket text not null,
  storage_path text not null,
  content_type text null,
  size_bytes bigint not null,
  uploaded_by uuid null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_incentive_source_files_unique_period_code
  on public.team_incentive_source_files (period_month, file_code);

create index if not exists team_incentive_source_files_period_idx
  on public.team_incentive_source_files (period_month, uploaded_at desc);

create or replace function public.set_team_incentive_source_files_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_team_incentive_source_files_updated_at
  on public.team_incentive_source_files;

create trigger trg_team_incentive_source_files_updated_at
before update on public.team_incentive_source_files
for each row execute procedure public.set_team_incentive_source_files_updated_at();

