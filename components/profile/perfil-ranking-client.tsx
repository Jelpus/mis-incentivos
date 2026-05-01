"use client";

import { useMemo, useState } from "react";
import type { PerfilRankingData, RankingMetricDetail, RankingPerformanceRow } from "@/lib/profile/ranking-data";
import type { RankingContestRow } from "@/lib/admin/reglas-ranking/get-ranking-contests-data";
import { formatPeriodMonthLabel } from "@/lib/admin/incentive-rules/shared";
import { formatCoveragePercent, getCoverageBadgeClass } from "@/lib/ranking/coverage";

type TabKey = "concursos" | "performance" | "ranking";
type MetricKey = "callPlanAdherence" | "ayudasVisuales" | "documentacion48h";

type Props = {
  data: PerfilRankingData;
};

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "concursos", label: "Concursos" },
  { key: "performance", label: "Performance" },
  { key: "ranking", label: "Ranking" },
];

const METRIC_LABELS: Record<MetricKey, string> = {
  callPlanAdherence: "Call Plan Adherence T1",
  ayudasVisuales: "Utilizacion de ayudas visuales",
  documentacion48h: "Documentacion en 48 hrs",
};

function formatInteger(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(value);
}

function metricFractionLabel(metric: MetricKey) {
  if (metric === "callPlanAdherence") return { numerator: "Visitas realizadas", denominator: "Visitas objetivo" };
  if (metric === "ayudasVisuales") return { numerator: "Visitas con ayuda visual", denominator: "Visitas promocionales" };
  return { numerator: "Documentadas en 48 hrs", denominator: "Total de visitas" };
}

function CoverageCell({
  metric,
  detail,
  row,
  periodMonth,
  canAudit,
  onAudit,
}: {
  metric: MetricKey;
  detail: RankingMetricDetail;
  row: RankingPerformanceRow;
  periodMonth: string | null;
  canAudit: boolean;
  onAudit: (payload: AuditPayload) => void;
}) {
  return (
    <div className="flex min-w-[170px] items-center justify-between gap-2">
      <div>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getCoverageBadgeClass(detail.coverage, detail.threshold)}`}>
          {formatCoveragePercent(detail.coverage)}
        </span>
        <p className="mt-1 text-[11px] text-[#667085]">
          Meta {formatCoveragePercent(detail.threshold)}
        </p>
      </div>
      {canAudit ? (
        <button
          type="button"
          aria-label={`Auditar ${METRIC_LABELS[metric]}`}
          onClick={() => onAudit({ metric, detail, row, periodMonth })}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#c8d7f2] bg-white text-xs font-bold text-[#1e3a8a] transition hover:bg-[#eef5ff]"
        >
          i
        </button>
      ) : null}
    </div>
  );
}

type AuditPayload = {
  metric: MetricKey;
  detail: RankingMetricDetail;
  row: RankingPerformanceRow;
  periodMonth: string | null;
};

function AuditDialog({ payload, onClose }: { payload: AuditPayload | null; onClose: () => void }) {
  if (!payload) return null;
  const labels = metricFractionLabel(payload.metric);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[#d8e3f8] bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#445f95]">Auditoria de calculo</p>
            <h3 className="mt-1 text-lg font-semibold text-[#002b7f]">{METRIC_LABELS[payload.metric]}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#d0d5dd] px-2.5 py-1 text-xs text-[#334155] hover:bg-[#f8fafc]"
          >
            Cerrar
          </button>
        </div>

        <div className="mt-4 grid gap-2 text-sm text-[#334155]">
          <p>Nombre: <span className="font-semibold">{payload.row.nombre}</span></p>
          <p>Territorio: <span className="font-semibold">{payload.row.territorio}</span></p>
          <p>Periodo usado: <span className="font-semibold">{payload.periodMonth ? formatPeriodMonthLabel(payload.periodMonth) : "-"}</span></p>
          <p>{labels.numerator}: <span className="font-semibold">{formatInteger(payload.detail.numerator)}</span></p>
          <p>{labels.denominator}: <span className="font-semibold">{formatInteger(payload.detail.denominator)}</span></p>
          <p>Resultado: <span className="font-semibold">{formatCoveragePercent(payload.detail.coverage)}</span></p>
          <p>Meta: <span className="font-semibold">{formatCoveragePercent(payload.detail.threshold)}</span></p>
        </div>
      </div>
    </div>
  );
}

function ContestReadOnlyList({ contests }: { contests: RankingContestRow[] }) {
  if (contests.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#d8e3f8] bg-[#f8fbff] p-6 text-sm text-[#667085]">
        No hay concursos de ranking configurados.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {contests.map((contest) => (
        <article key={contest.id} className="rounded-xl border border-[#e3ebfa] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[#002b7f]">{contest.contestName}</h3>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-[#eaf2ff] px-2.5 py-1 font-semibold text-[#1e3a8a]">
                  {contest.scope === "manager" ? "Manager" : "Representante"}
                </span>
                <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 font-medium text-[#475467]">
                  {contest.participationScope === "all_fdv" ? "Todos FDV" : "Grupos ranking"}
                </span>
                <span className={`rounded-full px-2.5 py-1 font-semibold ${contest.isActive ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
                  {contest.isActive ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>
            <p className="text-xs text-[#667085]">
              Pago: {contest.paymentDate ? formatPeriodMonthLabel(contest.paymentDate) : "-"}
            </p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#475467]">Componentes</p>
              <div className="mt-2 overflow-hidden rounded-lg border border-[#e3ebfa]">
                {contest.components.length === 0 ? (
                  <p className="bg-[#f8fbff] px-3 py-2 text-sm text-[#667085]">Sin componentes.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {contest.components.map((component) => (
                        <tr key={component.id} className="border-b border-[#edf2fb] last:border-0">
                          <td className="px-3 py-2 font-medium text-[#334155]">{component.name || "-"}</td>
                          <td className="px-3 py-2 text-[#667085]">Meta {component.threshold || "-"}</td>
                          <td className="px-3 py-2 text-right text-[#667085]">
                            {component.periodStart || component.periodEnd
                              ? `${component.periodStart || "-"} a ${component.periodEnd || "-"}`
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#475467]">Premios</p>
              <div className="mt-2 overflow-hidden rounded-lg border border-[#e3ebfa]">
                {contest.prizes.length === 0 ? (
                  <p className="bg-[#f8fbff] px-3 py-2 text-sm text-[#667085]">Sin premios.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {contest.prizes.map((prize) => (
                        <tr key={prize.id} className="border-b border-[#edf2fb] last:border-0">
                          <td className="w-14 px-3 py-2 font-semibold text-[#1e3a8a]">#{prize.placeNo}</td>
                          <td className="px-3 py-2 text-[#334155]">{prize.title || "-"}</td>
                          <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                            {prize.amountMxn ? `$${Number(prize.amountMxn).toLocaleString("es-MX")} MXN` : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function PerformanceTable({
  rows,
  periodMonth,
  canAudit,
}: {
  rows: RankingPerformanceRow[];
  periodMonth: string | null;
  canAudit: boolean;
}) {
  const [audit, setAudit] = useState<AuditPayload | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#d8e3f8] bg-[#f8fbff] p-6 text-sm text-[#667085]">
        No hay datos de performance para este alcance y periodo.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-[#e3ebfa]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#d8e3f8] bg-[#f8fbff] text-left text-xs uppercase tracking-[0.08em] text-[#475467]">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Territorio</th>
              <th className="px-4 py-3">Cobertura Call Plan Adherence T1</th>
              <th className="px-4 py-3">Cobertura Ayudas Visuales</th>
              <th className="px-4 py-3">Cobertura Documentacion 48 hrs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2fb] bg-white">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-[#f8fbff]">
                <td className="px-4 py-3 font-semibold text-[#1e3a8a]">{row.nombre}</td>
                <td className="px-4 py-3 text-[#334155]">{row.territorio}</td>
                <td className="px-4 py-3">
                  <CoverageCell metric="callPlanAdherence" detail={row.callPlanAdherence} row={row} periodMonth={periodMonth} canAudit={canAudit} onAudit={setAudit} />
                </td>
                <td className="px-4 py-3">
                  <CoverageCell metric="ayudasVisuales" detail={row.ayudasVisuales} row={row} periodMonth={periodMonth} canAudit={canAudit} onAudit={setAudit} />
                </td>
                <td className="px-4 py-3">
                  <CoverageCell metric="documentacion48h" detail={row.documentacion48h} row={row} periodMonth={periodMonth} canAudit={canAudit} onAudit={setAudit} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AuditDialog payload={audit} onClose={() => setAudit(null)} />
    </>
  );
}

function RankingInDevelopment() {
  return (
    <div className="rounded-xl border border-dashed border-[#d8e3f8] bg-[#f8fbff] p-8 text-center">
      <p className="text-base font-semibold text-[#1e3a8a]">Ranking en desarrollo</p>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
        La conformacion final del ranking usa reglas y agrupaciones distintas a la tabla de performance.
        Esta vista quedara disponible cuando exista el calculo oficial de posiciones por concurso.
      </p>
    </div>
  );
}

export function PerfilRankingClient({ data }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("concursos");
  const [query, setQuery] = useState("");
  const [territoryFilter, setTerritoryFilter] = useState("");

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.performanceRows.filter((row) => {
      const matchesQuery =
        !normalizedQuery ||
        `${row.nombre} ${row.territorio}`.toLowerCase().includes(normalizedQuery);
      const matchesTerritory = !territoryFilter || row.territorio === territoryFilter;
      return matchesQuery && matchesTerritory;
    });
  }, [data.performanceRows, query, territoryFilter]);

  const territories = useMemo(
    () => Array.from(new Set(data.performanceRows.map((row) => row.territorio).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
    [data.performanceRows],
  );

  return (
    <div className="mt-6 grid gap-4">
      <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">Periodo analizado</p>
            <p className="mt-1 text-lg font-semibold text-[#002b7f]">
              {data.periodMonth ? `YTD ${data.periodLabel}` : "Periodo no disponible"}
            </p>
            <p className="mt-1 text-sm text-[#667085]">
              Alcance: {data.scope === "all" ? "general" : data.scope === "manager_team" ? "equipo manager" : "individual"}
            </p>
          </div>
          {data.availablePeriods.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.availablePeriods.slice(0, 6).map((period) => (
                <span
                  key={period}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                    period === data.periodMonth
                      ? "border-[#bfd3ff] bg-[#eaf2ff] text-[#002b7f]"
                      : "border-[#d0d5dd] bg-white text-[#475467]"
                  }`}
                >
                  {formatPeriodMonthLabel(period)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {data.message ? (
        <div className="rounded-xl border border-[#fecdca] bg-[#fff6f5] p-4 text-sm text-[#7a271a]">
          {data.message}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? "border-[#002b7f] bg-[#002b7f] text-white"
                : "border-[#d0d5dd] bg-white text-[#334155] hover:bg-[#f8fafc]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab !== "concursos" ? (
        <div className="rounded-xl border border-[#e3ebfa] bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar nombre o territorio"
              className="rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm text-[#334155] outline-none focus:border-[#84adff]"
            />
            <select
              value={territoryFilter}
              onChange={(event) => setTerritoryFilter(event.target.value)}
              className="rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm text-[#334155] outline-none focus:border-[#84adff]"
            >
              <option value="">Todos los territorios</option>
              {territories.map((territory) => (
                <option key={territory} value={territory}>
                  {territory}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {activeTab === "concursos" ? (
        <ContestReadOnlyList contests={data.contestsData.contests} />
      ) : activeTab === "performance" ? (
        <PerformanceTable rows={filteredRows} periodMonth={data.periodMonth} canAudit={data.canAudit} />
      ) : (
        <RankingInDevelopment />
      )}
    </div>
  );
}
