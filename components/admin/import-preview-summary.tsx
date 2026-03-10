type Props = {
  summary: {
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    insert_rows: number;
    update_rows: number;
    noop_rows: number;
  };
};

export function ImportPreviewSummary({ summary }: Props) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-neutral-500">Total filas</p>
        <p className="mt-2 text-3xl font-semibold text-neutral-950">
          {summary.total_rows}
        </p>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-neutral-500">Válidas</p>
        <p className="mt-2 text-3xl font-semibold text-emerald-700">
          {summary.valid_rows}
        </p>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-neutral-500">Inválidas</p>
        <p className="mt-2 text-3xl font-semibold text-red-700">
          {summary.invalid_rows}
        </p>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-neutral-500">Insert</p>
        <p className="mt-2 text-3xl font-semibold text-neutral-950">
          {summary.insert_rows}
        </p>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-neutral-500">Update</p>
        <p className="mt-2 text-3xl font-semibold text-neutral-950">
          {summary.update_rows}
        </p>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-neutral-500">Sin cambios</p>
        <p className="mt-2 text-3xl font-semibold text-neutral-950">
          {summary.noop_rows}
        </p>
      </div>
    </section>
  );
}