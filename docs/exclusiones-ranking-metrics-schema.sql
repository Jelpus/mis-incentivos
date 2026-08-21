-- Versioned ranking exclusions extracted from KPI Local YTD / CAT_GARANTIA.
-- Run in Supabase SQL editor before the next KPI Local YTD upload.

create table if not exists public.exclusiones_ranking_metric_versions (
  id uuid primary key default gen_random_uuid(),
  version_no bigint generated always as identity,
  source_period_month date not null,
  row_count integer not null default 0,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint exclusiones_ranking_metric_versions_version_no_key unique (version_no),
  constraint exclusiones_ranking_metric_versions_id_version_key unique (id, version_no),
  constraint exclusiones_ranking_metric_versions_source_period_chk check (
    source_period_month = (date_trunc('month', source_period_month::timestamptz))::date
  )
);

create table if not exists public.exclusiones_ranking_metrics (
  id bigserial primary key,
  version_id uuid not null,
  version_no bigint not null,
  territory_id text not null,
  period_month date not null,
  created_at timestamptz not null default now(),
  constraint exclusiones_ranking_metrics_version_fk
    foreign key (version_id, version_no)
    references public.exclusiones_ranking_metric_versions (id, version_no)
    on delete cascade,
  constraint exclusiones_ranking_metrics_territory_chk check (btrim(territory_id) <> ''),
  constraint exclusiones_ranking_metrics_period_month_chk check (
    period_month = (date_trunc('month', period_month::timestamptz))::date
  ),
  constraint exclusiones_ranking_metrics_version_territory_period_key
    unique (version_id, territory_id, period_month)
);

create index if not exists exclusiones_ranking_metric_versions_latest_idx
  on public.exclusiones_ranking_metric_versions (version_no desc);

create index if not exists exclusiones_ranking_metrics_latest_lookup_idx
  on public.exclusiones_ranking_metrics (version_no desc, period_month, territory_id);

create or replace view public.exclusiones_ranking_metrics_latest as
select
  exclusions.version_no,
  'v_' || exclusions.version_no::text as version_label,
  exclusions.territory_id,
  exclusions.period_month,
  versions.source_period_month,
  versions.created_at
from public.exclusiones_ranking_metrics exclusions
join public.exclusiones_ranking_metric_versions versions
  on versions.id = exclusions.version_id
where exclusions.version_no = (
  select max(latest_version.version_no)
  from public.exclusiones_ranking_metric_versions latest_version
);

create or replace function public.save_exclusiones_ranking_metrics_version(
  p_source_period_month date,
  p_rows jsonb,
  p_created_by uuid default null
)
returns table(version_no bigint, inserted_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_version_id uuid;
  saved_version_no bigint;
  saved_row_count integer := 0;
begin
  if p_source_period_month is null
    or p_source_period_month <> (date_trunc('month', p_source_period_month::timestamptz))::date then
    raise exception 'p_source_period_month must be the first day of a month';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  insert into public.exclusiones_ranking_metric_versions as saved_version (
    source_period_month,
    created_by
  )
  values (
    p_source_period_month,
    p_created_by
  )
  returning saved_version.id, saved_version.version_no
    into saved_version_id, saved_version_no;

  insert into public.exclusiones_ranking_metrics (
    version_id,
    version_no,
    territory_id,
    period_month
  )
  select distinct
    saved_version_id,
    saved_version_no,
    upper(btrim(source_row.territory_id)),
    source_row.period_month
  from jsonb_to_recordset(p_rows) as source_row(
    territory_id text,
    period_month date
  )
  where btrim(coalesce(source_row.territory_id, '')) <> ''
    and source_row.period_month is not null
    and source_row.period_month = (date_trunc('month', source_row.period_month::timestamptz))::date
    and extract(year from source_row.period_month) = extract(year from p_source_period_month)
  on conflict (version_id, territory_id, period_month) do nothing;

  get diagnostics saved_row_count = row_count;

  update public.exclusiones_ranking_metric_versions
  set row_count = saved_row_count
  where id = saved_version_id;

  return query select saved_version_no, saved_row_count;
end;
$$;

revoke all on table public.exclusiones_ranking_metric_versions from anon, authenticated;
revoke all on table public.exclusiones_ranking_metrics from anon, authenticated;
revoke all on table public.exclusiones_ranking_metrics_latest from anon, authenticated;
revoke all on function public.save_exclusiones_ranking_metrics_version(date, jsonb, uuid)
  from public, anon, authenticated;

grant select on table public.exclusiones_ranking_metric_versions to service_role;
grant select on table public.exclusiones_ranking_metrics to service_role;
grant select on table public.exclusiones_ranking_metrics_latest to service_role;
grant execute on function public.save_exclusiones_ranking_metrics_version(date, jsonb, uuid)
  to service_role;

comment on table public.exclusiones_ranking_metrics is
  'TERRITORIO and FECHA rows from CAT_GARANTIA, retained only for the KPI upload year.';
comment on view public.exclusiones_ranking_metrics_latest is
  'Rows belonging to max(version_no), ready for ranking exclusion lookups.';
