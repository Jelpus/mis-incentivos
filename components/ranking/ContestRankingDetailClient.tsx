"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ContestRankingRow } from "@/lib/ranking-contests/types";
import { ContestRankingDetailContent } from "@/components/ranking/ContestRankingDetailContent";

function formatPoints(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(value);
}

function LoadingState() {
  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-[#d8e3f8] bg-[#f8fbff] p-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#d8e3f8] border-t-[#1e3a8a]" />
          <div>
            <p className="text-sm font-semibold text-[#002b7f]">Cargando detalle de ranking</p>
            <p className="mt-1 text-xs text-[#667085]">Calculando cobertura, calificadores y puntos.</p>
          </div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-xl border border-[#e3ebfa] bg-[#f8fbff]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.4fr]">
        <div className="h-72 animate-pulse rounded-xl border border-[#e3ebfa] bg-[#f8fbff]" />
        <div className="h-72 animate-pulse rounded-xl border border-[#e3ebfa] bg-white" />
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#d8e3f8] bg-[#f8fbff] p-6 text-sm text-[#667085]">
      {message}
    </div>
  );
}

export function ContestRankingDetailClient({
  contestId,
  participantId,
  periodMonth,
  initialRank,
}: {
  contestId: string;
  participantId: string;
  periodMonth?: string | null;
  initialRank?: number | null;
}) {
  const router = useRouter();
  const [row, setRow] = useState<ContestRankingRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fallbackHref = `/perfil/ranking?tab=ranking${periodMonth ? `&period=${encodeURIComponent(periodMonth)}` : ""}`;

  useEffect(() => {
    const controller = new AbortController();

    const params = new URLSearchParams({ contestId, participantId });
    if (periodMonth) params.set("period", periodMonth);
    fetch(`/api/profile/ranking/detalle?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar el detalle.");
        return payload.row as ContestRankingRow;
      })
      .then((nextRow) => setRow(nextRow))
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar el detalle.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [contestId, participantId, periodMonth]);

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="rounded-2xl border border-[#d8e3f8] bg-white p-6 shadow-[0_12px_30px_rgba(0,32,104,0.08)] sm:p-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">Detalle ranking concurso</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight text-[#002b7f]">
              {row?.participantName ?? "Detalle"}
            </h1>
            <p className="mt-2 text-sm text-[#4b5f86]">{row?.contestName ?? "Ranking concurso"}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
              } else {
                router.push(fallbackHref);
              }
            }}
            className="inline-flex rounded-lg border border-[#c8d7f2] px-3 py-2 text-sm font-semibold text-[#1e3a8a] hover:bg-[#eef5ff]"
          >
            Volver
          </button>
        </div>

        {isLoading ? <LoadingState /> : null}
        {!isLoading && error ? <EmptyState message={error} /> : null}
        {!isLoading && !error && !row ? <EmptyState message="No se encontro el detalle solicitado." /> : null}

        {!isLoading && row ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Rank</p>
                <p className="mt-1 text-lg font-semibold text-[#002b7f]">{row.rank ?? initialRank ?? "-"}</p>
              </div>
              <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Estado</p>
                <p className="mt-1 text-lg font-semibold text-[#002b7f]">{row.qualificationLabel}</p>
              </div>
              <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Calificadores</p>
                <p className="mt-1 text-lg font-semibold text-[#002b7f]">{row.componentsPassed}/{row.componentsTotal}</p>
              </div>
              <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Puntos</p>
                <p className="mt-1 text-lg font-semibold text-[#002b7f]">{formatPoints(row.totalPoints)}</p>
              </div>
            </div>

            <div className="mt-5">
              <ContestRankingDetailContent row={row} />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
