import type { ImportPreviewRow } from "@/lib/admin/status/get-import-batch-preview";

type Props = {
  rows: ImportPreviewRow[];
};

export function ImportPreviewIssues({ rows }: Props) {
  const errorRows = rows.filter((row) => row.validation_errors.length > 0);
  const warningRows = rows.filter((row) => row.warnings.length > 0);
  const totalIssueRows = new Set([
    ...errorRows.map((row) => row.id),
    ...warningRows.map((row) => row.id),
  ]).size;

  if (totalIssueRows === 0) {
    return (
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="text-lg font-semibold text-emerald-800">
          Sin incidencias
        </h2>
        <p className="mt-1 text-sm text-emerald-700">
          No se detectaron errores ni advertencias en el preview.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      {errorRows.length > 0 ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
          <h2 className="text-lg font-semibold text-red-800">
            Errores ({errorRows.length})
          </h2>

          <div className="mt-4 space-y-4">
            {errorRows.map((row) => (
              <div
                key={`${row.id}-errors`}
                className="rounded-2xl border border-red-200 bg-white p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-neutral-900">
                    Fila {row.row_number}
                  </p>

                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                    {row.action_type ?? "pendiente"}
                  </span>
                </div>

                <ul className="mt-2 space-y-1 text-sm text-red-700">
                  {row.validation_errors.map((error, index) => (
                    <li key={`${row.id}-error-list-${index}`}>
                      {error.field}: {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {warningRows.length > 0 ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold text-amber-800">
            Warnings ({warningRows.length})
          </h2>

          <div className="mt-4 space-y-4">
            {warningRows.map((row) => (
              <div
                key={`${row.id}-warnings`}
                className="rounded-2xl border border-amber-200 bg-white p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-neutral-900">
                    Fila {row.row_number}
                  </p>

                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                    {row.action_type ?? "pendiente"}
                  </span>
                </div>

                <ul className="mt-2 space-y-1 text-sm text-amber-700">
                  {row.warnings.map((warning, index) => (
                    <li key={`${row.id}-warning-list-${index}`}>
                      {warning.field}: {warning.message}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
