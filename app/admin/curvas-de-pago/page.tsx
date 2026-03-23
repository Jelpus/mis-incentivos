import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getPayCurvesListData } from "@/lib/admin/pay-curves/get-pay-curves-data";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function CurvasDePagoPage() {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user) {
    redirect("/login");
  }

  if (isActive === false) {
    redirect("/inactive");
  }

  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin" || isSuperAdmin;

  if (!isAdmin) {
    redirect("/");
  }

  const listData = await getPayCurvesListData();

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">Admin / Curvas de Pago</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
                Catalogo de curvas de pago
              </h1>
              <p className="mt-2 max-w-4xl text-sm text-neutral-600">
                Lista de curvas disponibles para el calculo de incentivos. Desde aqui puedes crear
                nuevas curvas o editar una existente.
              </p>
            </div>
            <Link
              href="/admin/curvas-de-pago/nueva"
              className="inline-flex items-center rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Agregar nueva curva
            </Link>
          </div>
        </header>

        {!listData.ok ? (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
            <h2 className="text-base font-semibold text-amber-900">Catalogo no disponible</h2>
            <p className="mt-1 text-sm text-amber-800">{listData.message}</p>
          </section>
        ) : listData.rows.length === 0 ? (
          <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-neutral-600">
              Aun no hay curvas registradas. Crea la primera curva para comenzar.
            </p>
          </section>
        ) : (
          <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Codigo</th>
                    <th className="px-4 py-3">Puntos</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Actualizado</th>
                    <th className="px-4 py-3">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {listData.rows.map((row) => (
                    <tr key={row.id} className="border-b border-neutral-100">
                      <td className="px-4 py-3">
                        <p className="font-medium text-neutral-900">{row.name}</p>
                        {row.description ? (
                          <p className="mt-0.5 max-w-[26rem] truncate text-xs text-neutral-500">
                            {row.description}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{row.code}</td>
                      <td className="px-4 py-3 text-neutral-700">{row.pointsCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            Activa
                          </span>
                          {row.isHidden ? (
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                              Oculta
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{formatDateTime(row.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/curvas-de-pago/${encodeURIComponent(row.id)}/editar`}
                          className="inline-flex items-center rounded-xl border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
                        >
                          Editar
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
