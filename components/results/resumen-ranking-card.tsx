import Link from "next/link";
import { formatPeriodMonthLabel } from "@/lib/admin/incentive-rules/shared";
import { formatCoveragePercent, getCoverageBadgeClass } from "@/lib/ranking/coverage";

type RankingMetric = {
  total: number;
  onTime: number;
  coverage: number;
  threshold: number;
};

export type RankingSummaryCardData = {
  periodMonth: string | null;
  callPlanAdherence: {
    visitas: number;
    objetivo: number;
    coverage: number;
    threshold: number;
    hasGarantia: boolean;
    garantiaPeriod: string | null;
  };
  coberturaCpd: {
    cpdYtd: number;
    objectiveCpd: number;
    coverage: number;
    threshold: number | null;
  };
  ayudasVisuales: RankingMetric;
  documentacion48h: RankingMetric;
  message?: string | null;
};

type ResumenRankingCardProps = {
  title?: string;
  data: RankingSummaryCardData;
  scope?: "individual" | "team";
};

function formatInteger(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number) {
  return formatCoveragePercent(value);
}

function formatMetricValue(value: number, variant: "integer" | "decimal") {
  if (variant === "decimal") {
    return new Intl.NumberFormat("es-MX", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return formatInteger(value);
}

function MetricTile({
  title,
  topLabel,
  topValue,
  bottomLabel,
  bottomValue,
  coverage,
  threshold,
  badge,
  valueVariant = "integer",
}: {
  title: string;
  topLabel: string;
  topValue: number;
  bottomLabel: string;
  bottomValue: number;
  coverage: number;
  threshold: number | null;
  badge?: string;
  valueVariant?: "integer" | "decimal";
}) {
  const badgeThreshold = Number.isFinite(Number(threshold)) ? Number(threshold) : 1;
  return (
    <article className="rounded-xl border border-[#d9e5fb] bg-[#f8fbff] p-4">
      <p className="text-sm font-semibold text-[#1e3a8a]">{title}</p>
      <div className="mt-2 space-y-1 text-sm text-[#334155]">
        <p>
          {topLabel}: <span className="font-semibold">{formatMetricValue(topValue, valueVariant)}</span>
        </p>
        <p>
          {bottomLabel}: <span className="font-semibold">{formatMetricValue(bottomValue, valueVariant)}</span>
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getCoverageBadgeClass(coverage, badgeThreshold)}`}
        >
          Cobertura: {formatPercent(coverage)}
        </span>
        {threshold !== null ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#475467]">
            Meta: {formatPercent(threshold)}
          </span>
        ) : null}
        {badge ? (
          <span className="rounded-full bg-[#fff4ce] px-2.5 py-1 text-xs font-semibold text-[#7a4d00]">
            {badge}
          </span>
        ) : null}
      </div>
    </article>
  );
}

export function ResumenRankingCard({
  title = "Resumen de ranking",
  data,
  scope = "individual",
}: ResumenRankingCardProps) {
  const isTeamScope = scope === "team";

  return (
    <section className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#1e3a8a]">{title}</p>
          <p className="mt-1 text-xs text-[#667085]">
            {data.periodMonth
              ? `YTD ${formatPeriodMonthLabel(data.periodMonth)}`
              : "Periodo no disponible"}
          </p>
        </div>
      </div>

      {data.message ? (
        <p className="mt-3 rounded-lg border border-[#fecdca] bg-[#fff6f5] px-3 py-2 text-xs text-[#7a271a]">
          {data.message}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <MetricTile
          title="Call Plan Adherence T1"
          topLabel={isTeamScope ? "Visitas totales" : "Visitas"}
          topValue={data.callPlanAdherence.visitas}
          bottomLabel={isTeamScope ? "Objetivo total" : "Objetivo"}
          bottomValue={data.callPlanAdherence.objetivo}
          coverage={data.callPlanAdherence.coverage}
          threshold={data.callPlanAdherence.threshold}
          badge={
            data.callPlanAdherence.hasGarantia && data.callPlanAdherence.garantiaPeriod
              ? `Garantía (${formatPeriodMonthLabel(data.callPlanAdherence.garantiaPeriod)})`
              : data.callPlanAdherence.hasGarantia
                ? "Garantía activa"
                : undefined
          }
        />

        <MetricTile
          title="Cobertura CPD"
          topLabel="CPD YTD"
          topValue={data.coberturaCpd.cpdYtd}
          bottomLabel="Objetivo"
          bottomValue={data.coberturaCpd.objectiveCpd}
          coverage={data.coberturaCpd.coverage}
          threshold={data.coberturaCpd.threshold}
          valueVariant="decimal"
        />

        <MetricTile
          title="Porcentaje de utilización de ayudas visuales"
          topLabel="Visitas con ayuda visual"
          topValue={data.ayudasVisuales.onTime}
          bottomLabel="Total de visitas"
          bottomValue={data.ayudasVisuales.total}
          coverage={data.ayudasVisuales.coverage}
          threshold={data.ayudasVisuales.threshold}
        />

        <MetricTile
          title="Documentación en 48 hrs"
          topLabel="Documentadas en 48 hrs"
          topValue={data.documentacion48h.onTime}
          bottomLabel="Total de visitas"
          bottomValue={data.documentacion48h.total}
          coverage={data.documentacion48h.coverage}
          threshold={data.documentacion48h.threshold}
        />
      </div>

      <div className="mt-4">
        <Link
          href="/perfil/ranking"
          className="inline-flex items-center rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-medium text-[#334155] transition hover:bg-[#f8fafc]"
        >
          Consultar Ranking
        </Link>
      </div>
    </section>
  );
}
