import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { StatusPeriodPicker } from "@/components/admin/status-period-picker";
import { getTeamRulesPageData } from "@/lib/admin/incentive-rules/get-team-rules-page-data";
import { formatPeriodMonthForInput } from "@/lib/admin/incentive-rules/shared";

type PageProps = {
  searchParams?: Promise<{
    period?: string;
  }>;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function IncentiveRulesPage({ searchParams }: PageProps) {
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

  const params = searchParams ? await searchParams : {};
  const selectedPeriodInput = params?.period ?? null;
  const data = await getTeamRulesPageData(selectedPeriodInput);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Incentive Rules</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Reglas de incentivos por Team ID
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">
            Base para versionar reglas por team_id y periodo. Cada team comparte la misma
            logica de plan dentro del periodo seleccionado.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">Periodo seleccionado</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {formatPeriodMonthForInput(data.periodMonth)}
            </p>
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">Team IDs detectados</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">{data.totalTeams}</p>
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">Teams con reglas versionadas</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">{data.configuredTeams}</p>
          </div>
        </section>

        {!data.storageReady && data.storageMessage ? (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
            <h2 className="text-base font-semibold text-amber-900">Storage pendiente</h2>
            <p className="mt-1 text-sm text-amber-800">{data.storageMessage}</p>
            <p className="mt-2 text-sm text-amber-800">
              Referencia: <code>docs/team-incentive-rules-schema.sql</code>
            </p>
          </section>
        ) : null}

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Teams del periodo</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Detectados desde <code>sales_force_status</code> del periodo seleccionado.
              </p>
            </div>
            <StatusPeriodPicker value={formatPeriodMonthForInput(data.periodMonth)} />
          </div>

          {data.rows.length === 0 ? (
            <p className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              No se encontraron team_id en status para este periodo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-3">Team ID</th>
                    <th className="px-4 py-3">SVA (total/activos/vacantes)</th>
                    <th className="px-4 py-3">Version actual</th>
                    <th className="px-4 py-3">Ultima actualizacion</th>
                    <th className="px-4 py-3">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.teamId} className="border-b border-neutral-100">
                      <td className="px-4 py-3 font-medium text-neutral-900">{row.teamId}</td>
                      <td className="px-4 py-3 text-neutral-700">
                        {row.salesForceTotal} / {row.salesForceActive} / {row.salesForceVacant}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {row.latestVersionNo ? `v${row.latestVersionNo}` : "Sin version"}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {formatDateTime(row.latestVersionAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/incentive-rules/${encodeURIComponent(row.teamId)}?period=${formatPeriodMonthForInput(data.periodMonth)}`}
                          className="inline-flex items-center rounded-xl border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
                        >
                          Configurar
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
