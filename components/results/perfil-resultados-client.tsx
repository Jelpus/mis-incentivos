"use client";

import { useMemo, useState } from "react";
import type { ResultadoPeriodSummary, ResultadosV2Data } from "@/lib/results/get-resultados-v2-data";
import { ResultadosSummaryCard } from "@/components/results/resultados-summary-card";
import { ResultadosTableCard } from "@/components/results/resultados-table-card";
import { ResultadosTrendChart } from "@/components/results/resultados-trend-chart";

type DetailLevel = "basic" | "team" | "full";

type PerfilResultadosClientProps = {
  initialData: ResultadosV2Data;
  initialPeriodSummaries: ResultadoPeriodSummary[];
  detailLevel: DetailLevel;
};

function formatPeriodo(periodCode: string) {
  if (!/^\d{6}$/.test(periodCode)) return periodCode;
  const year = Number(periodCode.slice(0, 4));
  const month = Number(periodCode.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function PerfilResultadosClient({
  initialData,
  initialPeriodSummaries,
  detailLevel,
}: PerfilResultadosClientProps) {
  const [data, setData] = useState<ResultadosV2Data>(initialData);
  const [periodSummaries, setPeriodSummaries] =
    useState<ResultadoPeriodSummary[]>(initialPeriodSummaries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, ResultadosV2Data>>(() =>
    initialData.periodCode ? { [initialData.periodCode]: initialData } : {},
  );

  const selectedPeriod = data.periodCode ?? null;

  const maxRows = useMemo(() => {
    if (detailLevel === "basic") return 120;
    if (detailLevel === "team") return 250;
    return 300;
  }, [detailLevel]);

  async function ensurePeriodSummariesLoaded() {
    if (periodSummaries.length > 0) return;
    try {
      const response = await fetch("/api/profile/resultados/period-summary?maxPeriods=12", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        data?: { periods?: ResultadoPeriodSummary[] };
      };
      const periods = payload.data?.periods ?? [];
      if (periods.length > 0) {
        setPeriodSummaries(periods);
      }
    } catch {
      // non-blocking
    }
  }

  async function handlePeriodChange(periodCode: string) {
    if (loading || periodCode === selectedPeriod) return;

    await ensurePeriodSummariesLoaded();

    if (cache[periodCode]) {
      setData(cache[periodCode]);
      const next = new URL(window.location.href);
      next.searchParams.set("periodo", periodCode);
      window.history.replaceState(null, "", next.toString());
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/profile/resultados?periodo=${encodeURIComponent(periodCode)}&maxRows=${maxRows}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        data?: ResultadosV2Data;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        setError(payload.error ?? "No fue posible cargar resultados para el periodo seleccionado.");
        return;
      }

      setData(payload.data);
      setCache((prev) => ({ ...prev, [periodCode]: payload.data! }));

      const next = new URL(window.location.href);
      next.searchParams.set("periodo", periodCode);
      window.history.replaceState(null, "", next.toString());
    } catch {
      setError("No fue posible conectar para cargar resultados.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 grid gap-4">

      {periodSummaries.length ? (
        <ResultadosTrendChart periods={periodSummaries} />
      ) : null}

      {data.availablePeriods.length ? (

        <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#475467]">
              Periodo
            </p>
            {loading ? <p className="text-xs text-[#667085]">Actualizando...</p> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.availablePeriods.map((periodCode) => {
              const active = periodCode === selectedPeriod;
              return (
                <button
                  key={periodCode}
                  type="button"
                  onClick={() => void handlePeriodChange(periodCode)}
                  disabled={loading}
                  className={
                    active
                      ? "rounded-md border border-[#bfd3ff] bg-[#eaf2ff] px-3 py-1.5 text-xs font-semibold text-[#002b7f]"
                      : "rounded-md border border-[#d0d5dd] bg-white px-3 py-1.5 text-xs font-medium text-[#344054] hover:bg-[#f8fafc] disabled:opacity-70"
                  }
                >
                  {formatPeriodo(periodCode)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-[#fecdca] bg-[#fff6f5] p-4 sm:p-5">
          <p className="text-sm text-[#7a271a]">{error}</p>
        </div>
      ) : null}

      <ResultadosSummaryCard
        title="Resumen de resultados"
        summary={data.summary}
        scope={data.scope}
        periodCode={data.periodCode}
      />

      <ResultadosTableCard title="Detalle de resultados" rows={data.rows} detailLevel={detailLevel} />
    </div>
  );
}
