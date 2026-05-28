"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { PerfilRankingData, RankingMetricDetail, RankingPerformanceRow } from "@/lib/profile/ranking-data";
import type { RankingContestRow } from "@/lib/admin/reglas-ranking/get-ranking-contests-data";
import { formatPeriodMonthLabel } from "@/lib/admin/incentive-rules/shared";
import { formatCoveragePercent, getCoverageBadgeClass } from "@/lib/ranking/coverage";
import { RankingConcurso } from "@/components/ranking/RankingConcurso";

type TabKey = "concursos" | "performance" | "ranking";
type MetricKey = "callPlanAdherence" | "coberturaCpd" | "ayudasVisuales" | "documentacion48h";

type Props = {
  data: PerfilRankingData;
  initialTab?: TabKey;
};

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "concursos", label: "Concursos" },
  { key: "performance", label: "Performance" },
  { key: "ranking", label: "Ranking" },
];

const METRIC_LABELS: Record<MetricKey, string> = {
  callPlanAdherence: "Call Plan Adherence T1",
  coberturaCpd: "Cobertura CPD",
  ayudasVisuales: "Utilizacion de ayudas visuales",
  documentacion48h: "Documentacion en 48 hrs",
};

function formatInteger(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(value);
}

function metricFractionLabel(metric: MetricKey) {
  if (metric === "callPlanAdherence") return { numerator: "Visitas realizadas", denominator: "Visitas objetivo" };
  if (metric === "coberturaCpd") return { numerator: "CPD", denominator: "Objetivo CPD" };
  if (metric === "ayudasVisuales") return { numerator: "Visitas con ayuda visual", denominator: "Total de visitas" };
  return { numerator: "Documentadas en 48 hrs", denominator: "Total de visitas" };
}

function formatMetricNumber(value: number, metric: MetricKey) {
  if (metric === "coberturaCpd") {
    return new Intl.NumberFormat("es-MX", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return formatInteger(value);
}

function formatPerformanceSelectionLabel(params: {
  mode: "ytd" | "custom";
  selectedPeriods: string[];
  periodLabel: string;
}) {
  if (params.selectedPeriods.length === 0) return "Periodo no disponible";
  if (params.mode === "ytd") return `YTD ${params.periodLabel}`;
  if (params.selectedPeriods.length === 1) return formatPeriodMonthLabel(params.selectedPeriods[0]);
  const first = params.selectedPeriods[0];
  const last = params.selectedPeriods[params.selectedPeriods.length - 1];
  return `${params.selectedPeriods.length} periodos: ${formatPeriodMonthLabel(first)} a ${formatPeriodMonthLabel(last)}`;
}

function getYtdPerformancePeriods(periodMonth: string | null, availablePeriods: string[]) {
  if (!periodMonth) return [];
  const yearStart = `${periodMonth.slice(0, 4)}-01-01`;
  return availablePeriods
    .filter((period) => period >= yearStart && period <= periodMonth)
    .sort((a, b) => a.localeCompare(b));
}

function CoverageCell({
  metric,
  detail,
  row,
  periodLabel,
  canAudit,
  onAudit,
}: {
  metric: MetricKey;
  detail: RankingMetricDetail;
  row: RankingPerformanceRow;
  periodLabel: string;
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
          onClick={() => onAudit({ metric, detail, row, periodLabel })}
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
  periodLabel: string;
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
          <p>Periodo usado: <span className="font-semibold">{payload.periodLabel || "-"}</span></p>
          <p>{labels.numerator}: <span className="font-semibold">{formatMetricNumber(payload.detail.numerator, payload.metric)}</span></p>
          <p>{labels.denominator}: <span className="font-semibold">{formatMetricNumber(payload.detail.denominator, payload.metric)}</span></p>
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

          {contest.notes ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-800">Nota</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-amber-900">{contest.notes}</p>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function PerformanceTable({
  rows,
  periodLabel,
  canAudit,
}: {
  rows: RankingPerformanceRow[];
  periodLabel: string;
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
              <th className="px-4 py-3">Cobertura CPD</th>
              <th className="px-4 py-3">Cobertura Ayudas Visuales</th>
              <th className="px-4 py-3">Cobertura Documentacion 48 hrs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2fb] bg-white">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-l-4 hover:bg-[#f8fbff] ${row.meet ? "border-green-500" : "border-red-500"}`}
              >
                <td className="px-4 py-3 font-semibold text-[#1e3a8a]">{row.nombre}</td>
                <td className="px-4 py-3 text-[#334155]">{row.territorio}</td>
                <td className="px-4 py-3">
                  <CoverageCell metric="callPlanAdherence" detail={row.callPlanAdherence} row={row} periodLabel={periodLabel} canAudit={canAudit} onAudit={setAudit} />
                </td>
                <td className="px-4 py-3">
                  <CoverageCell metric="coberturaCpd" detail={row.coberturaCpd} row={row} periodLabel={periodLabel} canAudit={canAudit} onAudit={setAudit} />
                </td>
                <td className="px-4 py-3">
                  <CoverageCell metric="ayudasVisuales" detail={row.ayudasVisuales} row={row} periodLabel={periodLabel} canAudit={canAudit} onAudit={setAudit} />
                </td>
                <td className="px-4 py-3">
                  <CoverageCell metric="documentacion48h" detail={row.documentacion48h} row={row} periodLabel={periodLabel} canAudit={canAudit} onAudit={setAudit} />
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

export function PerfilRankingClient({ data, initialTab = "concursos" }: Props) {
  const router = useRouter();
  const [isRankingNavigationPending, startRankingNavigation] = useTransition();
  const [isPerformanceNavigationPending, startPerformanceNavigation] = useTransition();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [query, setQuery] = useState("");
  const [territoryFilter, setTerritoryFilter] = useState("");
  const [draftPerformanceMode, setDraftPerformanceMode] = useState<"ytd" | "custom">(data.performanceMode);
  const [draftPerformancePeriods, setDraftPerformancePeriods] = useState<string[]>(data.selectedPerformancePeriods);
  const hasContestRankingData = Boolean(data.contestRankingData.maxCoveragePeriodMonth);
  const ytdPerformancePeriods = useMemo(
    () => getYtdPerformancePeriods(data.periodMonth, data.availablePeriods),
    [data.periodMonth, data.availablePeriods],
  );
  const selectedPeriodSet = useMemo(() => new Set(draftPerformancePeriods), [draftPerformancePeriods]);
  const performanceSelectionLabel = formatPerformanceSelectionLabel({
    mode: data.performanceMode,
    selectedPeriods: data.selectedPerformancePeriods,
    periodLabel: data.periodLabel,
  });
  const draftHasChanges =
    draftPerformanceMode !== data.performanceMode ||
    draftPerformancePeriods.join(",") !== data.selectedPerformancePeriods.join(",");

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

  function navigatePerformancePeriods(nextMode: "ytd" | "custom", nextPeriods: string[]) {
    const params = new URLSearchParams();
    params.set("tab", "performance");
    if (data.periodMonth) params.set("period", data.periodMonth);
    if (nextMode === "custom" && nextPeriods.length > 0) {
      params.set("perfPeriods", nextPeriods.join(","));
    }
    startPerformanceNavigation(() => {
      router.push(`/perfil/ranking?${params.toString()}`);
    });
  }

  return (
    <div className="mt-6 grid gap-4">
      

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
            disabled={isRankingNavigationPending}
            onClick={() => {
              if (tab.key === "ranking" && !hasContestRankingData) {
                const params = new URLSearchParams();
                params.set("tab", "ranking");
                if (data.periodMonth) params.set("period", data.periodMonth);
                startRankingNavigation(() => {
                  router.push(`/perfil/ranking?${params.toString()}`);
                });
                return;
              }
              setActiveTab(tab.key);
            }}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition disabled:cursor-wait disabled:opacity-60 ${
              activeTab === tab.key
                ? "border-[#002b7f] bg-[#002b7f] text-white"
                : "border-[#d0d5dd] bg-white text-[#334155] hover:bg-[#f8fafc]"
            }`}
          >
            {tab.key === "ranking" && isRankingNavigationPending ? "Cargando ranking..." : tab.label}
          </button>
        ))}
      </div>

      {isRankingNavigationPending ? (
        <div className="flex items-center gap-3 rounded-xl border border-[#d8e3f8] bg-[#f8fbff] px-4 py-3 text-sm font-medium text-[#1e3a8a]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#bfd3ff] border-t-[#1e3a8a]" />
          Cargando ranking
        </div>
      ) : null}

      {activeTab === "performance" ? (

        <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">Periodo analizado</p>
            <p className="mt-1 text-lg font-semibold text-[#002b7f]">
              {performanceSelectionLabel}
            </p>
            <p className="mt-1 text-sm text-[#667085]">
              Alcance: {data.scope === "all" ? "general" : data.scope === "manager_team" ? "equipo manager" : "individual"}
            </p>
          </div>
          {data.availablePeriods.length > 0 ? (
            <div className="max-w-3xl">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isPerformanceNavigationPending}
                  onClick={() => {
                    setDraftPerformanceMode("ytd");
                    setDraftPerformancePeriods(ytdPerformancePeriods);
                  }}
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
                    draftPerformanceMode === "ytd"
                      ? "border-[#002b7f] bg-[#002b7f] text-white"
                      : "border-[#d0d5dd] bg-white text-[#475467] hover:bg-[#f8fafc]"
                  }`}
                >
                  YTD
                </button>
              {data.availablePeriods.map((period) => (
                <button
                  key={period}
                  type="button"
                  disabled={isPerformanceNavigationPending}
                  onClick={() => {
                    const next = new Set(draftPerformanceMode === "custom" ? draftPerformancePeriods : []);
                    if (next.has(period)) {
                      next.delete(period);
                    } else {
                      next.add(period);
                    }
                    const nextPeriods = Array.from(next).sort((a, b) => a.localeCompare(b));
                    setDraftPerformanceMode(nextPeriods.length > 0 ? "custom" : "ytd");
                    setDraftPerformancePeriods(nextPeriods.length > 0 ? nextPeriods : ytdPerformancePeriods);
                  }}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:cursor-wait disabled:opacity-60 ${
                    selectedPeriodSet.has(period)
                      ? "border-[#bfd3ff] bg-[#eaf2ff] text-[#002b7f]"
                      : "border-[#d0d5dd] bg-white text-[#475467] hover:bg-[#f8fafc]"
                  }`}
                >
                  {formatPeriodMonthLabel(period)}
                </button>
              ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isPerformanceNavigationPending || !draftHasChanges}
                  onClick={() => navigatePerformancePeriods(draftPerformanceMode, draftPerformancePeriods)}
                  className="rounded-lg border border-[#002b7f] bg-[#002b7f] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#001f5c] disabled:cursor-not-allowed disabled:border-[#d0d5dd] disabled:bg-[#eef2f7] disabled:text-[#98a2b3]"
                >
                  Aplicar
                </button>
                <button
                  type="button"
                  disabled={isPerformanceNavigationPending || !draftHasChanges}
                  onClick={() => {
                    setDraftPerformanceMode(data.performanceMode);
                    setDraftPerformancePeriods(data.selectedPerformancePeriods);
                  }}
                  className="rounded-lg border border-[#d0d5dd] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Descartar
                </button>
                <p className="text-xs text-[#667085]">
                  Prepara la seleccion y aplica para recalcular la tabla.
                </p>
              </div>
            </div>
          ) : null}
        </div>
        {isPerformanceNavigationPending ? (
          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-[#1e3a8a]">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#bfd3ff] border-t-[#1e3a8a]" />
            Recalculando performance
          </div>
        ) : null}
      </div>
      ) : null}

      {activeTab === "performance" ? (


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
        <PerformanceTable rows={filteredRows} periodLabel={performanceSelectionLabel} canAudit={true} />
      ) : (
        <RankingConcurso
          data={data.contestRankingData}
          contestOptions={data.contestsData.contests}
          periodMonth={data.periodMonth}
        />
      )}
    </div>
  );
}
