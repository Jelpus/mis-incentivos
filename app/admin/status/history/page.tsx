import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getStatusHistoryData } from "@/lib/admin/status/get-status-history-data";
import { formatDateTimeNoTimezoneShift } from "@/lib/date-time";

function formatPeriodLabel(value: string | null) {
  if (!value) return "-";
  const [year, month] = value.split("-");
  return `${month}/${year}`;
}

function formatDateTime(value: string) {
  return formatDateTimeNoTimezoneShift(value, "es-MX", "-");
}

export default async function StatusHistoryPage() {
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

  const batches = await getStatusHistoryData(100);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Status / Historial</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Historial de batches
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Revisa cargas masivas, su estatus y resultados por periodo.
          </p>
        </header>

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50">
                <tr className="text-left text-neutral-600">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Periodo</th>
                  <th className="px-4 py-3 font-medium">Archivo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Filas</th>
                  <th className="px-4 py-3 font-medium">Invalidas</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                      No hay batches registrados.
                    </td>
                  </tr>
                ) : (
                  batches.map((batch) => (
                    <tr key={batch.id}>
                      <td className="px-4 py-4">{formatDateTime(batch.created_at)}</td>
                      <td className="px-4 py-4">{formatPeriodLabel(batch.period_month)}</td>
                      <td className="px-4 py-4">{batch.file_name ?? "-"}</td>
                      <td className="px-4 py-4">{batch.status}</td>
                      <td className="px-4 py-4">{batch.total_rows ?? 0}</td>
                      <td className="px-4 py-4">{batch.invalid_rows ?? 0}</td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          <Link
                            href={`/admin/status/history/${batch.id}`}
                            className="rounded-xl border px-3 py-1 text-xs hover:bg-neutral-50"
                          >
                            Ver detalle
                          </Link>
                          <Link
                            href={`/admin/status/imports/${batch.id}`}
                            className="rounded-xl border px-3 py-1 text-xs hover:bg-neutral-50"
                          >
                            Abrir import
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

