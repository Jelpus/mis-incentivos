import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { ContestRankingDetailClient } from "@/components/ranking/ContestRankingDetailClient";

type DetailPageProps = {
  searchParams?: Promise<{
    contestId?: string;
    participantId?: string;
    rank?: string;
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
  const rank = Number(params?.rank ?? NaN);

  if (!contestId || !participantId) {
    redirect("/perfil/ranking");
  }

  return (
    <ContestRankingDetailClient
      contestId={contestId}
      participantId={participantId}
      initialRank={Number.isFinite(rank) ? rank : null}
    />
  );
}

