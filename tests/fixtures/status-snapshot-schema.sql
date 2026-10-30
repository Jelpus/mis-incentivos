-- Test-only schema derived from the live catalog on 2026-10-30. No production data.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create type public.global_role_type as enum ('super_admin','admin','manager','user','viewer');
create type public.import_batch_status_type as enum ('draft','mapping_required','ready_for_preview','preview_ready','applied','cancelled','failed');
create type public.import_row_action_type as enum ('insert','update','noop','invalid');
create type public.sales_force_source_type as enum ('manual','import');
create type public.audit_action_type as enum ('create','update','delete','deactivate','reactivate','validate','apply','cancel','relink');
create type public.sales_force_history_action_type as enum ('insert','update','delete','deactivate','reactivate','relink');
create type public.sales_force_import_mode as enum ('incremental','replace_period');
create type public.sales_force_import_batch_status as enum ('draft','validated','applied','cancelled','failed');
create table public.profiles (
  "user_id" uuid not null primary key,
  "email" text,
  "first_name" text,
  "last_name" text,
  "global_role" public.global_role_type default 'user' not null,
  "is_active" boolean default true not null,
  "last_login" timestamp with time zone,
  "picture_url" text,
  "metadata" jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.import_types (
  "id" uuid default gen_random_uuid() not null primary key,
  "code" text not null,
  "name" text not null,
  "target_table" text not null,
  "description" text,
  "is_active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.import_batches (
  "id" uuid default gen_random_uuid() not null primary key,
  "import_type_id" uuid not null,
  "period_month" date,
  "file_name" text,
  "sheet_name" text,
  "header_row" integer,
  "status" public.import_batch_status_type default 'draft' not null,
  "total_rows" integer default 0 not null,
  "valid_rows" integer default 0 not null,
  "invalid_rows" integer default 0 not null,
  "insert_rows" integer default 0 not null,
  "update_rows" integer default 0 not null,
  "noop_rows" integer default 0 not null,
  "mapping_snapshot" jsonb not null,
  "preview_summary" jsonb not null,
  "metadata" jsonb not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "applied_by" uuid,
  "applied_at" timestamp with time zone
);
create table public.import_rows (
  "id" uuid default gen_random_uuid() not null primary key,
  "batch_id" uuid not null,
  "row_number" integer not null,
  "raw_data" jsonb not null,
  "cleaned_data" jsonb not null,
  "mapped_data" jsonb not null,
  "validation_errors" jsonb not null,
  "warnings" jsonb not null,
  "action_type" public.import_row_action_type,
  "target_record_id" uuid,
  "action_details" jsonb not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.sales_force_status (
  "id" uuid default gen_random_uuid() not null primary key,
  "period_month" date not null,
  "linea_principal" text not null,
  "parrilla" text not null,
  "nombre_completo" text not null,
  "no_empleado" bigint,
  "territorio_padre" text not null,
  "territorio_individual" text not null,
  "puesto" text,
  "correo_electronico" text not null,
  "ciudad" text,
  "fecha_ingreso" date,
  "team_id" text not null,
  "base_incentivos" numeric not null,
  "user_id" uuid,
  "profile_email" text,
  "is_active" boolean default true not null,
  "is_deleted" boolean default false not null,
  "deleted_at" timestamp with time zone,
  "deleted_by" uuid,
  "source_type" public.sales_force_source_type default 'manual' not null,
  "import_batch_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "created_by" uuid,
  "updated_at" timestamp with time zone default now() not null,
  "updated_by" uuid,
  "copied_from_status_id" uuid,
  "origin_period_month" date,
  "record_origin" text default 'manual' not null,
  "is_vacant" boolean default false not null,
  "manager_status_id" uuid,
  "valid_since_period" date
);
create table public.manager_status (
  "id" uuid default gen_random_uuid() not null primary key,
  "period_month" date not null,
  "territorio_manager" text not null,
  "nombre_manager" text not null,
  "correo_manager" text,
  "no_empleado_manager" bigint,
  "team_id" text,
  "is_active" boolean default true not null,
  "is_deleted" boolean default false not null,
  "source_type" text default 'import' not null,
  "import_batch_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "created_by" uuid,
  "updated_at" timestamp with time zone default now() not null,
  "updated_by" uuid,
  "is_vacant" boolean default false,
  "user_id" uuid,
  "profile_email" text
);
create table public.profile_relations (
  "id" uuid default gen_random_uuid() not null primary key,
  "user_id" uuid not null,
  "relation_type" text not null,
  "sales_force_status_id" uuid,
  "manager_status_id" uuid,
  "period_month" date not null,
  "is_current" boolean default true not null,
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "profile_email" text,
  "territorio" text
);
create table public.audit_logs (
  "id" uuid default gen_random_uuid() not null primary key,
  "entity_name" text not null,
  "entity_id" uuid,
  "action_type" public.audit_action_type not null,
  "actor_user_id" uuid,
  "actor_email" text,
  "metadata" jsonb not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.sales_force_status_history (
  "history_id" uuid default gen_random_uuid() not null primary key,
  "sales_force_status_id" uuid not null,
  "action_type" public.sales_force_history_action_type not null,
  "snapshot" jsonb not null,
  "changed_fields" jsonb not null,
  "reason" text,
  "changed_at" timestamp with time zone default now() not null,
  "changed_by" uuid,
  "import_batch_id" uuid
);
create table public.sales_force_import_batches (
  "id" uuid default gen_random_uuid() not null primary key,
  "period_month" date not null,
  "file_name" text,
  "import_mode" public.sales_force_import_mode default 'incremental' not null,
  "status" public.sales_force_import_batch_status default 'draft' not null,
  "total_rows" integer default 0 not null,
  "valid_rows" integer default 0 not null,
  "invalid_rows" integer default 0 not null,
  "insert_count" integer default 0 not null,
  "update_count" integer default 0 not null,
  "noop_count" integer default 0 not null,
  "skip_count" integer default 0 not null,
  "validation_summary" jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "created_by" uuid,
  "applied_at" timestamp with time zone,
  "applied_by" uuid
);
alter table public.manager_status add constraint "manager_status_correo_not_blank_chk" CHECK (((correo_manager IS NULL) OR (length(TRIM(BOTH FROM correo_manager)) > 0)));
alter table public.manager_status add constraint "manager_status_nombre_not_blank_chk" CHECK ((length(TRIM(BOTH FROM nombre_manager)) > 0));
alter table public.manager_status add constraint "manager_status_period_month_first_day_chk" CHECK ((period_month = (date_trunc('month'::text, (period_month)::timestamp with time zone))::date));
alter table public.manager_status add constraint "manager_status_source_type_chk" CHECK ((source_type = ANY (ARRAY['import'::text, 'manual'::text, 'copied_forward'::text])));
alter table public.manager_status add constraint "manager_status_territorio_not_blank_chk" CHECK ((length(TRIM(BOTH FROM territorio_manager)) > 0));
alter table public.manager_status add constraint "manager_status_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;
alter table public.profile_relations add constraint "profile_relations_fk_consistency_chk" CHECK ((((relation_type = 'sales_force'::text) AND (sales_force_status_id IS NOT NULL) AND (manager_status_id IS NULL)) OR ((relation_type = 'manager'::text) AND (manager_status_id IS NOT NULL) AND (sales_force_status_id IS NULL))));
alter table public.profile_relations add constraint "profile_relations_manager_status_id_fkey" FOREIGN KEY (manager_status_id) REFERENCES manager_status(id) ON DELETE SET NULL;
alter table public.profile_relations add constraint "profile_relations_relation_type_check" CHECK ((relation_type = ANY (ARRAY['sales_force'::text, 'manager'::text])));
alter table public.profile_relations add constraint "profile_relations_sales_force_status_id_fkey" FOREIGN KEY (sales_force_status_id) REFERENCES sales_force_status(id) ON DELETE SET NULL;
alter table public.profile_relations add constraint "profile_relations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
alter table public.sales_force_status add constraint "sales_force_status_base_incentivos_chk" CHECK ((base_incentivos >= (0)::numeric));
alter table public.sales_force_status add constraint "sales_force_status_ciudad_not_blank_chk" CHECK (((ciudad IS NULL) OR (length(TRIM(BOTH FROM ciudad)) > 0)));
alter table public.sales_force_status add constraint "sales_force_status_copied_from_status_id_fkey" FOREIGN KEY (copied_from_status_id) REFERENCES sales_force_status(id) ON DELETE SET NULL;
alter table public.sales_force_status add constraint "sales_force_status_correo_electronico_required_unless_vacant_ch" CHECK (((is_vacant = true) OR (length(TRIM(BOTH FROM COALESCE(correo_electronico, ''::text))) > 0)));
alter table public.sales_force_status add constraint "sales_force_status_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(user_id) ON DELETE SET NULL;
alter table public.sales_force_status add constraint "sales_force_status_deleted_by_fkey" FOREIGN KEY (deleted_by) REFERENCES profiles(user_id) ON DELETE SET NULL;
alter table public.sales_force_status add constraint "sales_force_status_import_batch_id_fkey" FOREIGN KEY (import_batch_id) REFERENCES sales_force_import_batches(id) ON DELETE SET NULL;
alter table public.sales_force_status add constraint "sales_force_status_linea_principal_not_blank_chk" CHECK ((length(TRIM(BOTH FROM linea_principal)) > 0));
alter table public.sales_force_status add constraint "sales_force_status_manager_status_id_fkey" FOREIGN KEY (manager_status_id) REFERENCES manager_status(id) ON DELETE SET NULL;
alter table public.sales_force_status add constraint "sales_force_status_no_empleado_required_unless_vacant_chk" CHECK (((is_vacant = true) OR ((no_empleado IS NOT NULL) AND (no_empleado > 0))));
alter table public.sales_force_status add constraint "sales_force_status_nombre_completo_not_blank_chk" CHECK ((length(TRIM(BOTH FROM nombre_completo)) > 0));
alter table public.sales_force_status add constraint "sales_force_status_parrilla_not_blank_chk" CHECK ((length(TRIM(BOTH FROM parrilla)) > 0));
alter table public.sales_force_status add constraint "sales_force_status_period_month_first_day_chk" CHECK ((period_month = (date_trunc('month'::text, (period_month)::timestamp with time zone))::date));
alter table public.sales_force_status add constraint "sales_force_status_puesto_not_blank_chk" CHECK (((puesto IS NULL) OR (length(btrim(puesto)) > 0)));
alter table public.sales_force_status add constraint "sales_force_status_record_origin_chk" CHECK ((record_origin = ANY (ARRAY['manual'::text, 'import'::text, 'copied_forward'::text])));
alter table public.sales_force_status add constraint "sales_force_status_team_id_not_blank_chk" CHECK ((length(TRIM(BOTH FROM team_id)) > 0));
alter table public.sales_force_status add constraint "sales_force_status_territorio_individual_not_blank_chk" CHECK ((length(TRIM(BOTH FROM territorio_individual)) > 0));
alter table public.sales_force_status add constraint "sales_force_status_territorio_padre_not_blank_chk" CHECK ((length(TRIM(BOTH FROM territorio_padre)) > 0));
alter table public.sales_force_status add constraint "sales_force_status_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(user_id) ON DELETE SET NULL;
alter table public.sales_force_status add constraint "sales_force_status_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION public.first_day_of_month(p_date date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select date_trunc('month', p_date)::date
$function$
;
CREATE OR REPLACE FUNCTION public.jsonb_diff_val(old_data jsonb, new_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  result jsonb := '{}'::jsonb;
  k text;
  old_v jsonb;
  new_v jsonb;
begin
  if old_data is null then
    old_data := '{}'::jsonb;
  end if;

  if new_data is null then
    new_data := '{}'::jsonb;
  end if;

  for k in
    select key
    from (
      select jsonb_object_keys(old_data) as key
      union
      select jsonb_object_keys(new_data) as key
    ) s
  loop
    old_v := old_data -> k;
    new_v := new_data -> k;

    if old_v is distinct from new_v then
      result := result || jsonb_build_object(
        k,
        jsonb_build_object(
          'old', old_v,
          'new', new_v
        )
      );
    end if;
  end loop;

  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_email is null then null
    else lower(trim(p_email))
  end
$function$
;
CREATE OR REPLACE FUNCTION public.recompute_profile_global_role(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_current_role public.global_role_type;
  v_has_sales_force boolean;
  v_has_manager boolean;
  v_target_role public.global_role_type;
begin
  if p_user_id is null then
    return;
  end if;

  select p.global_role
    into v_current_role
  from public.profiles p
  where p.user_id = p_user_id;

  if not found then
    return;
  end if;

  -- Nunca tocar roles administrativos
  if v_current_role in ('super_admin', 'admin') then
    return;
  end if;

  select exists (
    select 1
    from public.manager_status m
    where m.user_id = p_user_id
      and coalesce(m.is_deleted, false) = false
      and coalesce(m.is_active, true) = true
  )
  into v_has_manager;

  select exists (
    select 1
    from public.sales_force_status s
    where s.user_id = p_user_id
      and coalesce(s.is_deleted, false) = false
      and coalesce(s.is_active, true) = true
  )
  into v_has_sales_force;

  v_target_role :=
    case
      when v_has_manager then 'manager'::public.global_role_type
      when v_has_sales_force then 'user'::public.global_role_type
      else 'viewer'::public.global_role_type
    end;

  if v_target_role is distinct from v_current_role then
    update public.profiles
    set global_role = v_target_role
    where user_id = p_user_id;
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_profile_relations_for_email(p_email text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  r record;
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));

  if v_email = '' then
    return;
  end if;

  for r in
    select p.user_id, p.email
    from public.profiles p
    where lower(trim(coalesce(p.email, ''))) = v_email
  loop
    perform public.sync_profile_relations_for_user(r.user_id, r.email);
  end loop;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_profile_relations_for_user(p_user_id uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
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
    where lower(trim(coalesce(s.correo_electronico, ''))) = v_email
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
    where lower(trim(coalesce(m.correo_manager, ''))) = v_email
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
        order by ac.priority
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
    where lower(trim(coalesce(s.correo_electronico, ''))) = v_email
  ),
  manager_matches as (
    select
      'manager'::text as relation_type,
      m.period_month::date as period_month
    from public.manager_status m
    where lower(trim(coalesce(m.correo_manager, ''))) = v_email
      and not exists (
        select 1
        from public.sales_force_status s
        where lower(trim(coalesce(s.correo_electronico, ''))) = v_email
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
CREATE OR REPLACE FUNCTION public.audit_sales_force_status_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid;
  v_changed_fields jsonb;
  v_action public.sales_force_history_action_type;
begin
  v_actor := auth.uid();

  if tg_op = 'INSERT' then
    v_action := 'insert';

    insert into public.sales_force_status_history (
      sales_force_status_id,
      action_type,
      snapshot,
      changed_fields,
      changed_by,
      import_batch_id
    )
    values (
      new.id,
      v_action,
      to_jsonb(new),
      '{}'::jsonb,
      coalesce(new.created_by, v_actor),
      new.import_batch_id
    );

    insert into public.audit_logs (
      entity_name,
      entity_id,
      action_type,
      actor_user_id,
      actor_email,
      metadata
    )
    values (
      'sales_force_status',
      new.id,
      'create',
      coalesce(new.created_by, v_actor),
      (select email from public.profiles where user_id = coalesce(new.created_by, v_actor)),
      jsonb_build_object(
        'period_month', new.period_month,
        'correo_electronico', new.correo_electronico,
        'no_empleado', new.no_empleado,
        'territorio_individual', new.territorio_individual
      )
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_changed_fields := public.jsonb_diff_val(to_jsonb(old), to_jsonb(new));

    if v_changed_fields <> '{}'::jsonb then
      v_action := case
        when old.is_deleted = false and new.is_deleted = true then 'delete'::public.sales_force_history_action_type
        when old.is_active = true and new.is_active = false then 'deactivate'::public.sales_force_history_action_type
        when old.is_active = false and new.is_active = true then 'reactivate'::public.sales_force_history_action_type
        when old.user_id is distinct from new.user_id then 'relink'::public.sales_force_history_action_type
        else 'update'::public.sales_force_history_action_type
      end;

      insert into public.sales_force_status_history (
        sales_force_status_id,
        action_type,
        snapshot,
        changed_fields,
        changed_by,
        import_batch_id
      )
      values (
        new.id,
        v_action,
        to_jsonb(new),
        v_changed_fields,
        coalesce(new.updated_by, v_actor),
        new.import_batch_id
      );

      insert into public.audit_logs (
        entity_name,
        entity_id,
        action_type,
        actor_user_id,
        actor_email,
        metadata
      )
      values (
        'sales_force_status',
        new.id,
        case
          when old.is_deleted = false and new.is_deleted = true then 'delete'::public.audit_action_type
          when old.is_active = true and new.is_active = false then 'deactivate'::public.audit_action_type
          when old.is_active = false and new.is_active = true then 'reactivate'::public.audit_action_type
          else 'update'::public.audit_action_type
        end,
        coalesce(new.updated_by, v_actor),
        (select email from public.profiles where user_id = coalesce(new.updated_by, v_actor)),
        jsonb_build_object(
          'period_month', new.period_month,
          'correo_electronico', new.correo_electronico,
          'no_empleado', new.no_empleado,
          'changes', v_changed_fields
        )
      );
    end if;

    return new;
  end if;

  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.link_manager_status_to_profile()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_profile public.profiles%rowtype;
begin
  new.user_id := null;
  new.profile_email := null;

  if new.correo_manager is null or length(trim(new.correo_manager)) = 0 then
    return new;
  end if;

  select p.*
    into v_profile
  from public.profiles p
  where normalize_email(p.email) = normalize_email(new.correo_manager)
  limit 1;

  if found then
    new.user_id := v_profile.user_id;
    new.profile_email := v_profile.email;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.link_sales_force_status_to_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_email text;
begin
  v_email := public.normalize_email(new.correo_electronico);

  if v_email is not null then
    select p.user_id
      into v_user_id
    from public.profiles p
    where public.normalize_email(p.email) = v_email
    limit 1;

    if v_user_id is not null then
      new.user_id := v_user_id;
      new.profile_email := v_email;
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_recompute_profile_role_from_manager_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null then
      perform public.recompute_profile_global_role(new.user_id);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id is not null then
      perform public.recompute_profile_global_role(new.user_id);
    end if;

    if old.user_id is not null
       and old.user_id is distinct from new.user_id then
      perform public.recompute_profile_global_role(old.user_id);
    elsif old.user_id is not null
          and (
            old.is_active is distinct from new.is_active
            or old.is_deleted is distinct from new.is_deleted
          ) then
      perform public.recompute_profile_global_role(old.user_id);
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.user_id is not null then
      perform public.recompute_profile_global_role(old.user_id);
    end if;
    return old;
  end if;

  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_recompute_profile_role_from_sales_force_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null then
      perform public.recompute_profile_global_role(new.user_id);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id is not null then
      perform public.recompute_profile_global_role(new.user_id);
    end if;

    if old.user_id is not null
       and old.user_id is distinct from new.user_id then
      perform public.recompute_profile_global_role(old.user_id);
    elsif old.user_id is not null
          and (
            old.is_active is distinct from new.is_active
            or old.is_deleted is distinct from new.is_deleted
          ) then
      perform public.recompute_profile_global_role(old.user_id);
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.user_id is not null then
      perform public.recompute_profile_global_role(old.user_id);
    end if;
    return old;
  end if;

  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_sales_force_status_normalize()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.correo_electronico := public.normalize_email(new.correo_electronico);
  new.profile_email := public.normalize_email(new.profile_email);
  new.period_month := public.first_day_of_month(new.period_month);

  new.linea_principal := trim(new.linea_principal);
  new.parrilla := trim(new.parrilla);
  new.nombre_completo := trim(new.nombre_completo);
  new.territorio_padre := trim(new.territorio_padre);
  new.territorio_individual := trim(new.territorio_individual);
  new.puesto := trim(new.puesto);
  new.ciudad := trim(new.ciudad);
  new.team_id := trim(new.team_id);

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_set_manager_status_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.manager_status_id := null;

  if new.period_month is not null
     and new.territorio_padre is not null
     and length(trim(new.territorio_padre)) > 0 then

    select m.id
      into new.manager_status_id
    from public.manager_status m
    where m.period_month = new.period_month
      and m.territorio_manager = new.territorio_padre
      and coalesce(m.is_deleted, false) = false
    order by m.created_at desc, m.id desc
    limit 1;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_sync_profile_relations_from_manager_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' then
    perform public.sync_profile_relations_for_email(old.correo_manager);
    return old;
  end if;

  perform public.sync_profile_relations_for_email(new.correo_manager);

  if tg_op = 'UPDATE'
     and lower(trim(coalesce(old.correo_manager, '')))
         <> lower(trim(coalesce(new.correo_manager, '')))
  then
    perform public.sync_profile_relations_for_email(old.correo_manager);
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_sync_profile_relations_from_sales_force_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' then
    perform public.sync_profile_relations_for_email(old.correo_electronico);
    return old;
  end if;

  perform public.sync_profile_relations_for_email(new.correo_electronico);

  if tg_op = 'UPDATE'
     and lower(trim(coalesce(old.correo_electronico, '')))
         <> lower(trim(coalesce(new.correo_electronico, '')))
  then
    perform public.sync_profile_relations_for_email(old.correo_electronico);
  end if;

  return new;
end;
$function$
;
CREATE TRIGGER trg_audit_sales_force_status_changes AFTER INSERT OR UPDATE ON public.sales_force_status FOR EACH ROW EXECUTE FUNCTION audit_sales_force_status_changes();
CREATE TRIGGER trg_link_manager_status_to_profile BEFORE INSERT OR UPDATE OF correo_manager ON public.manager_status FOR EACH ROW EXECUTE FUNCTION link_manager_status_to_profile();
CREATE TRIGGER trg_link_sales_force_status_to_profile BEFORE INSERT OR UPDATE OF correo_electronico ON public.sales_force_status FOR EACH ROW EXECUTE FUNCTION link_sales_force_status_to_profile();
CREATE TRIGGER trg_manager_status_set_updated_at BEFORE UPDATE ON public.manager_status FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recompute_profile_role_from_manager_status AFTER INSERT OR DELETE OR UPDATE OF user_id, is_active, is_deleted ON public.manager_status FOR EACH ROW EXECUTE FUNCTION tg_recompute_profile_role_from_manager_status();
CREATE TRIGGER trg_recompute_profile_role_from_sales_force_status AFTER INSERT OR DELETE OR UPDATE OF user_id, is_active, is_deleted ON public.sales_force_status FOR EACH ROW EXECUTE FUNCTION tg_recompute_profile_role_from_sales_force_status();
CREATE TRIGGER trg_sales_force_status_normalize BEFORE INSERT OR UPDATE ON public.sales_force_status FOR EACH ROW EXECUTE FUNCTION tg_sales_force_status_normalize();
CREATE TRIGGER trg_sales_force_status_set_manager_status_id BEFORE INSERT OR UPDATE OF period_month, territorio_padre ON public.sales_force_status FOR EACH ROW EXECUTE FUNCTION tg_set_manager_status_id();
CREATE TRIGGER trg_sales_force_status_set_updated_at BEFORE UPDATE ON public.sales_force_status FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_profile_relations_from_manager_status AFTER INSERT OR DELETE OR UPDATE OF correo_manager, territorio_manager, period_month ON public.manager_status FOR EACH ROW EXECUTE FUNCTION tg_sync_profile_relations_from_manager_status();
CREATE TRIGGER trg_sync_profile_relations_from_sales_force_status AFTER INSERT OR DELETE OR UPDATE OF correo_electronico, territorio_individual, period_month ON public.sales_force_status FOR EACH ROW EXECUTE FUNCTION tg_sync_profile_relations_from_sales_force_status();

CREATE INDEX idx_manager_status_email_normalized ON public.manager_status USING btree (normalize_email(correo_manager));
CREATE INDEX idx_manager_status_period_month ON public.manager_status USING btree (period_month);
CREATE INDEX idx_manager_status_territorio_manager ON public.manager_status USING btree (territorio_manager);
CREATE INDEX idx_manager_status_user_id ON public.manager_status USING btree (user_id);
CREATE INDEX idx_profile_relations_manager ON public.profile_relations USING btree (manager_status_id);
CREATE INDEX idx_profile_relations_period ON public.profile_relations USING btree (period_month);
CREATE INDEX idx_profile_relations_profile_email ON public.profile_relations USING btree (lower(profile_email));
CREATE INDEX idx_profile_relations_sales_force ON public.profile_relations USING btree (sales_force_status_id);
CREATE INDEX idx_sales_force_status_copied_from_status_id ON public.sales_force_status USING btree (copied_from_status_id);
CREATE INDEX idx_sales_force_status_email_normalized ON public.sales_force_status USING btree (normalize_email(correo_electronico));
CREATE INDEX idx_sales_force_status_linea_principal ON public.sales_force_status USING btree (linea_principal);
CREATE INDEX idx_sales_force_status_manager_status_id ON public.sales_force_status USING btree (manager_status_id);
CREATE INDEX idx_sales_force_status_no_empleado ON public.sales_force_status USING btree (no_empleado);
CREATE INDEX idx_sales_force_status_origin_period_month ON public.sales_force_status USING btree (origin_period_month);
CREATE INDEX idx_sales_force_status_period_month ON public.sales_force_status USING btree (period_month);
CREATE INDEX idx_sales_force_status_record_origin ON public.sales_force_status USING btree (record_origin);
CREATE INDEX idx_sales_force_status_team_id ON public.sales_force_status USING btree (team_id);
CREATE INDEX idx_sales_force_status_territorio_individual ON public.sales_force_status USING btree (territorio_individual);
CREATE INDEX idx_sales_force_status_user_id ON public.sales_force_status USING btree (user_id);
CREATE UNIQUE INDEX ux_manager_status_period_territorio_active ON public.manager_status USING btree (period_month, territorio_manager) WHERE (is_deleted = false);
CREATE UNIQUE INDEX ux_profile_relations_user_type_current ON public.profile_relations USING btree (user_id, relation_type) WHERE (is_current = true);
CREATE UNIQUE INDEX ux_profile_relations_user_type_period ON public.profile_relations USING btree (user_id, relation_type, period_month);
CREATE UNIQUE INDEX ux_sales_force_status_period_no_empleado_active ON public.sales_force_status USING btree (period_month, no_empleado) WHERE (is_deleted = false);
CREATE UNIQUE INDEX ux_sales_force_status_period_territorio_individual_active ON public.sales_force_status USING btree (period_month, territorio_individual) WHERE (is_deleted = false);
