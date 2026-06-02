"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatPeriodMonthLabel } from "@/lib/admin/incentive-rules/shared";
import type { RankingContestRow } from "@/lib/admin/reglas-ranking/get-ranking-contests-data";
import type { RankingContestData } from "@/lib/ranking-contests/types";
import { ContestRankingTable } from "@/components/ranking/ContestRankingTable";

type RankingView = "qualified" | "not_qualified" | "all";

export function RankingConcurso({
  data,
  contestOptions,
  periodMonth,
  initialContestId,
  canExportExcel = false,
}: {
  data: RankingContestData;
  contestOptions?: RankingContestRow[];
  periodMonth?: string | null;
  initialContestId?: string | null;
  canExportExcel?: boolean;
}) {
  const router = useRouter();
  const [isContestNavigationPending, startContestNavigation] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [contestId, setContestId] = useState(
    initialContestId && data.contests.some((contest) => contest.id === initialContestId)
      ? initialContestId
      : data.contests[0]?.id ?? "",
  );
  const [groupFilter, setGroupFilter] = useState("");
  const [rankingView, setRankingView] = useState<RankingView>("qualified");

  const selectedContest = data.contests.find((contest) => contest.id === contestId) ?? data.contests[0] ?? null;
  const options = contestOptions && contestOptions.length > 0
    ? contestOptions.filter((contest) => contest.isActive)
    : data.contests;
  const contestRows = useMemo(
    () => data.rows.filter((row) => row.contestId === selectedContest?.id),
    [data.rows, selectedContest?.id],
  );
  const groups = useMemo(
    () => Array.from(new Set(contestRows.map((row) => row.rankingGroup).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "es")),
    [contestRows],
  );
  const usesRankingGroups = selectedContest?.participationScope === "ranking_groups";
  const effectiveGroupFilter = usesRankingGroups ? groupFilter || groups[0] || "" : "";
  const groupFilteredRows = effectiveGroupFilter ? contestRows.filter((row) => row.rankingGroup === effectiveGroupFilter) : contestRows;
  const filteredRows = groupFilteredRows.filter((row) => {
    const isQualified = row.qualificationStatus === "qualified" || row.qualificationStatus === "no_components";
    if (rankingView === "qualified") return isQualified;
    if (rankingView === "not_qualified") return !isQualified;
    return true;
  });
  const qualified = contestRows.filter((row) => row.qualificationStatus === "qualified" || row.qualificationStatus === "no_components").length;
  const disqualified = contestRows.filter((row) => row.qualificationStatus === "disqualified").length;
  const pending = contestRows.filter((row) => row.qualificationStatus === "pending").length;

  function cleanSheetName(value: string, fallback: string, usedNames: Set<string>) {
    const base = (value || fallback)
      .replace(/[\[\]*?:/\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || fallback;
    let name = base;
    let index = 2;
    while (usedNames.has(name)) {
      const suffix = ` ${index}`;
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
      index += 1;
    }
    usedNames.add(name);
    return name;
  }

  function buildRankingRows(rows: typeof data.rows) {
    return rows.map((row) => ({
      Concurso: row.contestName,
      Rank: row.rank ?? "",
      Participante: row.participantName,
      Alcance: row.scope === "manager" ? "Manager" : "Representante",
      Empleado: row.employeeNumber ?? "",
      Email: row.email ?? "",
      Territorio: row.territory ?? "",
      Team: row.teamId ?? "",
      "Ranking Group": row.rankingGroup ?? "",
      Estado: row.qualificationLabel,
      "Status tecnico": row.qualificationStatus,
      "Calificadores aprobados": row.componentsPassed,
      "Calificadores totales": row.componentsTotal,
      "Puntos totales": row.totalPoints,
    }));
  }

  function buildDetailRows(rows: typeof data.rows) {
    const output: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      if (row.componentEvaluations.length === 0 && row.pointDetails.length === 0) {
        output.push({
          Tipo: "Participante",
          Concurso: row.contestName,
          Participante: row.participantName,
          Rank: row.rank ?? "",
          Territorio: row.territory ?? "",
          Team: row.teamId ?? "",
          "Ranking Group": row.rankingGroup ?? "",
          Estado: row.qualificationLabel,
          Detalle: "Sin calificadores ni puntos detalle",
        });
      }

      for (const evaluation of row.componentEvaluations) {
        output.push({
          Tipo: "Calificador",
          Concurso: row.contestName,
          Participante: row.participantName,
          Rank: row.rank ?? "",
          Territorio: row.territory ?? "",
          Team: row.teamId ?? "",
          "Ranking Group": row.rankingGroup ?? "",
          Componente: evaluation.componentName,
          Meta: evaluation.thresholdValue ?? "",
          Valor: evaluation.value ?? "",
          Aprobado: evaluation.passed ? "Si" : "No",
          Estado: evaluation.status,
          Razon: evaluation.reason ?? "",
          "Periodo inicio": evaluation.periodStart ?? "",
          "Periodo fin": evaluation.periodEnd ?? "",
        });
      }

      for (const detail of row.pointDetails) {
        output.push({
          Tipo: "Puntos",
          Concurso: row.contestName,
          Participante: row.participantName,
          Rank: row.rank ?? "",
          Territorio: row.territory ?? "",
          Team: row.teamId ?? "",
          "Ranking Group": row.rankingGroup ?? "",
          Periodo: detail.period,
          Producto: detail.productName ?? "",
          Formula: detail.formula,
          "Cobertura raw": detail.rawCoverage,
          "Cobertura capped": detail.cappedCoverage,
          Peso: detail.weight,
          Puntos: detail.points,
          "Complemento faltante": detail.missingComplement ? "Si" : "No",
          "Puntos equipo": detail.teamTotalPoints ?? "",
          "Miembros equipo": detail.teamMembersCount ?? "",
        });

        for (const member of detail.teamMemberPoints ?? []) {
          output.push({
            Tipo: "Puntos equipo miembro",
            Concurso: row.contestName,
            Participante: row.participantName,
            Rank: row.rank ?? "",
            Territorio: row.territory ?? "",
            Team: row.teamId ?? "",
            "Ranking Group": row.rankingGroup ?? "",
            Periodo: member.period,
            Representante: member.representativeName,
            Puntos: member.points,
          });
        }
      }
    }
    return output;
  }

  async function exportRankingExcel() {
    try {
      setIsExporting(true);
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const usedNames = new Set<string>();

      for (const contest of data.contests) {
        const rows = data.rows.filter((row) => row.contestId === contest.id);
        const sheetRows = buildRankingRows(rows);
        const sheetName = cleanSheetName(contest.contestName, "Concurso", usedNames);
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheetRows), sheetName);
      }

      const detailRows = buildDetailRows(data.rows);
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), cleanSheetName("Detalles", "Detalles", usedNames));
      const safePeriod = (periodMonth || data.maxCoveragePeriodMonth || "ranking").slice(0, 10).replace(/[^0-9-]/g, "");
      XLSX.writeFile(workbook, `ranking_concursos_${safePeriod}.xlsx`);
    } finally {
      setIsExporting(false);
    }
  }

  if (!data.maxCoveragePeriodMonth) {
    return (
      <div className="rounded-xl border border-dashed border-[#d8e3f8] bg-[#f8fbff] p-6 text-sm text-[#667085]">
        No hay periodo final/publicado para construir el ranking de concursos.
      </div>
    );
  }

  if (data.contests.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#d8e3f8] bg-[#f8fbff] p-6 text-sm text-[#667085]">
        No hay concursos activos configurados.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {data.messages.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {data.messages.map((message) => <p key={message}>{message}</p>)}
        </div>
      ) : null}

      <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4">
        <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">Ranking por concurso</p>
            <select
              value={selectedContest?.id ?? ""}
              disabled={isContestNavigationPending}
              onChange={(event) => {
                const nextContestId = event.target.value;
                setContestId(nextContestId);
                setGroupFilter("");
                if (nextContestId && nextContestId !== selectedContest?.id) {
                  startContestNavigation(() => {
                    const params = new URLSearchParams();
                    params.set("tab", "ranking");
                    params.set("contestId", nextContestId);
                    if (periodMonth) params.set("period", periodMonth);
                    router.push(`/perfil/ranking?${params.toString()}`);
                  });
                }
              }}
              className="mt-2 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-semibold text-[#002b7f] outline-none focus:border-[#84adff] disabled:cursor-wait disabled:bg-[#eef5ff] disabled:text-[#445f95]"
            >
              {options.map((contest) => (
                <option key={contest.id} value={contest.id}>{contest.contestName}</option>
              ))}
            </select>
            {isContestNavigationPending ? (
              <p className="mt-2 flex items-center gap-2 text-xs font-medium text-[#1e3a8a]">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#bfd3ff] border-t-[#1e3a8a]" />
                Cargando concurso
              </p>
            ) : null}
          </div>

          {usesRankingGroups && groups.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">Grupo ranking</p>
              <select
                value={effectiveGroupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
                className="mt-2 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm text-[#334155] outline-none focus:border-[#84adff]"
              >
                {groups.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
            </div>
          ) : null}

          {canExportExcel ? (
            <button
              type="button"
              onClick={exportRankingExcel}
              disabled={isExporting || data.rows.length === 0}
              className="inline-flex justify-center rounded-lg border border-[#002b7f] bg-[#002b7f] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#001f5c] disabled:cursor-not-allowed disabled:border-[#d0d5dd] disabled:bg-[#eef2f7] disabled:text-[#98a2b3]"
            >
              {isExporting ? "Exportando..." : "Descargar Excel"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-[#e3ebfa] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Periodo del concurso</p>
          <p className="mt-1 text-sm font-semibold text-[#002b7f]">
            Inicio: {selectedContest?.coveragePeriodStart ? formatPeriodMonthLabel(selectedContest.coveragePeriodStart) : "-"}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#002b7f]">
            Fin: {selectedContest?.coveragePeriodEnd ? formatPeriodMonthLabel(selectedContest.coveragePeriodEnd) : "-"}
          </p>
        </div>
        <div className="rounded-xl border border-[#e3ebfa] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Periodo de evaluacion actual</p>
          <p className="mt-1 font-semibold text-[#002b7f]">{formatPeriodMonthLabel(data.maxCoveragePeriodMonth)}</p>
        </div>
        <div className="rounded-xl border border-[#e3ebfa] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Cuando se paga?</p>
          <p className="mt-1 font-semibold text-[#002b7f]">
            {selectedContest?.paymentDate ? formatPeriodMonthLabel(selectedContest.paymentDate) : "-"}
          </p>
        </div>
        <div className="rounded-xl border border-[#e3ebfa] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Participantes</p>
          <p className="mt-1 font-semibold text-[#002b7f]">{contestRows.length}</p>
        </div>
        <div className="rounded-xl border border-[#e3ebfa] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Estado</p>
          <p className="mt-1 text-sm font-semibold text-[#002b7f]">{qualified} calificados | {disqualified} descalificados | {pending} pendientes</p>
        </div>
      </div>

      {selectedContest?.notes ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-800">Nota del concurso</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-amber-900">{selectedContest.notes}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {[
          { key: "qualified" as const, label: "Calificados" },
          { key: "not_qualified" as const, label: "No calificados" },
          { key: "all" as const, label: "Todos" },
        ].map((view) => (
          <button
            key={view.key}
            type="button"
            onClick={() => setRankingView(view.key)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
              rankingView === view.key
                ? "border-[#002b7f] bg-[#002b7f] text-white"
                : "border-[#d0d5dd] bg-white text-[#334155] hover:bg-[#f8fafc]"
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>

      <ContestRankingTable rows={filteredRows} periodMonth={periodMonth} />
    </div>
  );
}
