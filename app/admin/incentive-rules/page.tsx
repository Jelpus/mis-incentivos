import Link from "next/link";
import { StatusPeriodPicker } from "@/components/admin/status-period-picker";
import { TeamRulesUpdatePanel } from "@/components/admin/team-rules-update-panel";
import { getTeamRulesPageFastData } from "@/lib/admin/incentive-rules/get-team-rules-page-data-fast";
import { formatPeriodMonthForInput } from "@/lib/admin/incentive-rules/shared";
import { formatDateTimeNoTimezoneShift } from "@/lib/date-time";

type PageProps = {
  searchParams?: Promise<{
    period?: string;
    update_period?: string;
  }>;
};

function formatDateTime(value: string | null) {
  return formatDateTimeNoTimezoneShift(value, "es-MX", "-");
}

export default async function IncentiveRulesPage({ searchParams }: PageProps) {
  // Admin auth check already happens in app/admin/layout.tsx.

  const params = searchParams ? await searchParams : {};
  const selectedTablePeriodInput = params?.period ?? null;
  const selectedUpdatePeriodInput = params?.update_period ?? null;
  const tableData = await getTeamRulesPageFastData(selectedTablePeriodInput);
  const updateData =
    !selectedUpdatePeriodInput ||
    selectedUpdatePeriodInput === selectedTablePeriodInput
      ? tableData
      : await getTeamRulesPageFastData(selectedUpdatePeriodInput);

  const tablePeriodInput = formatPeriodMonthForInput(tableData.periodMonth);
  const updatePeriodInput = formatPeriodMonthForInput(updateData.periodMonth);
  const availableStatusPeriodInputs = Array.from(
    new Set(
      tableData.availableStatusPeriods.map((period) => formatPeriodMonthForInput(period)),
    ),
  );

  const teamsCargados = tableData.rows.filter((row) => row.latestVersionNo !== null).length;
  const teamsPendientes = tableData.rows.filter((row) => row.latestVersionNo === null).length;
  const MAX_ROWS_RENDER = 400;
  const rowsToRender = tableData.rows.slice(0, MAX_ROWS_RENDER);
  const hasTruncatedRows = tableData.rows.length > rowsToRender.length;

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
              <p className="text-xs uppercase tracking-wide text-emerald-700">Teams con version</p>
              <p className="mt-1 text-lg font-semibold text-emerald-800">{teamsCargados}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-amber-700">Teams pendientes</p>
              <p className="mt-1 text-lg font-semibold text-amber-800">{teamsPendientes}</p>
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
                    <th className="px-4 py-3">Items de regla</th>
                    <th className="px-4 py-3">Version actual</th>
                    <th className="px-4 py-3">Ultima actualizacion</th>
                    <th className="px-4 py-3">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsToRender.map((row) => (
                    <tr key={row.teamId} className="border-b border-neutral-100">
                      <td className="px-4 py-3 font-medium text-neutral-900">{row.teamId}</td>
                      <td className="px-4 py-3 text-neutral-700">
                        {row.salesForceTotal} / {row.salesForceActive} / {row.salesForceVacant}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{row.rulesCount}</td>
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
          {hasTruncatedRows ? (
            <p className="mt-3 text-xs text-neutral-500">
              Mostrando {rowsToRender.length} de {tableData.rows.length} teams para respuesta rapida.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

