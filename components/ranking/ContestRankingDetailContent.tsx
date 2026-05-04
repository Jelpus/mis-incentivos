"use client";

import { useState } from "react";
import type { ContestRankingRow, CoveragePointDetail } from "@/lib/ranking-contests/types";

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1, style: "percent" }).format(value);
}

function formatPeriodLabel(period: string) {
  if (/^\d{6}$/.test(period)) return `Cobertura ${period.slice(0, 4)}-${period.slice(4, 6)}`;
  return `Cobertura ${period}`;
}

function buildProductPeriodSummaries(details: CoveragePointDetail[]) {
  let cumulativeTotalPoints = 0;
  return Array.from(
    details.reduce((map, detail) => {
      const period = String(detail.period || "-");
      const current = map.get(period) ?? { period, totalPoints: 0, cumulativeTotalPoints: 0 };
      current.totalPoints += detail.points;
      map.set(period, current);
      return map;
    }, new Map<string, { period: string; totalPoints: number; cumulativeTotalPoints: number }>()).values(),
  )
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((summary) => {
      cumulativeTotalPoints += summary.totalPoints;
      return { ...summary, cumulativeTotalPoints };
    });
}

export function ContestRankingDetailContent({ row }: { row: ContestRankingRow }) {
  const teamAverageDetail = row.pointDetails.find((detail) => detail.formula === "team_average");
  const productPointDetails = row.pointDetails.filter((detail) => detail.formula !== "team_average");
  const productPeriodSummaries = buildProductPeriodSummaries(productPointDetails);

  const rawPeriods = teamAverageDetail
    ? (teamAverageDetail.teamMemberPoints ?? []).map((item) => item.period)
    : productPointDetails.map((detail) => detail.period);
  const availablePeriods = Array.from(new Set(rawPeriods.filter(Boolean))).sort((a, b) => b.localeCompare(a));

  const [selectedPeriod, setSelectedPeriod] = useState(availablePeriods[0] ?? "");
  const effectivePeriod = selectedPeriod && availablePeriods.includes(selectedPeriod) ? selectedPeriod : availablePeriods[0] ?? "";
  const selectedTeamMemberPoints = (teamAverageDetail?.teamMemberPoints ?? []).filter((item) => item.period === effectivePeriod);
  const selectedProductPointDetails = productPointDetails.filter((detail) => detail.period === effectivePeriod);

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.4fr]">
        <section className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4">
          <p className="text-sm font-semibold text-[#002b7f]">Calificadores</p>
          <div className="mt-3 grid gap-2">
            {row.componentEvaluations.length === 0 ? (
              <p className="text-sm text-[#667085]">Sin componentes activos.</p>
            ) : row.componentEvaluations.map((item) => (
              <div key={item.componentId} className="rounded-lg border border-[#d8e3f8] bg-white p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-[#334155]">{item.componentName || "-"}</span>
                  <span
                    aria-label={item.passed ? "passed true" : "passed false"}
                    className={`h-3 w-3 rounded-full ${item.passed ? "bg-emerald-500" : "bg-red-500"}`}
                  />
                </div>
                <p className="mt-1 text-xs text-[#667085]">Meta: {item.thresholdValue ?? "-"} | Valor: {String(item.value ?? "-")}</p>
                {item.reason ? <p className="mt-1 text-xs text-amber-700">{item.reason}</p> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[#e3ebfa] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#002b7f]">
                {teamAverageDetail ? "Puntos por equipo" : "Puntos por producto / periodo"}
              </p>
              <p className="mt-1 text-xs text-[#667085]">Selecciona el periodo de cobertura para ver el detalle.</p>
            </div>
            {availablePeriods.length > 0 ? (
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Periodo</label>
                <select
                  value={effectivePeriod}
                  onChange={(event) => setSelectedPeriod(event.target.value)}
                  className="mt-1 rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm text-[#334155] outline-none focus:border-[#84adff]"
                >
                  {availablePeriods.map((period) => (
                    <option key={period} value={period}>{formatPeriodLabel(period)}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {teamAverageDetail ? (
            <div className="mt-4 overflow-auto rounded-lg border border-[#d8e3f8]">
              <table className="min-w-full text-xs">
                <thead className="bg-[#f8fbff] text-left uppercase tracking-[0.08em] text-[#667085]">
                  <tr>
                    <th className="px-3 py-2">Periodo</th>
                    <th className="px-3 py-2">Representante</th>
                    <th className="px-3 py-2 text-right">Puntos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2fb] bg-white">
                  {selectedTeamMemberPoints.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-[#667085]" colSpan={3}>Sin integrantes con puntos para este periodo.</td>
                    </tr>
                  ) : selectedTeamMemberPoints.map((item, index) => (
                    <tr key={`${item.period}-${item.representativeName}-${index}`}>
                      <td className="px-3 py-2 text-[#334155]">{item.period}</td>
                      <td className="px-3 py-2 font-medium text-[#334155]">{item.representativeName}</td>
                      <td className="px-3 py-2 text-right font-semibold text-[#002b7f]">{formatNumber(item.points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 overflow-auto rounded-lg border border-[#d8e3f8] bg-white">
              {selectedProductPointDetails.length === 0 ? (
                <p className="p-3 text-sm text-[#667085]">Sin resultados de cobertura asociados para este periodo.</p>
              ) : (
                <table className="min-w-full text-xs">
                  <thead className="bg-[#f8fbff] text-left uppercase tracking-[0.08em] text-[#667085]">
                    <tr>
                      <th className="px-3 py-2">Periodo</th>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2">Formula</th>
                      <th className="px-3 py-2 text-right">Cobertura</th>
                      <th className="px-3 py-2 text-right">Peso</th>
                      <th className="px-3 py-2 text-right">Puntos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2fb]">
                    {selectedProductPointDetails.map((detail, index) => (
                      <tr key={`${detail.period}-${detail.teamId}-${detail.productName}-${index}`}>
                        <td className="px-3 py-2 text-[#334155]">{detail.period || "-"}</td>
                        <td className="px-3 py-2 text-[#334155]">
                          {detail.productName || "-"}
                          {detail.missingComplement ? <p className="text-[11px] text-amber-700">Falta complemento ranking.</p> : null}
                        </td>
                        <td className="px-3 py-2 font-semibold text-[#475467]">{detail.formula}</td>
                        <td className="px-3 py-2 text-right text-[#334155]">{formatPercent(detail.cappedCoverage)}</td>
                        <td className="px-3 py-2 text-right text-[#334155]">{formatNumber(detail.weight)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-[#002b7f]">{formatNumber(detail.points)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-[#c8d7f2] bg-[#f8fbff] p-4 shadow-sm">
        <p className="text-sm font-semibold text-[#002b7f]">Resumen por Periodo</p>
        <p className="mt-1 text-xs text-[#667085]">Este resumen es acumulado y no depende del selector de cobertura.</p>

        {teamAverageDetail ? (
          <div className="mt-4 grid gap-4">
            <div className="overflow-auto rounded-lg border border-[#d8e3f8] bg-white">
              <table className="min-w-full text-xs">
                <thead className="bg-[#f8fbff] text-left uppercase tracking-[0.08em] text-[#667085]">
                  <tr>
                    <th className="px-3 py-2">Periodo</th>
                    <th className="px-3 py-2 text-right">Puntos periodo</th>
                    <th className="px-3 py-2 text-right">Promedio periodo</th>
                    <th className="px-3 py-2 text-right">Acumulado</th>
                    <th className="px-3 py-2 text-right">Promedio acumulado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2fb] bg-white">
                  {(teamAverageDetail.teamPeriodSummaries ?? []).map((summary) => (
                    <tr key={summary.period}>
                      <td className="px-3 py-2 font-semibold text-[#334155]">{summary.period}</td>
                      <td className="px-3 py-2 text-right text-[#334155]">{formatNumber(summary.totalPoints)}</td>
                      <td className="px-3 py-2 text-right text-[#334155]">{formatNumber(summary.averagePoints)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-[#002b7f]">{formatNumber(summary.cumulativeTotalPoints)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-[#002b7f]">{formatNumber(summary.cumulativeAveragePoints)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Suma equipo</p>
                <p className="mt-1 text-lg font-semibold text-[#002b7f]">{formatNumber(teamAverageDetail.teamTotalPoints ?? 0)}</p>
              </div>
              <div className="rounded-lg bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Miembros activos</p>
                <p className="mt-1 text-lg font-semibold text-[#002b7f]">{formatNumber(teamAverageDetail.teamMembersCount ?? teamAverageDetail.weight)}</p>
              </div>
              <div className="rounded-lg bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Puntos finales</p>
                <p className="mt-1 text-lg font-semibold text-[#002b7f]">{formatNumber(teamAverageDetail.points)}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 overflow-auto rounded-lg border border-[#d8e3f8] bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-[#f8fbff] text-left uppercase tracking-[0.08em] text-[#667085]">
                <tr>
                  <th className="px-3 py-2">Periodo</th>
                  <th className="px-3 py-2 text-right">Puntos periodo</th>
                  <th className="px-3 py-2 text-right">Acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2fb] bg-white">
                {productPeriodSummaries.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-[#667085]" colSpan={3}>Sin resumen por periodo.</td>
                  </tr>
                ) : productPeriodSummaries.map((summary) => (
                  <tr key={summary.period}>
                    <td className="px-3 py-2 font-semibold text-[#334155]">{summary.period}</td>
                    <td className="px-3 py-2 text-right text-[#334155]">{formatNumber(summary.totalPoints)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#002b7f]">{formatNumber(summary.cumulativeTotalPoints)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
