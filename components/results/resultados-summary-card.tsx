"use client";

import type { ResultadoScope, ResultadoSummary } from "@/lib/results/get-resultados-v2-data";

type ResultadosSummaryCardProps = {
  summary: ResultadoSummary;
  scope: ResultadoScope;
  periodCode: string | null;
  title?: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPeriodLabel(periodCode: string | null) {
  if (!periodCode || !/^\d{6}$/.test(periodCode)) return "-";
  const year = Number(periodCode.slice(0, 4));
  const month = Number(periodCode.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(date);
}

function scopeLabel(scope: ResultadoScope) {
  if (scope === "all") return "Global";
  if (scope === "manager_team") return "Equipo";
  return "Individual";
}

export function ResultadosSummaryCard({
  summary,
  scope,
  periodCode,
  title = "Resultados",
}: ResultadosSummaryCardProps) {
  return (
    <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#1e3a8a]">{title}</p>
          <p className="mt-1 text-xs text-[#64748b]">
            Alcance: {scopeLabel(scope)} | Periodo: {formatPeriodLabel(periodCode)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[#d9e5fb] bg-white p-3">
          <p className="text-xs text-[#64748b]">Pago resultado</p>
          <p className="mt-1 text-base font-semibold text-[#0f172a]">
            {formatCurrency(summary.totalPagoResultado)}
          </p>
        </div>
        <div className="rounded-lg border border-[#d9e5fb] bg-white p-3">
          <p className="text-xs text-[#64748b]">Pago variable</p>
          <p className="mt-1 text-base font-semibold text-[#0f172a]">
            {formatCurrency(summary.totalPagoVariable)}
          </p>
        </div>
        <div className="rounded-lg border border-[#d9e5fb] bg-white p-3">
          <p className="text-xs text-[#64748b]">Cobertura promedio</p>
          <p className="mt-1 text-base font-semibold text-[#0f172a]">
            {formatPercent(summary.totalPagoResultado / summary.totalPagoVariable)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-[#667085]">Filas analizadas: {summary.rowCount}</p>
    </div>
  );
}
