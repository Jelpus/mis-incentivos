begin;

create table public.ranking_certification_versions (
  id uuid primary key default gen_random_uuid(),
  certification_year integer not null check (certification_year between 2026 and 2200),
  version_no integer not null check (version_no > 0),
  original_file_name text not null,
  storage_bucket text not null,
  storage_path text not null unique,
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  status_period_month date not null,
  summary jsonb not null,
  uploaded_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  unique (certification_year, version_no),
  check (extract(year from status_period_month) = certification_year)
);

create table public.ranking_certification_rows (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.ranking_certification_versions(id),
  source_row integer not null check (source_row > 0),
  source_employee bigint,
  source_territory text,
  source_name text not null,
  matched_employee bigint,
  matched_territory text,
  matched_name text,
  matched_by text not null check (matched_by in ('employee', 'territory', 'unmatched', 'conflict')),
  match_issue text,
  scientific_knowledge_pct numeric(12,6) check (scientific_knowledge_pct between 0 and 100),
  annual_certification_pct numeric(12,6) check (annual_certification_pct between 0 and 100),
  unique (version_id, source_row),
  check (matched_by not in ('employee', 'territory') or (matched_employee is not null or matched_territory is not null))
);

create index ranking_certification_rows_employee_idx on public.ranking_certification_rows (version_id, matched_employee);
create index ranking_certification_rows_territory_idx on public.ranking_certification_rows (version_id, matched_territory);
alter table public.ranking_certification_versions enable row level security;
alter table public.ranking_certification_rows enable row level security;
revoke all on public.ranking_certification_versions, public.ranking_certification_rows from public, anon, authenticated, service_role;
grant select, insert on public.ranking_certification_versions, public.ranking_certification_rows to service_role;

-- A version is visible only after its complete set of rows commits. Previous
-- versions and original files remain intact. Concurrent uploads serialize by year.
create or replace function public.save_ranking_certification_version(
  p_year integer, p_file_name text, p_bucket text, p_path text, p_sha256 text,
  p_status_period date, p_summary jsonb, p_rows jsonb, p_actor uuid
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $function$
declare
  v_id uuid;
  v_number integer;
  v_count integer;
begin
  if not exists (select 1 from public.profiles where user_id = p_actor and is_active = true and global_role::text in ('admin', 'super_admin')) then
    raise exception using errcode = '42501', message = 'Se requiere un administrador activo.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Las calificaciones deben ser una lista.'; end if;
  v_count := jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 10000 then raise exception 'Se requieren entre 1 y 10000 calificaciones.'; end if;
  if (p_summary->>'sourceRows')::integer is distinct from v_count then raise exception 'El resumen no coincide con las filas.'; end if;
  if p_path not like 'certifications/' || p_year || '/' || p_actor || '/%' or p_path like '%..%' then raise exception 'Ruta de archivo inválida.'; end if;
  perform pg_advisory_xact_lock(64126, p_year);
  select id, version_no into v_id, v_number from public.ranking_certification_versions where storage_path = p_path;
  if found then return jsonb_build_object('id', v_id, 'version_no', v_number, 'duplicate', true); end if;
  select coalesce(max(version_no), 0) + 1 into v_number from public.ranking_certification_versions where certification_year = p_year;
  insert into public.ranking_certification_versions(certification_year, version_no, original_file_name, storage_bucket, storage_path, file_sha256, status_period_month, summary, uploaded_by)
    values (p_year, v_number, p_file_name, p_bucket, p_path, p_sha256, p_status_period, p_summary, p_actor) returning id into v_id;
  insert into public.ranking_certification_rows(version_id, source_row, source_employee, source_territory, source_name, matched_employee, matched_territory, matched_name, matched_by, match_issue, scientific_knowledge_pct, annual_certification_pct)
    select v_id, r.source_row, r.source_employee, r.source_territory, r.source_name, r.matched_employee, r.matched_territory, r.matched_name, r.matched_by, r.match_issue, r.scientific_knowledge_pct, r.annual_certification_pct
    from jsonb_to_recordset(p_rows) as r(source_row integer, source_employee bigint, source_territory text, source_name text, matched_employee bigint, matched_territory text, matched_name text, matched_by text, match_issue text, scientific_knowledge_pct numeric, annual_certification_pct numeric);
  return jsonb_build_object('id', v_id, 'version_no', v_number, 'duplicate', false);
end;
$function$;
revoke all on function public.save_ranking_certification_version(integer, text, text, text, text, date, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_ranking_certification_version(integer, text, text, text, text, date, jsonb, jsonb, uuid) to service_role;
comment on table public.ranking_certification_versions is 'Annual official ranking scores; latest version_no within the evaluation year is used, without monthly accumulation.';
commit;
