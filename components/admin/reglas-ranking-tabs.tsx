"use client";

import { useState } from "react";
import { StatusPeriodPicker } from "@/components/admin/status-period-picker";
import { ReglasRankingImportCard } from "@/components/admin/reglas-ranking-import-card";
import { ReglasRankingDetailTable } from "@/components/admin/reglas-ranking-detail-table";
import { RankingContestsCard } from "@/components/admin/ranking-contests-card";
import { RankingParticipationCard } from "@/components/admin/ranking-participation-card";
import type { ReglasRankingPageData } from "@/lib/admin/reglas-ranking/get-reglas-ranking-page-data";
import type { RankingContestsData } from "@/lib/admin/reglas-ranking/get-ranking-contests-data";
import type { RankingParticipationData } from "@/lib/admin/reglas-ranking/get-ranking-participation-data";

type Props = {
  periodInput: string;
  availableStatusPeriodInputs: string[];
  puntosData: ReglasRankingPageData;
  contestsData: RankingContestsData;
  participationData: RankingParticipationData;
};

export function ReglasRankingTabs({
  periodInput,
  availableStatusPeriodInputs,
  puntosData,
  contestsData,
  participationData,
}: Props) {
  const [activeTab, setActiveTab] = useState<"concursos" | "puntos" | "participacion">("concursos");

  return (
    <>
      <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-neutral-500">Admin / Reglas Ranking</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Reglas de Ranking</h1>

        <div className="mt-4 flex flex-wrap gap-2">
           <button
            type="button"
            onClick={() => setActiveTab("concursos")}
            className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
              activeTab === "concursos"
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
            }`}
          >
            Concursos Ranking
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("puntos")}
            className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
              activeTab === "puntos"
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
            }`}
          >
            Puntos Ranking
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("participacion")}
            className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
              activeTab === "participacion"
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
            }`}
          >
            Participación Equipos
          </button>
        </div>
      </header>

      {activeTab === "puntos" ? (
        <>
          <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-950">Periodo de trabajo</h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Mostrando ultima version por <code>team_id</code> del periodo seleccionado.
                </p>
              </div>
              <StatusPeriodPicker
                value={periodInput}
                paramName="period"
                options={availableStatusPeriodInputs}
              />
            </div>
          </section>

          <ReglasRankingImportCard
            periodMonthInput={periodInput}
            rankingOptions={puntosData.rankingOptions}
            puntosRankingLvuOptions={puntosData.puntosRankingLvuOptions}
          />

          <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-950">Detalle</h2>
              <p className="text-sm text-neutral-600">Filas: {puntosData.rows.length}</p>
            </div>

            {!puntosData.complementsStorageReady && puntosData.complementsStorageMessage ? (
              <p className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {puntosData.complementsStorageMessage}
              </p>
            ) : null}

            {puntosData.rows.length === 0 ? (
              <p className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                No se encontraron columnas de ranking en el periodo seleccionado.
              </p>
            ) : (
              <ReglasRankingDetailTable
                rows={puntosData.rows}
                periodMonthInput={periodInput}
                rankingOptions={puntosData.rankingOptions}
                puntosRankingLvuOptions={puntosData.puntosRankingLvuOptions}
              />
            )}
          </section>
        </>
      ) : activeTab === "concursos" ? (
        <RankingContestsCard
          contestsStorageReady={contestsData.contestsStorageReady}
          contestsStorageMessage={contestsData.contestsStorageMessage}
          contests={contestsData.contests}
        />
      ) : (
        <RankingParticipationCard
          storageReady={participationData.storageReady}
          storageMessage={participationData.storageMessage}
          groups={participationData.groups}
          contests={participationData.contests}
        />
      )}
    </>
  );
}
