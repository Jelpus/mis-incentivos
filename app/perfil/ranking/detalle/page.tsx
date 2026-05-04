import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getRankingContestData } from "@/lib/ranking-contests/getRankingContestData";
import { ContestRankingDetailContent } from "@/components/ranking/ContestRankingDetailContent";

function formatPoints(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(value);
}

type DetailPageProps = {
  searchParams?: Promise<{
    contestId?: string;
    participantId?: string;
  }>;
};

export default async function RankingDetallePage({ searchParams }: DetailPageProps) {
  const auth = await getCurrentAuthContext();
  const { user, isActive } = auth;

  if (!user || isActive === false) {
    redirect("/");
  }

  const params = searchParams ? await searchParams : {};
  const contestId = String(params?.contestId ?? "").trim();
  const participantId = String(params?.participantId ?? "").trim();

  if (!contestId || !participantId) {
    redirect("/perfil/ranking");
  }

  const data = await getRankingContestData({ contestId });
  const row = data.rows.find((item) => item.contestId === contestId && item.participantId === participantId);

  if (!row) {
    return (
      <section className="mx-auto w-full max-w-7xl">
        <div className="rounded-2xl border border-[#d8e3f8] bg-white p-6 shadow-[0_12px_30px_rgba(0,32,104,0.08)] sm:p-8">
          <Link href="/perfil/ranking?tab=ranking" className="inline-flex rounded-lg border border-[#c8d7f2] px-3 py-2 text-sm font-semibold text-[#1e3a8a] hover:bg-[#eef5ff]">
            Volver
          </Link>
          <div className="mt-5 rounded-xl border border-dashed border-[#d8e3f8] bg-[#f8fbff] p-6 text-sm text-[#667085]">
            No se encontro el detalle solicitado.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="rounded-2xl border border-[#d8e3f8] bg-white p-6 shadow-[0_12px_30px_rgba(0,32,104,0.08)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">Detalle ranking concurso</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight text-[#002b7f]">{row.participantName}</h1>
            <p className="mt-2 text-sm text-[#4b5f86]">{row.contestName}</p>
          </div>
          <Link href="/perfil/ranking?tab=ranking" className="inline-flex rounded-lg border border-[#c8d7f2] px-3 py-2 text-sm font-semibold text-[#1e3a8a] hover:bg-[#eef5ff]">
            Volver
          </Link>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#667085]">Rank</p>
            <p className="mt-1 text-lg font-semibold text-[#002b7f]">{row.rank ?? "-"}</p>
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
      </div>
    </section>
  );
}

