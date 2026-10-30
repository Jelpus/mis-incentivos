begin;

-- Status files are complete monthly snapshots. Keep the IDs of existing
-- territories, retire absent territories, and commit the whole snapshot at once.
-- The application calls this RPC with its server-only service role client.
create or replace function public.apply_import_batch_status_snapshot(
  p_batch_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_batch record;
  v_row record;
  v_profile record;
  v_table text;
  v_territory_field text;
  v_columns text[];
  v_update_columns text[];
  v_insert_columns text[];
  v_existing jsonb;
  v_previous jsonb;
  v_payload jsonb;
  v_plan jsonb := '[]'::jsonb;
  v_item jsonb;
  v_territories text[] := array[]::text[];
  v_noop_ids uuid[] := array[]::uuid[];
  v_territory text;
  v_id uuid;
  v_action text;
  v_issue record;
  v_total integer;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_noop integer := 0;
  v_retired integer := 0;
  v_set_clause text;
  v_insert_clause text;
  v_summary jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = p_actor_user_id and is_active = true
      and global_role::text in ('admin', 'super_admin')
  ) then
    raise exception using errcode = '42501', message = 'Se requiere un administrador activo para aplicar Status.';
  end if;

  select b.*, it.code as import_type_code into v_batch
  from public.import_batches b join public.import_types it on it.id = b.import_type_id
  where b.id = p_batch_id for update of b;
  if not found then raise exception 'No se encontró la carga de Status.'; end if;
  if v_batch.import_type_code not in ('sales_force_status', 'manager_status') then
    raise exception 'La carga no corresponde a Status.';
  end if;
  if v_batch.status::text = 'applied' and v_batch.preview_summary ? 'snapshot_apply_result' then
    return v_batch.preview_summary->'snapshot_apply_result';
  end if;
  if v_batch.status::text <> 'preview_ready' or coalesce(v_batch.preview_summary->>'apply_mode', '') <> 'full_period' then
    raise exception 'Regenera la vista previa completa del período antes de aplicar la carga.';
  end if;
  if v_batch.period_month is null or extract(day from v_batch.period_month) <> 1 then
    raise exception 'Selecciona un período mensual válido antes de aplicar la carga.';
  end if;

  -- Serialize snapshots for the same month, including SVA and SVM.
  perform pg_advisory_xact_lock(hashtext('status-period-snapshot'), (v_batch.period_month - date '2000-01-01')::integer);
  perform 1 from public.import_rows where batch_id = p_batch_id order by row_number, id for update;
  select count(*) into v_total from public.import_rows where batch_id = p_batch_id;
  if v_total = 0 or v_total <> v_batch.total_rows then
    raise exception 'La carga está vacía o incompleta. Vuelve a cargar el Excel completo del período.';
  end if;
  if exists (
    select 1 from public.import_rows where batch_id = p_batch_id
      and (action_type is null or action_type::text = 'invalid' or validation_errors <> '[]'::jsonb)
  ) then
    raise exception 'La carga contiene filas con errores. Corrígelas antes de sustituir el período.';
  end if;

  v_table := v_batch.import_type_code;
  if v_table = 'sales_force_status' then
    v_territory_field := 'territorio_individual';
    v_columns := array['linea_principal','parrilla','nombre_completo','no_empleado','territorio_padre',
      'territorio_individual','puesto','correo_electronico','ciudad','fecha_ingreso','team_id',
      'base_incentivos','is_vacant','is_active','valid_since_period'];
  else
    v_territory_field := 'territorio_manager';
    v_columns := array['territorio_manager','nombre_manager','correo_manager','no_empleado_manager',
      'team_id','is_active','is_vacant'];
  end if;

  select row_number into v_issue from public.import_rows
  where batch_id = p_batch_id and nullif(btrim(cleaned_data->>v_territory_field), '') is null
  order by row_number, id limit 1;
  if found then raise exception 'Falta el territorio en la fila %. Corrige el Excel completo.', v_issue.row_number; end if;
  select btrim(cleaned_data->>v_territory_field) as value, string_agg(row_number::text, ', ' order by row_number, id) as rows
    into v_issue from public.import_rows where batch_id = p_batch_id
    group by btrim(cleaned_data->>v_territory_field) having count(*) > 1
    order by btrim(cleaned_data->>v_territory_field) limit 1;
  if found then raise exception 'El territorio «%» se repite en las filas %. Corrige el Excel completo.', v_issue.value, v_issue.rows; end if;
  if v_table = 'sales_force_status' then
    select (cleaned_data->>'no_empleado')::bigint as value, string_agg(row_number::text, ', ' order by row_number, id) as rows
      into v_issue from public.import_rows where batch_id = p_batch_id and nullif(cleaned_data->>'no_empleado', '') is not null
      group by (cleaned_data->>'no_empleado')::bigint having count(*) > 1
      order by (cleaned_data->>'no_empleado')::bigint limit 1;
    if found then raise exception 'El empleado «%» se repite en las filas %. Corrige el Excel completo.', v_issue.value, v_issue.rows; end if;
  end if;

  execute format('select id from public.%I where period_month = $1 and is_deleted = false order by id for update', v_table)
    using v_batch.period_month;
  execute format('select coalesce(jsonb_object_agg(%I, to_jsonb(s)), ''{}''::jsonb) from public.%I s where period_month = $1 and is_deleted = false', v_territory_field, v_table)
    into v_existing using v_batch.period_month;

  -- Build a fresh plan under the lock; never trust a stale target_record_id.
  for v_row in select * from public.import_rows where batch_id = p_batch_id order by row_number, id loop
    v_territory := btrim(v_row.cleaned_data->>v_territory_field);
    v_previous := v_existing->v_territory;
    select jsonb_object_agg(col, v_row.cleaned_data->col) into v_payload from unnest(v_columns) col;
    v_payload := v_payload || jsonb_build_object(v_territory_field, v_territory,
      'is_active', coalesce((v_row.cleaned_data->>'is_active')::boolean, true),
      'is_vacant', coalesce((v_row.cleaned_data->>'is_vacant')::boolean, false));
    if v_table = 'sales_force_status' then
      if not exists (select 1 from jsonb_each_text(v_batch.mapping_snapshot) where value = 'puesto') then
        v_payload := v_payload || jsonb_build_object('puesto', v_previous->'puesto');
      end if;
      v_payload := v_payload || jsonb_build_object('valid_since_period', coalesce(v_row.cleaned_data->>'valid_since_period', '2026-01-01'));
    end if;
    if v_previous is null then
      v_id := gen_random_uuid(); v_action := 'insert'; v_inserted := v_inserted + 1;
    elsif v_previous @> v_payload then
      v_id := (v_previous->>'id')::uuid; v_action := 'noop'; v_noop := v_noop + 1;
      v_noop_ids := array_append(v_noop_ids, v_id);
    else
      v_id := (v_previous->>'id')::uuid; v_action := 'update'; v_updated := v_updated + 1;
    end if;
    v_territories := array_append(v_territories, v_territory);
    v_plan := v_plan || jsonb_build_array(jsonb_build_object('row_id', v_row.id, 'id', v_id, 'action', v_action, 'data', v_payload));
  end loop;
  select count(*) into v_retired from jsonb_object_keys(v_existing) territory where not territory = any(v_territories);

  -- Release both partial unique indexes before employee swaps. Only rows that
  -- change (or disappear) are staged; no-op rows and their history are untouched.
  if v_table = 'sales_force_status' then
    update public.sales_force_status set is_deleted = true, deleted_at = now(), deleted_by = p_actor_user_id,
      updated_by = p_actor_user_id
    where period_month = v_batch.period_month and is_deleted = false and not id = any(v_noop_ids);
  else
    update public.manager_status set is_deleted = true, updated_by = p_actor_user_id
    where period_month = v_batch.period_month and is_deleted = false and not id = any(v_noop_ids);
  end if;

  v_update_columns := v_columns || array['is_deleted','user_id','profile_email','source_type','updated_by'];
  if v_table = 'sales_force_status' then
    v_update_columns := v_update_columns || array['deleted_at','deleted_by','record_origin'];
  else
    v_update_columns := v_update_columns || array['import_batch_id'];
  end if;
  select string_agg(format('%1$I = payload.%1$I', col), ', ') into v_set_clause from unnest(v_update_columns) col;
  v_insert_columns := v_update_columns || array['id','period_month','created_by'];
  select string_agg(format('%I', col), ', ') into v_insert_clause from unnest(v_insert_columns) col;

  for v_item in select value from jsonb_array_elements(v_plan) loop
    v_id := (v_item->>'id')::uuid;
    if v_item->>'action' <> 'noop' then
      v_payload := v_item->'data' || jsonb_build_object('id', v_id, 'period_month', v_batch.period_month,
        'is_deleted', false, 'deleted_at', null, 'deleted_by', null,
        'user_id', null, 'profile_email', null, 'source_type', 'import', 'record_origin', 'import',
        'created_by', p_actor_user_id, 'updated_by', p_actor_user_id, 'import_batch_id', p_batch_id);
      if v_item->>'action' = 'insert' then
        execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)', v_table, v_insert_clause) using v_payload;
      else
        execute format('update public.%1$I s set %2$s from jsonb_populate_record(null::public.%1$I, $1) payload where s.id = $2', v_table, v_set_clause) using v_payload, v_id;
      end if;
    end if;
    update public.import_rows set target_record_id = v_id, action_type = (v_item->>'action')::public.import_row_action_type,
      action_details = jsonb_build_object('applied_at', now(), 'applied_by', p_actor_user_id,
        'applied_action', v_item->>'action', 'apply_mode', 'full_period', 'status_id', v_id)
    where id = (v_item->>'row_id')::uuid;
  end loop;

  if v_table = 'manager_status' then
    -- SVA and SVM are reviewed in separate steps. Refresh the parent links when
    -- the complete manager snapshot is applied, including new/retired managers.
    update public.sales_force_status s set manager_status_id = (
      select m.id from public.manager_status m where m.period_month = s.period_month
        and m.territorio_manager = s.territorio_padre and m.is_deleted = false
    ), updated_by = p_actor_user_id
    where s.period_month = v_batch.period_month and s.is_deleted = false
      and s.manager_status_id is distinct from (
        select m.id from public.manager_status m where m.period_month = s.period_month
          and m.territorio_manager = s.territorio_padre and m.is_deleted = false
      );
  end if;

  -- Refresh users affected by removal as well as by a new occupant. Keep access
  -- anchors consistent with the final snapshot, including older valid periods.
  for v_profile in
    select distinct p.user_id, p.email from public.profiles p
    where public.normalize_email(p.email) in (
      select public.normalize_email(value->>case when v_table = 'sales_force_status' then 'correo_electronico' else 'correo_manager' end) from jsonb_each(v_existing)
      union
      select public.normalize_email((value->'data')->>case when v_table = 'sales_force_status' then 'correo_electronico' else 'correo_manager' end) from jsonb_array_elements(v_plan)
    ) order by p.user_id
  loop
    perform public.sync_profile_relations_for_user(v_profile.user_id, v_profile.email);
  end loop;

  v_summary := jsonb_build_object('batch_id', p_batch_id, 'status', 'applied', 'apply_mode', 'full_period',
    'period_month', v_batch.period_month, 'applied_at', now(), 'applied_by', p_actor_user_id,
    'results', jsonb_build_object('applied_count', v_total, 'inserted_count', v_inserted,
      'updated_count', v_updated, 'noop_count', v_noop, 'invalid_count', 0, 'retired_count', v_retired));
  update public.import_batches set status = 'applied', applied_at = now(), applied_by = p_actor_user_id,
    preview_summary = preview_summary || jsonb_build_object('apply_result', v_summary, 'snapshot_apply_result', v_summary)
  where id = p_batch_id;
  insert into public.audit_logs(entity_name, entity_id, action_type, actor_user_id, actor_email, metadata)
  values ('import_batch', p_batch_id, 'apply', p_actor_user_id,
    (select email from public.profiles where user_id = p_actor_user_id), v_summary);
  return v_summary;
end;
$function$;

revoke all on function public.apply_import_batch_status_snapshot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_import_batch_status_snapshot(uuid, uuid) to service_role;

-- Retired or inactive rows must not remain access anchors after a full snapshot.
CREATE OR REPLACE FUNCTION public.sync_profile_relations_for_user(p_user_id uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = public, pg_temp
AS $function$
declare
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));

  -- Si no hay email, desactivamos current y salimos
  if v_email = '' then
    update public.profile_relations
       set is_current = false,
           updated_at = now(),
           profile_email = p_email
     where user_id = p_user_id;

    return;
  end if;

  /*
    Regla:
    - buscamos matches en sales_force_status y manager_status
    - para el mismo period_month, si hay ambos, gana sales_force
    - hacemos upsert en profile_relations
    - borramos lo que ya no exista
    - recalculamos is_current
  */

  with sales_force_matches as (
    select
      p_user_id as user_id,
      'sales_force'::text as relation_type,
      s.id as sales_force_status_id,
      null::uuid as manager_status_id,
      s.period_month::date as period_month,
      p_email as profile_email,
      s.territorio_individual::text as territorio,
      1 as priority
    from public.sales_force_status s
    where lower(trim(coalesce(s.correo_electronico, ''))) = v_email and s.is_deleted = false and s.is_active = true
  ),
  manager_matches as (
    select
      p_user_id as user_id,
      'manager'::text as relation_type,
      null::uuid as sales_force_status_id,
      m.id as manager_status_id,
      m.period_month::date as period_month,
      p_email as profile_email,
      m.territorio_manager::text as territorio,
      2 as priority
    from public.manager_status m
    where lower(trim(coalesce(m.correo_manager, ''))) = v_email and m.is_deleted = false and m.is_active = true
  ),
  all_candidates as (
    select * from sales_force_matches
    union all
    select * from manager_matches
  ),
  ranked as (
    select
      ac.*,
      row_number() over (
        partition by ac.period_month
        order by ac.priority, coalesce(ac.sales_force_status_id, ac.manager_status_id)
      ) as rn
    from all_candidates ac
  ),
  chosen as (
    select
      user_id,
      relation_type,
      sales_force_status_id,
      manager_status_id,
      period_month,
      profile_email,
      territorio
    from ranked
    where rn = 1
  )
  insert into public.profile_relations (
    user_id,
    relation_type,
    sales_force_status_id,
    manager_status_id,
    period_month,
    is_current,
    note,
    created_at,
    updated_at,
    profile_email,
    territorio
  )
  select
    c.user_id,
    c.relation_type,
    c.sales_force_status_id,
    c.manager_status_id,
    c.period_month,
    false,
    null,
    now(),
    now(),
    c.profile_email,
    c.territorio
  from chosen c
  on conflict (user_id, relation_type, period_month)
  do update set
    sales_force_status_id = excluded.sales_force_status_id,
    manager_status_id     = excluded.manager_status_id,
    profile_email         = excluded.profile_email,
    territorio            = excluded.territorio,
    updated_at            = now();

  -- Eliminar relaciones que ya no correspondan a ese usuario/email
  with sales_force_matches as (
    select
      'sales_force'::text as relation_type,
      s.period_month::date as period_month
    from public.sales_force_status s
    where lower(trim(coalesce(s.correo_electronico, ''))) = v_email and s.is_deleted = false and s.is_active = true
  ),
  manager_matches as (
    select
      'manager'::text as relation_type,
      m.period_month::date as period_month
    from public.manager_status m
    where lower(trim(coalesce(m.correo_manager, ''))) = v_email and m.is_deleted = false and m.is_active = true
      and not exists (
        select 1
        from public.sales_force_status s
        where lower(trim(coalesce(s.correo_electronico, ''))) = v_email and s.is_deleted = false and s.is_active = true
          and s.period_month::date = m.period_month::date
      )
  ),
  valid_rows as (
    select * from sales_force_matches
    union all
    select * from manager_matches
  )
  delete from public.profile_relations pr
  where pr.user_id = p_user_id
    and not exists (
      select 1
      from valid_rows vr
      where vr.relation_type = pr.relation_type
        and vr.period_month = pr.period_month
    );

  -- Reset current
  update public.profile_relations
     set is_current = false,
         updated_at = now()
   where user_id = p_user_id;

  -- Activar current en el periodo más reciente por tipo
  with latest as (
    select
      pr.user_id,
      pr.relation_type,
      max(pr.period_month) as max_period_month
    from public.profile_relations pr
    where pr.user_id = p_user_id
    group by pr.user_id, pr.relation_type
  )
  update public.profile_relations pr
     set is_current = true,
         updated_at = now()
    from latest l
   where pr.user_id = l.user_id
     and pr.relation_type = l.relation_type
     and pr.period_month = l.max_period_month;

end;
$function$
;
commit;
