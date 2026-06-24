create table if not exists public.ranking_point_adjustments (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  territory text not null,
  product_name text not null,
  delta_points numeric not null default 0,
  reason text null,
  is_active boolean not null default true,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ranking_point_adjustments_unique_key unique (period_month, territory, product_name),
  constraint ranking_point_adjustments_territory_chk check (length(trim(territory)) > 0),
  constraint ranking_point_adjustments_product_chk check (length(trim(product_name)) > 0)
);

create index if not exists ranking_point_adjustments_active_idx
  on public.ranking_point_adjustments (is_active, period_month, territory, product_name);

create table if not exists public.ranking_point_adjustment_audit (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid null,
  action text not null check (action in ('insert', 'update', 'delete')),
  previous_data jsonb null,
  new_data jsonb null,
  changed_by uuid null,
  changed_at timestamptz not null default now()
);

create index if not exists ranking_point_adjustment_audit_adjustment_idx
  on public.ranking_point_adjustment_audit (adjustment_id, changed_at desc);

create index if not exists ranking_point_adjustment_audit_changed_at_idx
  on public.ranking_point_adjustment_audit (changed_at desc);

create or replace function public.set_ranking_point_adjustments_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ranking_point_adjustments_updated_at
  on public.ranking_point_adjustments;

create trigger trg_ranking_point_adjustments_updated_at
before update on public.ranking_point_adjustments
for each row execute procedure public.set_ranking_point_adjustments_updated_at();

create or replace function public.audit_ranking_point_adjustments()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ranking_point_adjustment_audit (
      adjustment_id,
      action,
      previous_data,
      new_data,
      changed_by
    )
    values (
      new.id,
      'insert',
      null,
      to_jsonb(new),
      coalesce(new.updated_by, new.created_by)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.ranking_point_adjustment_audit (
      adjustment_id,
      action,
      previous_data,
      new_data,
      changed_by
    )
    values (
      new.id,
      'update',
      to_jsonb(old),
      to_jsonb(new),
      coalesce(new.updated_by, new.created_by, old.updated_by, old.created_by)
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.ranking_point_adjustment_audit (
      adjustment_id,
      action,
      previous_data,
      new_data,
      changed_by
    )
    values (
      old.id,
      'delete',
      to_jsonb(old),
      null,
      coalesce(old.updated_by, old.created_by)
    );
    return old;
  end if;

  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_ranking_point_adjustments_audit
  on public.ranking_point_adjustments;

create trigger trg_ranking_point_adjustments_audit
after insert or update or delete on public.ranking_point_adjustments
for each row execute procedure public.audit_ranking_point_adjustments();
