-- Initial schema for versioned incentive rules by team_id + period_month.
-- Run this in Supabase SQL editor before using /admin/incentive-rules fully.

create table if not exists public.team_incentive_rule_versions (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  team_id text not null,
  version_no integer not null,
  change_note text null,
  rule_definition jsonb not null default '{}'::jsonb,
  source_type text not null default 'manual',
  created_by uuid null,
  created_at timestamptz not null default now()
);

create unique index if not exists team_incentive_rule_versions_unique_version
  on public.team_incentive_rule_versions (period_month, team_id, version_no);

create index if not exists team_incentive_rule_versions_lookup_idx
  on public.team_incentive_rule_versions (period_month, team_id, created_at desc);
