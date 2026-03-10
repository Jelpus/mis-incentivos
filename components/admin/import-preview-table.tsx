import type { ImportPreviewRow } from "@/lib/admin/status/get-import-batch-preview";

type Props = {
  rows: ImportPreviewRow[];
};

function actionBadgeClass(actionType: ImportPreviewRow["action_type"]) {
  switch (actionType) {
    case "insert":
      return "bg-emerald-50 text-emerald-700";
    case "update":
      return "bg-blue-50 text-blue-700";
    case "noop":
      return "bg-neutral-100 text-neutral-700";
    case "invalid":
      return "bg-red-50 text-red-700";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

function renderMiniObject(data: Record<string, unknown>) {
  const entries = Object.entries(data).filter(([, value]) => {
    return value !== null && value !== undefined && String(value) !== "";
  });

  if (entries.length === 0) {
    return <span className="text-neutral-400">—</span>;
  }

  return (
    <div className="space-y-1">
      {entries.slice(0, 6).map(([key, value]) => (
        <div key={key} className="text-xs text-neutral-700">
          <span className="font-medium text-neutral-500">{key}:</span>{" "}
          {String(value)}
        </div>
      ))}
      {entries.length > 6 ? (
        <div className="text-xs text-neutral-400">
          +{entries.length - 6} campos más
        </div>
      ) : null}
    </div>
  );
}

export function ImportPreviewTable({ rows }: Props) {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-950">
            Preview de filas
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Revisa cómo interpretó el sistema cada fila antes de aplicar el batch.
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-3xl border border-neutral-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50">
              <tr className="text-left text-neutral-600">
                <th className="px-4 py-3 font-medium">Fila</th>
                <th className="px-4 py-3 font-medium">Acción</th>
                <th className="px-4 py-3 font-medium">Raw data</th>
                <th className="px-4 py-3 font-medium">Mapped / Cleaned</th>
                <th className="px-4 py-3 font-medium">Errores</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-200 bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                    No hay filas en este batch.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-4 font-medium text-neutral-900">
                      {row.row_number}
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${actionBadgeClass(
                          row.action_type,
                        )}`}
                      >
                        {row.action_type ?? "pendiente"}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      {renderMiniObject(row.raw_data)}
                    </td>

                    <td className="px-4 py-4">
                      {renderMiniObject(
                        Object.keys(row.cleaned_data ?? {}).length > 0
                          ? row.cleaned_data
                          : row.mapped_data,
                      )}
                    </td>

                    <td className="px-4 py-4">
                      {row.validation_errors.length > 0 ? (
                        <div className="space-y-1">
                          {row.validation_errors.map((error, index) => (
                            <div
                              key={`${row.id}-validation-${index}`}
                              className="text-xs text-red-700"
                            >
                              {error.field}: {error.message}
                            </div>
                          ))}
                        </div>
                      ) : row.warnings.length > 0 ? (
                        <div className="space-y-1">
                          {row.warnings.map((warning, index) => (
                            <div
                              key={`${row.id}-warning-${index}`}
                              className="text-xs text-amber-700"
                            >
                              {warning.field}: {warning.message}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}