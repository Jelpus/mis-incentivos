import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getImportBatchDetail } from "@/lib/admin/status/get-import-batch-detail";
import { getImportBatchPreview } from "@/lib/admin/status/get-import-batch-preview";

type PageProps = {
  params: Promise<{
    batchId: string;
  }>;
};

function formatPeriodLabel(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month] = value.split("-");
  return `${month}/${year}`;
}

export default async function StatusHistoryBatchDetailPage({ params }: PageProps) {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user) {
    redirect("/login");
  }

  if (isActive === false) {
    redirect("/inactive");
  }

  const isAdmin = role === "admin" || role === "super_admin";
  if (!isAdmin) {
    redirect("/");
  }

  const { batchId } = await params;
  const { batch } = await getImportBatchDetail(batchId);
  const preview = await getImportBatchPreview(batchId);

  const changedRows = preview.rows.filter((row) => row.action_type === "insert" || row.action_type === "update");
  const invalidRows = preview.rows.filter((row) => row.action_type === "invalid");

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Status / Historial / Batch</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Detalle de batch
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Archivo: {batch.file_name ?? "—"} · Período: {formatPeriodLabel(batch.period_month)}
          </p>
          <div className="mt-4 flex gap-2">
            <Link href="/admin/status/history" className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50">
              Volver al historial
            </Link>
            <Link href={`/admin/status/imports/${batchId}`} className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50">
              Abrir vista de import
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Total filas" value={preview.summary.total_rows} />
          <Kpi label="Válidas" value={preview.summary.valid_rows} />
          <Kpi label="Cambios (insert/update)" value={changedRows.length} />
          <Kpi label="Inválidas" value={invalidRows.length} />
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Cambios por registro</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Se listan filas del preview que generan insert o update.
          </p>
          <div className="mt-5 overflow-hidden rounded-3xl border border-neutral-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50">
                  <tr className="text-left text-neutral-600">
                    <th className="px-4 py-3 font-medium">Fila</th>
                    <th className="px-4 py-3 font-medium">Acción</th>
                    <th className="px-4 py-3 font-medium">Territorio</th>
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium">No. empleado</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {changedRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                        No hay filas con cambios en este batch.
                      </td>
                    </tr>
                  ) : (
                    changedRows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-4">{row.row_number}</td>
                        <td className="px-4 py-4">{row.action_type}</td>
                        <td className="px-4 py-4">{String(row.cleaned_data.territorio_individual ?? "—")}</td>
                        <td className="px-4 py-4">{String(row.cleaned_data.nombre_completo ?? "—")}</td>
                        <td className="px-4 py-4">{String(row.cleaned_data.no_empleado ?? "—")}</td>
                        <td className="px-4 py-4">{String(row.cleaned_data.correo_electronico ?? "—")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {invalidRows.length > 0 ? (
          <section className="rounded-3xl border border-red-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-red-700">Filas inválidas</h2>
            <div className="mt-4 space-y-3">
              {invalidRows.slice(0, 20).map((row) => (
                <div key={row.id} className="rounded-2xl border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-800">Fila {row.row_number}</p>
                  <ul className="mt-1 space-y-1 text-xs text-red-700">
                    {row.validation_errors.map((error, idx) => (
                      <li key={`${row.id}-${idx}`}>
                        {error.field}: {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-neutral-950">{value}</p>
    </div>
  );
}
