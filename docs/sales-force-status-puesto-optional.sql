begin;

alter table public.sales_force_status
  alter column puesto drop not null;

comment on column public.sales_force_status.puesto is
  'Puesto opcional. Las importaciones sin esta columna conservan el valor existente al actualizar.';

commit;
