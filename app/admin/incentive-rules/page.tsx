import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { StatusPeriodPicker } from "@/components/admin/status-period-picker";
import { TeamRulesUpdatePanel } from "@/components/admin/team-rules-update-panel";
import { getTeamRulesPageData } from "@/lib/admin/incentive-rules/get-team-rules-page-data";
import { formatPeriodMonthForInput } from "@/lib/admin/incentive-rules/shared";

type PageProps = {
  searchParams?: Promise<{
    period?: string;
    update_period?: string;
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
  const selectedTablePeriodInput = params?.period ?? null;
  const selectedUpdatePeriodInput = params?.update_period ?? null;
  const [tableData, updateData] = await Promise.all([
    getTeamRulesPageData(selectedTablePeriodInput),
    getTeamRulesPageData(selectedUpdatePeriodInput),
  ]);

  const tablePeriodInput = formatPeriodMonthForInput(tableData.periodMonth);
  const updatePeriodInput = formatPeriodMonthForInput(updateData.periodMonth);
  const availableStatusPeriodInputs = Array.from(
    new Set(
      tableData.availableStatusPeriods.map((period) => formatPeriodMonthForInput(period)),
    ),
  );

  const teamsCargados = tableData.rows.filter((row) => row.latestVersionNo !== null).length;
  const teamsCompletos = tableData.rows.filter((row) => row.productWeightStatus === "ok").length;
  const erroresPorRevisar = tableData.rows.filter(
    (row) => row.latestVersionNo !== null && row.productWeightStatus !== "ok",
  ).length;

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
              {tablePeriodInput}
            </p>
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">Team IDs detectados</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">{tableData.totalTeams}</p>
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">Teams con reglas versionadas</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">{tableData.configuredTeams}</p>
          </div>
        </section>

        {!tableData.storageReady && tableData.storageMessage ? (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
            <h2 className="text-base font-semibold text-amber-900">Storage pendiente</h2>
            <p className="mt-1 text-sm text-amber-800">{tableData.storageMessage}</p>
            <p className="mt-2 text-sm text-amber-800">
              Referencia: <code>docs/team-incentive-rules-schema.sql</code>
            </p>
          </section>
        ) : null}

        <TeamRulesUpdatePanel
          targetPeriodMonthInput={updatePeriodInput}
          tablePeriodMonthInput={tablePeriodInput}
          availableStatusPeriods={availableStatusPeriodInputs}
          cloneContext={updateData.cloneContext}
        />

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Teams del periodo</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Detectados desde <code>sales_force_status</code> del periodo seleccionado.
              </p>
            </div>
            <StatusPeriodPicker
              value={tablePeriodInput}
              paramName="period"
              preserveParams={{ update_period: updatePeriodInput }}
              options={availableStatusPeriodInputs}
            />
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Teams cargados</p>
              <p className="mt-1 text-lg font-semibold text-neutral-900">{teamsCargados}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Teams completos</p>
              <p className="mt-1 text-lg font-semibold text-emerald-800">{teamsCompletos}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-amber-700">Errores por revisar</p>
              <p className="mt-1 text-lg font-semibold text-amber-800">{erroresPorRevisar}</p>
            </div>
          </div>

          {tableData.rows.length === 0 ? (
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
                    <th className="px-4 py-3">Evaluaciones</th>
                    <th className="px-4 py-3">Productos</th>
                    <th className="px-4 py-3">Suma prod_weight</th>
                    <th className="px-4 py-3">Version actual</th>
                    <th className="px-4 py-3">Ultima actualizacion</th>
                    <th className="px-4 py-3">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.map((row) => (
                    <tr key={row.teamId} className="border-b border-neutral-100">
                      <td className="px-4 py-3 font-medium text-neutral-900">{row.teamId}</td>
                      <td className="px-4 py-3 text-neutral-700">
                        {row.salesForceTotal} / {row.salesForceActive} / {row.salesForceVacant}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{row.rulesCount}</td>
                      <td className="max-w-[22rem] px-4 py-3 text-neutral-700">
                        {row.productNamesSummary !== "-" ? (
                          <div className="flex max-w-[22rem] flex-wrap gap-1.5">
                            {row.productNamesSummary.split(" | ").slice(0, 4).map((product) => (
                              <span
                                key={`${row.teamId}-${product}`}
                                className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700"
                                title={product}
                              >
                                <span className="max-w-[10rem] truncate">{product}</span>
                              </span>
                            ))}
                            {row.productNamesSummary.split(" | ").length > 4 ? (
                              <span
                                className="inline-flex items-center rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-700"
                                title={row.productNamesSummary}
                              >
                                +{row.productNamesSummary.split(" | ").length - 4}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.productWeightStatus === "ok" ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                            {row.productWeightSumPercent?.toFixed(2)}%
                          </span>
                        ) : row.productWeightStatus === "incomplete" ? (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                            {row.productWeightSumPercent?.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                            Sin reglas
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {row.latestVersionNo ? `v${row.latestVersionNo}` : "Sin version"}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {formatDateTime(row.latestVersionAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/incentive-rules/${encodeURIComponent(row.teamId)}?period=${tablePeriodInput}`}
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
