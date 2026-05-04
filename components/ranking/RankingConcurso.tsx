"use client";

import { useMemo, useState } from "react";
import { formatPeriodMonthLabel } from "@/lib/admin/incentive-rules/shared";
import type { RankingContestData } from "@/lib/ranking-contests/types";
import { ContestRankingTable } from "@/components/ranking/ContestRankingTable";

type RankingView = "qualified" | "not_qualified" | "all";

export function RankingConcurso({ data }: { data: RankingContestData }) {
  const [contestId, setContestId] = useState(data.contests[0]?.id ?? "");
  const [groupFilter, setGroupFilter] = useState("");
  const [rankingView, setRankingView] = useState<RankingView>("qualified");

  const selectedContest = data.contests.find((contest) => contest.id === contestId) ?? data.contests[0] ?? null;
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
        <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">Ranking por concurso</p>
            <select
              value={selectedContest?.id ?? ""}
              onChange={(event) => {
                setContestId(event.target.value);
                setGroupFilter("");
              }}
              className="mt-2 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-semibold text-[#002b7f] outline-none focus:border-[#84adff]"
            >
              {data.contests.map((contest) => (
                <option key={contest.id} value={contest.id}>{contest.contestName}</option>
              ))}
            </select>
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

      <ContestRankingTable rows={filteredRows} />
    </div>
  );
}
