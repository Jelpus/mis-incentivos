import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getPerfilRankingData } from "@/lib/profile/ranking-data";
import { PerfilRankingClient } from "@/components/profile/perfil-ranking-client";

type RankingPageProps = {
  searchParams?: Promise<{
    period?: string;
  }>;
};

export default async function PerfilRankingPage({ searchParams }: RankingPageProps) {
  const auth = await getCurrentAuthContext();
  const { user, role, isActive, effectiveUserId } = auth;

  if (!user || isActive === false) {
    redirect("/");
  }

  const params = searchParams ? await searchParams : {};
  const data = await getPerfilRankingData({
    role,
    profileUserId: effectiveUserId ?? user.id,
    requestedPeriod: params?.period ?? null,
  });

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="rounded-2xl border border-[#d8e3f8] bg-white p-6 shadow-[0_12px_30px_rgba(0,32,104,0.08)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">
          Perfil
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-[#002b7f]">
          Ranking
        </h1>
        <p className="mt-3 text-sm text-[#4b5f86]">
          Concursos, performance y ranking con alcance segun rol.
        </p>

        <PerfilRankingClient data={data} />
      </div>
    </section>
  );
}
